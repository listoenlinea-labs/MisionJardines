const {Op}=require('sequelize');
const {Casa,Cuota,PagoReportado}=require('../models');
const Egreso=require('../models/Egreso');
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
  const [casas,cuotas,pagos,egresos,reservasClub]=await Promise.all([
   Casa.findAll({attributes:['id','calle','numero','nombre']}),
   Cuota.findAll({where:{anio,mes:mesName},attributes:['id','casaId','estatusPago','montoPagado','montoCuota','saldoPendiente','calleSnapshot','numeroCasaSnapshot','nombrePagador']}),
   PagoReportado.findAll({where:{estatus:'VALIDADO',fechaOperacion:{[Op.between]:[start,end]}},attributes:['id','tipoPago','monto','recargo','casaId','fechaOperacion']}),
   Egreso.findAll({where:{fecha:{[Op.between]:[start,end]}},order:[['fecha','DESC']],limit:2000}),
   ReservaCasaClub.findAll({where:{pagado:true,fechaPago:{[Op.between]:[start,end]}},attributes:['cuotaRecuperacion','depositoGarantia','limpieza','garantiaDevuelta','estatus']})
  ]);
  const byHouse=new Map(cuotas.map(x=>[String(x.casaId),x]));
  const streets=new Map();
  const residences=casas.map(h=>{
   const q=byHouse.get(String(h.id));
   const status=q?.estatusPago||'PENDIENTE';
   const pagada=status==='PAGADO';
   const calle=String(h.calle||'Sin calle');
   if(!streets.has(calle))streets.set(calle,{calle,total:0,pagadas:0,pendientes:0,abonos:0});
   const st=streets.get(calle);
   st.total++;if(pagada)st.pagadas++;else st.pendientes++;
   st.abonos+=num(q?.montoPagado);
   return {casaId:h.id,calle,numero:h.numero,nombre:h.nombre||q?.nombrePagador||'',estatus:status,pagada,montoPagado:num(q?.montoPagado),saldoPendiente:num(q?.saldoPendiente)};
  });
  const calls=[...streets.values()].map(x=>({...x,porcentaje:x.total?Math.round(x.pagadas/x.total*10000)/100:0})).sort((a,b)=>a.calle.localeCompare(b.calle,'es'));
  const ingresosReportados={mantenimiento:0,extraordinarios:0};
  for(const p of pagos)ingresosReportados[p.tipoPago==='EXTRAORDINARIO'?'extraordinarios':'mantenimiento']+=num(p.monto);
  const categoriasGasto=Object.fromEntries(categorias.map(c=>[c,0]));
  for(const e of egresos)categoriasGasto[e.categoria]+=num(e.monto);
  const ingresosValidados=ingresosReportados.mantenimiento+ingresosReportados.extraordinarios;
  const casaClub={recuperacion:0,limpieza:0,garantiasRecibidas:0,garantiasDevueltas:0};
  for(const r of reservasClub){casaClub.recuperacion+=num(r.cuotaRecuperacion);casaClub.limpieza+=num(r.limpieza);casaClub.garantiasRecibidas+=num(r.depositoGarantia);if(r.garantiaDevuelta)casaClub.garantiasDevueltas+=num(r.depositoGarantia);}
  const totalEgresos=Object.values(categoriasGasto).reduce((a,v)=>a+v,0);
  const pagadas=residences.filter(h=>h.pagada).length;
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,data:{
   anio,mes,periodo:mesName+' '+anio,
   casas:residences.length,pagadas,pendientes:residences.length-pagadas,
   porcentaje:residences.length?Math.round(pagadas/residences.length*10000)/100:0,
   calles:calls,viviendas:residences,
   cobrosCuotasRegistrados:cuotas.reduce((a,q)=>a+num(q.montoPagado),0),
   ingresosReportados,ingresosValidados,casaClub,totalEgresos,balanceReportado:ingresosValidados-totalEgresos,
   egresosCategorias:categoriasGasto,egresos:egresos.map(e=>e.toJSON()),
   avisoConciliacion:'El balance usa solo depósitos VALIDADOS en Pagos y egresos capturados; las cuotas de la tabla se muestran por separado porque podrían duplicar depósitos. Los cobros de Casa Club se presentan por separado y no se suman automáticamente para evitar duplicarlos con transferencias; tampoco incluye ingresos no bancarizados.'
  }});
 }catch(e){return sendErr(res,e);}
}
async function registrarEgreso(req,res){
 try{
  const fecha=String(req.body?.fecha||''),categoria=String(req.body?.categoria||''),concepto=String(req.body?.concepto||'').trim(),monto=Number(req.body?.monto),referencia=String(req.body?.referencia||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||new Date(fecha+'T12:00:00Z').toISOString().slice(0,10)!==fecha
     ||!categorias.includes(categoria)||!concepto||concepto.length>250||!Number.isFinite(monto)||monto<=0||monto>100000000||referencia.length>120)throw fail(400,'Completa fecha, categoría, concepto y monto válidos');
  const row=await Egreso.create({fecha,categoria,concepto,monto,referencia:referencia||null,registradoPor:req.usuario.usuarioId});
  return res.status(201).json({ok:true,id:row.id,message:'Egreso registrado'});
 }catch(e){return sendErr(res,e);}
}
module.exports={analizar,registrarEgreso};
