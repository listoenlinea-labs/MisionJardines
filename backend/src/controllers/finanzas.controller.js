const {Op,QueryTypes}=require('sequelize');
const sequelize=require('../config/database');
const { compararDirecciones }=require('../services/direccion-sort.service');
const { seleccionarPadronAnalisis }=require('../services/padron-finanzas.service');
const { calcularAdeudoVivienda }=require('../services/adeudo-vivienda-analisis.service');
const {tagsParaViviendas}=require('../services/analisis-tags.service');
const {Casa,Cuota,PagoReportado,ZkTarjeta}=require('../models');
const Egreso=require('../models/Egreso');
const {referenciaEgreso}=require('../services/egreso-referencia.service');
const ReservaCasaClub=require('../models/ReservaCasaClub');
const mesNombres=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const categorias=['LUZ','AGUA','JARDINERIA','MANTENIMIENTO','PROYECTOS','OTROS'];
const num=x=>Number(x||0);
const fail=(status,message)=>Object.assign(new Error(message),{status});
const sendErr=(res,e)=>{if(!e.status)console.error('[finanzas]',e);return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible consultar las finanzas'});};
function filters(req){
 const anio=Number(req.query.anio||new Date().getFullYear());
 const mes=Number(req.query.mes||new Date().getMonth()+1);
 if(!Number.isInteger(anio)||anio<2020||anio>2100||!Number.isInteger(mes)||mes<1||mes>12)throw fail(400,'Selecciona un mes y año válidos');
 return {anio,mes,mesName:mesNombres[mes-1],start:anio+'-'+String(mes).padStart(2,'0')+'-01',end:new Date(Date.UTC(anio,mes,0)).toISOString().slice(0,10)};
}
async function analizar(req,res){
 try{
  const {anio,mes,mesName,start,end}=filters(req);
  const [casas,cuotas,pagos,egresos,reservasClub,ingresosManuales,historialCuotas,tarjetas]=await Promise.all([
   Casa.findAll({attributes:['id','calle','calleCorrecta','numero','nombre','controles']}),
   Cuota.findAll({where:{anio,mes:mesName},attributes:['id','casaId','estatusPago','montoPagado','montoCuota','saldoPendiente','calleSnapshot','numeroCasaSnapshot','nombrePagador','origenImportacion']}),
   PagoReportado.findAll({where:{estatus:'VALIDADO',fechaOperacion:{[Op.between]:[start,end]}},attributes:['id','tipoPago','monto','recargo','casaId','fechaOperacion']}),
   Egreso.findAll({where:{fecha:{[Op.between]:[start,end]}},order:[['fecha','DESC']],limit:2000}),
   ReservaCasaClub.findAll({where:{pagado:true,fechaPago:{[Op.between]:[start,end]}},attributes:['cuotaRecuperacion','depositoGarantia','limpieza','garantiaDevuelta','estatus']}),
   sequelize.query('SELECT tipo, concepto, monto, fecha, referencia FROM ingresos_fraccionamiento WHERE fecha BETWEEN :start AND :end ORDER BY fecha, id',{replacements:{start,end},type:QueryTypes.SELECT}),
   // Historial íntegro para identificar pagos adelantados en 2027 y años posteriores.
   // El saldo sigue limitado al corte pedido por calcularAdeudoVivienda.
   Cuota.findAll({attributes:['casaId','anio','mes','estatusPago','montoPagado','montoCuota','recargo','saldoPendiente']}),
   ZkTarjeta.findAll({attributes:['id','casaId','numeroTarjeta','nombreDispositivo','departamento','fechaInicio','fechaFin','bloqueado','enControlador','puertasAutorizadas','ultimaLectura']})
  ]);
  const byHouse=new Map(cuotas.map(x=>[String(x.casaId),x]));
  const padron=seleccionarPadronAnalisis(casas,cuotas);
  const historiales=new Map();
  for(const cuota of historialCuotas){
   const id=String(cuota.casaId);
   if(!historiales.has(id))historiales.set(id,[]);
   historiales.get(id).push(cuota);
  }
  const tagsPorCasa=tagsParaViviendas(padron.casas,tarjetas);
  const streets=new Map();
  const residences=padron.casas.map(h=>{
   const q=byHouse.get(String(h.id));
   const adeudo=calcularAdeudoVivienda(historiales.get(String(h.id))||[],{anio,mes});
   const status=q?.estatusPago||'PENDIENTE';
   const pagada=status==='PAGADO' || (status==='PAGO_PARCIAL' && num(q?.montoPagado)>0);
   // Pago parcial cuenta como vivienda con algún pago, pero se conserva su estatus.
   const calle=String(h.calleCorrecta||h.calle||'Sin calle');
   if(!streets.has(calle))streets.set(calle,{calle,total:0,pagadas:0,pendientes:0,abonos:0});
   const st=streets.get(calle);
   st.total++;if(pagada)st.pagadas++;else st.pendientes++;
   st.abonos+=num(q?.montoPagado);
   return {casaId:h.id,calle,numero:h.numero,nombre:h.nombre||q?.nombrePagador||'',estatus:status,pagada,montoPagado:num(q?.montoPagado),saldoPendiente:adeudo.saldoPendiente,ultimoMesPagado:adeudo.ultimoMesPagado,mesesPendientes:adeudo.mesesPendientes,recargosPendientes:adeudo.recargosPendientes,
    tags:tagsPorCasa.get(String(h.id))};
  });
  const calls=[...streets.values()].map(x=>({...x,porcentaje:x.total?Math.round(x.pagadas/x.total*10000)/100:0})).sort((a,b)=>a.calle.localeCompare(b.calle,'es-MX',{numeric:true,sensitivity:'base'}));
  const ingresosReportados={mantenimiento:0,extraordinarios:0};
  for(const p of pagos)ingresosReportados[p.tipoPago==='EXTRAORDINARIO'?'extraordinarios':'mantenimiento']+=num(p.monto);
  const categoriasGasto=Object.fromEntries(categorias.map(c=>[c,0]));
  for(const e of egresos)categoriasGasto[e.categoria]+=num(e.monto);
  const ingresosValidados=ingresosReportados.mantenimiento+ingresosReportados.extraordinarios;
  const cobrosHistoricos=cuotas.reduce((a,q)=>a+num(q.montoPagado),0);
  const esCargaHistorica=cuotas.some(q=>String(q.origenImportacion||'').startsWith('EXCEL_'));
  const ingresosAdicionales=ingresosManuales.filter(x=>x.tipo!=='SALDO_INICIAL').reduce((a,x)=>a+num(x.monto),0);
  const saldoInicial=ingresosManuales.filter(x=>x.tipo==='SALDO_INICIAL').reduce((a,x)=>a+num(x.monto),0);
  const ingresosBase=esCargaHistorica ? cobrosHistoricos : ingresosValidados;
  const ingresosParaBalance=ingresosBase+ingresosAdicionales;
  const casaClub={recuperacion:0,limpieza:0,garantiasRecibidas:0,garantiasDevueltas:0};
  for(const r of reservasClub){casaClub.recuperacion+=num(r.cuotaRecuperacion);casaClub.limpieza+=num(r.limpieza);casaClub.garantiasRecibidas+=num(r.depositoGarantia);if(r.garantiaDevuelta)casaClub.garantiasDevueltas+=num(r.depositoGarantia);}
  const totalEgresos=Object.values(categoriasGasto).reduce((a,v)=>a+v,0);
  const pagadas=residences.filter(h=>h.pagada).length;
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,data:{
   anio,mes,periodo:mesName+' '+anio,
   casas:residences.length,pagadas,pendientes:residences.length-pagadas,
   porcentaje:residences.length?Math.round(pagadas/residences.length*10000)/100:0,
   calles:calls,viviendas:residences.sort(compararDirecciones),
   padronExcluidos:padron.excluidas,padronDuplicados:padron.duplicadas,
   avisoPadron:padron.excluidas ? 'El porcentaje de cumplimiento excluye '+padron.excluidas+' registros auxiliares, fuera del padrón o de prueba. Los registros, cuotas y pagos originales permanecen en la base de datos.' : '',
   cobrosCuotasRegistrados:cobrosHistoricos,ingresosHistoricos:esCargaHistorica?cobrosHistoricos:0,esCargaHistorica,
   ingresosParaBalance,ingresosAdicionales,saldoInicial,ingresosManuales,
   ingresosReportados,ingresosValidados,casaClub,totalEgresos,balanceReportado:ingresosParaBalance+saldoInicial-totalEgresos,
   egresosCategorias:categoriasGasto,egresos:egresos.map(e=>e.toJSON()),
   avisoConciliacion:esCargaHistorica?'Periodo histórico: cuotas importadas, ingresos adicionales y saldo inicial se calculan una sola vez. Depósitos bancarios validados se muestran aparte sin sumarlos de nuevo.':'Periodo actual: ingresos bancarios validados más ingresos manuales y saldo inicial registrados; las cuotas históricas se muestran aparte para no duplicar depósitos.'
  }});
 }catch(e){return sendErr(res,e);}
}
async function registrarEgreso(req,res){
 try{
  const fecha=String(req.body?.fecha||''),categoria=String(req.body?.categoria||''),concepto=String(req.body?.concepto||'').trim(),monto=Number(req.body?.monto);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||new Date(fecha+'T12:00:00Z').toISOString().slice(0,10)!==fecha
     ||!categorias.includes(categoria)||!concepto||concepto.length>250||!Number.isFinite(monto)||monto<=0||monto>100000000)throw fail(400,'Completa fecha, categoría, concepto y monto válidos');
  // Crear y asignar la referencia dentro de una sola transacción. Se deriva
  // del ID persistido; dos egresos concurrentes no comparten referencia.
  const saved=await sequelize.transaction(async transaction=>{
   const row=await Egreso.create({fecha,categoria,concepto,monto,referencia:null,registradoPor:req.usuario.usuarioId},{transaction});
   const referencia=referenciaEgreso(fecha,row.id);
   await row.update({referencia},{transaction});
   return {id:row.id,referencia};
  });
  return res.status(201).json({ok:true,...saved,message:'Egreso registrado con referencia automática'});
 }catch(e){return sendErr(res,e);}
}
module.exports={analizar,registrarEgreso};
