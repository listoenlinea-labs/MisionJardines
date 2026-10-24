const {Op,QueryTypes}=require('sequelize');
const sequelize=require('../config/database');
const { compararDirecciones }=require('../services/direccion-sort.service');
const { seleccionarPadronAnalisis }=require('../services/padron-finanzas.service');
const {tarifaParaCasa}=require('../services/tarifa-mantenimiento.service');
const { calcularAdeudoVivienda }=require('../services/adeudo-vivienda-analisis.service');
const {tagsParaViviendas}=require('../services/analisis-tags.service');
const {Casa,Cuota,PagoReportado,ZkTarjeta,CuotaExtraordinaria,CargoExtraordinario,PagoManualConcepto}=require('../models');
const Egreso=require('../models/Egreso');
const {referenciaEgreso}=require('../services/egreso-referencia.service');
const ReservaCasaClub=require('../models/ReservaCasaClub');
const {crearPorEgreso}=require('../services/cargos-extraordinarios.service');
const {resumenConceptos}=require('../services/resumen-conceptos-analisis.service');
const {historialMantenimiento,historialConcepto}=require('../services/historial-pagos-vivienda.service');
const {ultimosRegistrosPago}=require('../services/ultimo-registro-pago.service');
const mesNombres=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const categorias=['LUZ','AGUA','JARDINERIA','MANTENIMIENTO','CUOTA_EXTRAORDINARIA','OTROS'];
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
  const [casas,cuotas,pagos,egresos,reservasClub,ingresosManuales,historialCuotas,tarjetas,pagosManualesConcepto,cuotasExtras,cargosExtraordinarios,pagosConceptoHistoricos,manualesConceptoHistoricos,reservasAprobadas,comprobantesMantenimiento,foliosRegistrados]=await Promise.all([
   Casa.findAll({attributes:['id','calle','calleCorrecta','numero','nombre','controles','cuotaPorCobrar','exencionesRecargo']}),
   Cuota.findAll({where:{anio,mes:mesName},attributes:['id','casaId','anio','mes','estatusPago','montoPagado','montoCuota','recargo','recargoPagado','saldoPendiente','calleSnapshot','numeroCasaSnapshot','nombrePagador','origenImportacion','referencia','folio','fechaPago','fechaConfirmacion','formaPago']}),
   PagoReportado.findAll({where:{estatus:'VALIDADO',fechaOperacion:{[Op.between]:[start,end]}},attributes:['id','tipoPago','monto','recargo','casaId','fechaOperacion','folioReporte','folioOperacion']}),
   Egreso.findAll({where:{fecha:{[Op.between]:[start,end]}},order:[['fecha','DESC']],limit:2000}),
   ReservaCasaClub.findAll({where:{pagado:true,fechaPago:{[Op.between]:[start,end]}},attributes:['cuotaRecuperacion','depositoGarantia','limpieza','garantiaDevuelta','estatus']}),
   sequelize.query('SELECT tipo, concepto, monto, fecha, referencia FROM ingresos_fraccionamiento WHERE fecha BETWEEN :start AND :end ORDER BY fecha, id',{replacements:{start,end},type:QueryTypes.SELECT}),
   // Historial íntegro para identificar pagos adelantados en 2027 y años posteriores.
   // El saldo sigue limitado al corte pedido por calcularAdeudoVivienda.
   Cuota.findAll({attributes:['id','casaId','anio','mes','estatusPago','montoPagado','montoCuota','recargo','recargoPagado','saldoPendiente','referencia','folio','fechaPago','fechaConfirmacion','formaPago','origenImportacion','confirmadoPorUsuarioId']}),
   ZkTarjeta.findAll({attributes:['id','casaId','numeroTarjeta','nombreDispositivo','departamento','fechaInicio','fechaFin','bloqueado','enControlador','puertasAutorizadas','ultimaLectura']})
   ,PagoManualConcepto.findAll({where:{creadoEn:{[Op.between]:[start+' 00:00:00',end+' 23:59:59']}},attributes:['id','casaId','tipoPago','monto','formaPago','referencia','creadoEn']})
   ,CuotaExtraordinaria.findAll({attributes:['egresoId','id']}),
   CargoExtraordinario.findAll({attributes:['id','casaId','periodo','monto'],include:[{model:CuotaExtraordinaria,as:'cuota',attributes:[],required:true,where:{activo:true}}]}),
   PagoReportado.findAll({where:{tipoPago:{[Op.in]:['EXTRAORDINARIO','CASA_CLUB']},estatus:'VALIDADO'},attributes:['id','casaId','tipoPago','estatus','cargoExtraordinarioId','reservaCasaClubId','monto','recargo','folioReporte','folioOperacion','fechaOperacion','aplicacionCuotas']}),
   PagoManualConcepto.findAll({attributes:['id','casaId','tipoPago','cargoExtraordinarioId','reservaCasaClubId','monto','formaPago','referencia','creadoEn']}),
   ReservaCasaClub.findAll({where:{estatus:'APROBADA'},attributes:['id','casaId','fecha','fechaLimitePago','estatus','cuotaRecuperacion','depositoGarantia','limpieza','pagado']}),
   PagoReportado.findAll({where:{tipoPago:'MANTENIMIENTO',estatus:'VALIDADO'},attributes:['id','casaId','tipoPago','estatus','monto','recargo','folioReporte','folioOperacion','fechaOperacion','aplicacionCuotas']}),
   PagoReportado.findAll({attributes:['casaId','tipoPago','creadoEn','estatus','folioReporte','folioOperacion']})
  ]);
  const registros=ultimosRegistrosPago({reportados:foliosRegistrados,cuotas:historialCuotas,manuales:manualesConceptoHistoricos});
  const byHouse=new Map(cuotas.map(x=>[String(x.casaId),x]));
  const padron=seleccionarPadronAnalisis(casas,cuotas);
  const historiales=new Map();
  for(const cuota of historialCuotas){
   const id=String(cuota.casaId);
   if(!historiales.has(id))historiales.set(id,[]);
   historiales.get(id).push(cuota);
  }
  const porCasa=(rows)=>{
   const map=new Map();
   for(const row of rows){const id=String(row.casaId);if(!map.has(id))map.set(id,[]);map.get(id).push(row);}
   return map;
  };
  const bancosMantenimiento=porCasa(comprobantesMantenimiento);
  const bancosConceptos=porCasa(pagosConceptoHistoricos);
  const manualesConceptos=porCasa(manualesConceptoHistoricos);
  const tagsPorCasa=tagsParaViviendas(padron.casas,tarjetas);
  const streets=new Map();
  const residences=padron.casas.map(h=>{
   const q=byHouse.get(String(h.id));
   const adeudo=calcularAdeudoVivienda(historiales.get(String(h.id))||[],{anio,mes,tarifa:tarifaParaCasa(h),exencionesRecargo:h.exencionesRecargo||[]});
   const cubiertoPorCorte=adeudo.fechaUltimoCortePagado&&adeudo.fechaUltimoCortePagado>=new Date(Date.UTC(anio,mes,10)).toISOString().slice(0,10);
   const status=cubiertoPorCorte?'PAGADO':q?.estatusPago||'PENDIENTE';
   const pagada=status==='PAGADO' || (status==='PAGO_PARCIAL' && num(q?.montoPagado)>0);
   // Pago parcial cuenta como vivienda con algún pago, pero se conserva su estatus.
   const calle=String(h.calleCorrecta||h.calle||'Sin calle');
   if(!streets.has(calle))streets.set(calle,{calle,total:0,pagadas:0,pendientes:0,abonos:0});
   const st=streets.get(calle);
   st.total++;if(pagada)st.pagadas++;else st.pendientes++;
   st.abonos+=num(q?.montoPagado);
   const ultimoPago=historialMantenimiento(historiales.get(String(h.id))||[],bancosMantenimiento.get(String(h.id))||[])[0]||null;
   return {casaId:h.id,calle,numero:h.numero,nombre:h.nombre||q?.nombrePagador||'',tarifaMensual:tarifaParaCasa(h),exencionesRecargo:h.exencionesRecargo||[],saldoFavor:adeudo.saldoFavor||0,ultimoRegistroPago:registros.get(String(h.id)+':MANTENIMIENTO')||null,estatus:status,pagada,montoPagado:num(q?.montoPagado),ultimoPago,saldoPendiente:adeudo.saldoPendiente,ultimoMesPagado:adeudo.ultimoMesPagado,mesesPendientes:adeudo.mesesPendientes,recargosPendientes:adeudo.recargosPendientes,
    tags:tagsPorCasa.get(String(h.id))};
  });
  const calls=[...streets.values()].map(x=>({...x,porcentaje:x.total?Math.round(x.pagadas/x.total*10000)/100:0})).sort((a,b)=>a.calle.localeCompare(b.calle,'es-MX',{numeric:true,sensitivity:'base'}));
  const viviendasConceptos=resumenConceptos({viviendas:residences,cargos:cargosExtraordinarios,reportados:pagosConceptoHistoricos,
   manuales:manualesConceptoHistoricos,reservas:reservasAprobadas,anio,mes});
  for(const tipo of ['EXTRAORDINARIO','CASA_CLUB']){
   for(const row of viviendasConceptos[tipo]){
    const casaId=String(row.casaId);
    row.ultimoRegistroPago=registros.get(casaId+':'+tipo)||null;
    row.ultimoPago=historialConcepto(tipo,bancosConceptos.get(casaId)||[],manualesConceptos.get(casaId)||[])[0]||null;
   }
  }
  const ingresosReportados={mantenimiento:0,extraordinarios:0,casaClub:0};
  for(const p of pagos)ingresosReportados[p.tipoPago==='EXTRAORDINARIO'?'extraordinarios':p.tipoPago==='CASA_CLUB'?'casaClub':'mantenimiento']+=num(p.monto);
  const categoriasGasto=Object.fromEntries(categorias.map(c=>[c,0]));
  for(const e of egresos)categoriasGasto[e.categoria==='PROYECTOS'?'CUOTA_EXTRAORDINARIA':e.categoria]+=num(e.monto);
  const ingresosValidados=ingresosReportados.mantenimiento+ingresosReportados.extraordinarios+ingresosReportados.casaClub;
  const totalManualConcepto=pagosManualesConcepto.reduce((a,p)=>a+num(p.monto),0);
  const manualesCasaClub=pagosManualesConcepto.filter(p=>p.tipoPago==='CASA_CLUB').reduce((a,p)=>a+num(p.monto),0);
  const cobrosHistoricos=cuotas.reduce((a,q)=>a+num(q.montoPagado),0);
  const esCargaHistorica=cuotas.some(q=>String(q.origenImportacion||'').startsWith('EXCEL_'));
  const ingresosAdicionales=ingresosManuales.filter(x=>x.tipo!=='SALDO_INICIAL').reduce((a,x)=>a+num(x.monto),0);
  const saldoInicial=ingresosManuales.filter(x=>x.tipo==='SALDO_INICIAL').reduce((a,x)=>a+num(x.monto),0);
  const ingresosBase=esCargaHistorica ? cobrosHistoricos : ingresosValidados;
  const ingresosParaBalance=ingresosBase+ingresosAdicionales+totalManualConcepto;
  const casaClub={recuperacion:0,limpieza:0,garantiasRecibidas:0,garantiasDevueltas:0};
  for(const r of reservasClub){casaClub.recuperacion+=num(r.cuotaRecuperacion);casaClub.limpieza+=num(r.limpieza);casaClub.garantiasRecibidas+=num(r.depositoGarantia);if(r.garantiaDevuelta)casaClub.garantiasDevueltas+=num(r.depositoGarantia);}
  const totalEgresos=Object.values(categoriasGasto).reduce((a,v)=>a+v,0);
  const pagadas=residences.filter(h=>h.pagada).length;
  // Desglose sin paginación ni filtros del navegador para los cuatro Excel del tablero.
  // Estos movimientos se consultaron ya para construir los mismos indicadores.
  const viviendasPorId=new Map(residences.map(h=>[String(h.casaId),h]));
  const cuotasPeriodoDetalle=cuotas.map(q=>({
   id:q.id,casaId:q.casaId,calle:viviendasPorId.get(String(q.casaId))?.calle||q.calleSnapshot||'',
   numero:viviendasPorId.get(String(q.casaId))?.numero||q.numeroCasaSnapshot||'',
   nombre:viviendasPorId.get(String(q.casaId))?.nombre||q.nombrePagador||'',
   anio:q.anio,mes:q.mes,estatus:q.estatusPago,montoCuota:num(q.montoCuota),montoPagado:num(q.montoPagado),
   recargo:num(q.recargo),saldoPendiente:num(q.saldoPendiente),fechaPago:q.fechaPago||q.fechaConfirmacion||null,
   formaPago:q.formaPago||'',referencia:q.referencia||'',folio:q.folio||'',origen:q.origenImportacion||''
  }));
  const pagosPeriodoDetalle=pagos.map(p=>({id:p.id,casaId:p.casaId,
   calle:viviendasPorId.get(String(p.casaId))?.calle||'',numero:viviendasPorId.get(String(p.casaId))?.numero||'',
   nombre:viviendasPorId.get(String(p.casaId))?.nombre||'',tipo:p.tipoPago,monto:num(p.monto),
   recargo:num(p.recargo),fecha:p.fechaOperacion,referencia:p.folioOperacion||p.folioReporte||''}));
  const manualesConceptoPeriodoDetalle=pagosManualesConcepto.map(p=>({
   id:p.id,casaId:p.casaId,calle:viviendasPorId.get(String(p.casaId))?.calle||'',
   numero:viviendasPorId.get(String(p.casaId))?.numero||'',
   tipo:p.tipoPago,monto:num(p.monto),formaPago:p.formaPago||'',
   referencia:p.referencia||'',fecha:p.creadoEn||null
  }));
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,data:{
   anio,mes,periodo:mesName+' '+anio,
   casas:residences.length,pagadas,pendientes:residences.length-pagadas,
   porcentaje:residences.length?Math.round(pagadas/residences.length*10000)/100:0,
   calles:calls,viviendas:residences.sort(compararDirecciones),viviendasConceptos,
   cuotasPeriodoDetalle,pagosPeriodoDetalle,manualesConceptoPeriodoDetalle,
   padronExcluidos:padron.excluidas,padronDuplicados:padron.duplicadas,
   avisoPadron:padron.excluidas ? 'El porcentaje de cumplimiento excluye '+padron.excluidas+' registros auxiliares, fuera del padrón o de prueba. Los registros, cuotas y pagos originales permanecen en la base de datos.' : '',
   cobrosCuotasRegistrados:cobrosHistoricos,ingresosHistoricos:esCargaHistorica?cobrosHistoricos:0,esCargaHistorica,
   ingresosParaBalance,ingresosAdicionales,totalManualConcepto,saldoInicial,ingresosManuales,
   ingresosReportados,ingresosValidados,manualesCasaClub,casaClub,totalEgresos,balanceReportado:ingresosParaBalance+saldoInicial-totalEgresos,
   egresosCategorias:categoriasGasto,egresos:egresos.map(e=>({...e.toJSON(),tieneCuota:cuotasExtras.some(c=>Number(c.egresoId)===Number(e.id))})),
   avisoConciliacion:esCargaHistorica?'Periodo histórico: cuotas importadas, ingresos adicionales y saldo inicial se calculan una sola vez. Depósitos bancarios validados se muestran aparte sin sumarlos de nuevo.':'Periodo actual: ingresos bancarios validados más ingresos manuales y saldo inicial registrados; las cuotas históricas se muestran aparte para no duplicar depósitos.'
  }});
 }catch(e){return sendErr(res,e);}
}
async function registrarEgreso(req,res){
 try{
  const fecha=String(req.body?.fecha||''),categoria=String(req.body?.categoria||''),concepto=String(req.body?.concepto||'').trim(),monto=Number(req.body?.monto);
  const extraordinaria=categoria==='CUOTA_EXTRAORDINARIA';
  const meses=Number(req.body?.meses),fechaInicio=String(req.body?.fechaInicio||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||new Date(fecha+'T12:00:00Z').toISOString().slice(0,10)!==fecha
     ||!categorias.includes(categoria)||!concepto||concepto.length>250||!Number.isFinite(monto)||monto<=0||monto>100000000)throw fail(400,'Completa fecha, categoría, concepto y monto válidos');
  // Crear y asignar la referencia dentro de una sola transacción. Se deriva
  // del ID persistido; dos egresos concurrentes no comparten referencia.
  const saved=await sequelize.transaction(async transaction=>{
   const row=await Egreso.create({fecha,categoria,concepto,monto,referencia:null,registradoPor:req.usuario.usuarioId},{transaction});
   const referencia=referenciaEgreso(fecha,row.id);
   await row.update({referencia},{transaction});
   const cuota=extraordinaria?await crearPorEgreso({egreso:row,meses,fechaInicio,usuarioId:req.usuario.usuarioId,transaction}):null;
   return {id:row.id,referencia,cuotaExtraordinariaId:cuota?.id||null};
  });
  return res.status(201).json({ok:true,...saved,message:'Egreso registrado con referencia automática'});
 }catch(e){return sendErr(res,e);}
}
async function activarCuotaExistente(req,res){
 try{
  const id=Number(req.params.id),meses=Number(req.body?.meses),fechaInicio=String(req.body?.fechaInicio||'');
  if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Egreso inválido');
  const saved=await sequelize.transaction(async transaction=>{
   const egreso=await Egreso.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!egreso||!['CUOTA_EXTRAORDINARIA','PROYECTOS'].includes(egreso.categoria))throw fail(404,'El egreso no es una cuota extraordinaria');
   if(await CuotaExtraordinaria.findOne({where:{egresoId:id},transaction}))throw fail(409,'Este egreso ya tiene cargos asociados');
   return crearPorEgreso({egreso,meses,fechaInicio,usuarioId:req.usuario.usuarioId,transaction});
  });
  return res.status(201).json({ok:true,id:saved.id,message:'Mensualidades generadas para el egreso histórico'});
 }catch(e){return sendErr(res,e);}
}
// Actualiza exclusivamente la tarifa futura por vivienda. No altera cobros ni TAGs.
async function modificarCuotaPorCobrar(req,res){
 try{
  const casaId=Number(req.params.casaId);
  const cuota=Number(req.body?.cuotaPorCobrar);
  const sinRecargo=req.body?.sinRecargo;
  if(sinRecargo!==undefined&&typeof sinRecargo!=='boolean')throw fail(400,'Valor de exención inválido');
  if(!Number.isSafeInteger(casaId)||casaId<1)throw fail(400,'Vivienda inválida');
  if(!Number.isInteger(cuota)||cuota<1||cuota>10000)
    throw fail(400,'La cuota mensual debe ser un importe entero de $1 a $10,000');
  const resultado=await sequelize.transaction(async transaction=>{
   const casa=await Casa.findByPk(casaId,{transaction,lock:transaction.LOCK.UPDATE});
   if(!casa)throw fail(404,'Vivienda inexistente');
   const anterior=tarifaParaCasa(casa);
   if(anterior!==cuota)await casa.update({cuotaPorCobrar:cuota},{transaction});
   return {casaId,calle:casa.calleCorrecta||casa.calle,numero:casa.numero,
    cuotaPorCobrar:cuota,anterior,sinRecargo:require('../services/recargos-exenciones.service').activo(exenciones)};
  });
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,data:resultado,message:'Cuota mensual de la vivienda actualizada. Los pagos y TAGs anteriores permanecen intactos.'});
 }catch(error){return sendErr(res,error);}
}
module.exports={analizar,registrarEgreso,activarCuotaExistente,modificarCuotaPorCobrar};
