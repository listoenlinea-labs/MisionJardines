'use strict';
const {Op,fn,col,where}=require('sequelize');
const sequelize=require('../config/database');
const {UsuarioCasa,Casa,PagoReportado}=require('../models');
const cuotas=require('./cuotas-mantenimiento.service');
const calc=require('./cuotas-mantenimiento-calculo');
const {fechaMexico}=require('./vigencia-calculo');
const {validarOperacion}=require('./mensualidades-mantenimiento');
const {normalizar,centavos}=require('./pagos-reparto-calculo');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const {esReparto,resumen}=require('./pagos-reparto-datos');
// El campo JSON existente conserva el depósito único y los planes por vivienda.
// JSON_CONTAINS usa un candidato generado con ID numérico, nunca SQL del cliente.
function condicionCasa(casaId){
 const id=Number(casaId);if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Vivienda inválida');
 return {[Op.or]:[{casaId:id},where(fn('JSON_CONTAINS',col('aplicacion_cuotas'),JSON.stringify({distribuciones:[{casaId:id}]})),1)]};
}
function condicionLectura(casaId,usuarioId){
 if(!usuarioId)return {casaId};
 const grouped=fn('JSON_CONTAINS',col('aplicacion_cuotas'),JSON.stringify({version:3}));
 return {[Op.or]:[
  {[Op.and]:[{casaId}, {[Op.or]:[{aplicacionCuotas:null},where(grouped,0)]}]},
  {[Op.and]:[{usuarioId},where(grouped,1)]}
 ]};
}
async function vinculos(usuarioId,transaction){
 const rows=await UsuarioCasa.findAll({where:{usuarioId,activo:true},attributes:['id','casaId'],order:[['casaId','ASC']],
  ...(transaction?{transaction,lock:transaction.LOCK.UPDATE}:{})});
 return [...new Set(rows.map(r=>Number(r.casaId)))];
}
async function catalogo(usuarioId){
 return sequelize.transaction({isolationLevel:'READ COMMITTED'},async tx=>{
  const ids=await vinculos(usuarioId,tx);
  if(ids.length<=2)return {habilitado:false,viviendas:[]};
  const viviendas=[];
  for(const casaId of ids){
   const d=await cuotas.cargar(casaId,tx);
   const estado=calc.contextoCuotas(d.cuotas,fechaMexico(),d.tarifa,d.exencionesRecargo);
   const pendiente=!!await PagoReportado.findOne({where:{...condicionCasa(casaId),tipoPago:'MANTENIMIENTO',estatus:'PENDIENTE_VALIDACION'},transaction:tx,attributes:['id']});
   viviendas.push({casaId,calle:d.casa.calleCorrecta||d.casa.calle,numero:d.casa.numero,adeudo:estado.adeudoTotal,pendiente});
  }
  return {habilitado:true,viviendas,fecha:fechaMexico()};
 });
}
async function cotizar(usuarioId,rows,total,fecha,transaction){
 const ids=await vinculos(usuarioId,transaction);
 if(ids.length<=2)throw fail(403,'El reparto está disponible solo para cuentas con más de dos viviendas activas.');
 const entries=normalizar(rows,total,ids);
 const distribuciones=[];
 for(const entry of entries){
  const plan=await cuotas.cotizar(entry.casaId,fecha,entry.monto,transaction);
  const casa=await Casa.findByPk(entry.casaId,{transaction,attributes:['id','calle','calleCorrecta','numero']});
  distribuciones.push({...entry,calle:casa.calleCorrecta||casa.calle,numero:casa.numero,plan});
 }
 return {version:3,tipo:'REPARTO_MANTENIMIENTO',monto:Number(total),fechaCalculo:fecha,aplicado:false,distribuciones};
}
async function confirmar(pago,transaction){
 const saved=pago.aplicacionCuotas;
 if(!esReparto(saved)||saved.aplicado)throw fail(409,'El reparto no está disponible para acreditar.');
 const ids=await vinculos(pago.usuarioId,transaction);
 // No volver a exigir >2: una tercera vivienda no asignada puede haberse desvinculado.
 const entries=normalizar(saved.distribuciones,pago.monto,ids);
 if(entries.length!==saved.distribuciones.length)throw fail(409,'El reparto guardado contiene viviendas inválidas.');
 const resultados=[],distribuciones=[];
 for(const entry of entries){
  const original=saved.distribuciones.find(d=>d.casaId===entry.casaId);
  let applied;
  const child={id:pago.id,casaId:entry.casaId,usuarioId:pago.usuarioId,monto:entry.monto,
   folioOperacion:pago.folioOperacion,fechaOperacion:pago.fechaOperacion,nombreReportante:pago.nombreReportante,
   identificadoresVerificados:pago.identificadoresVerificados,aplicacionCuotas:original.plan,
   update:async values=>{applied=values.aplicacionCuotas;}};
  const result=await cuotas.confirmar(child,transaction);
  resultados.push({casaId:entry.casaId,...result});
  distribuciones.push({...original,plan:applied});
 }
 await pago.update({aplicacionCuotas:{...saved,aplicado:true,distribuciones},recargo:distribuciones.reduce((s,d)=>s+centavos(d.plan.recargo),0)/100},{transaction});
 return {fuente:'CUOTAS',reparto:resultados};
}
async function obtenerCatalogo(req,res){
 try{res.setHeader('Cache-Control','private, no-store');return res.json({ok:true,data:await catalogo(req.usuario.usuarioId)});}
 catch(e){return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible consultar las viviendas para repartir el pago.'});}
}
async function cotizacion(req,res){
 try{
  const hoy=fechaMexico();
  const resuelta=require('./fecha-operativa-spei.service').resolverFechaCapturada(req.body.fechaOperacion,req.body.horaOperacion);
  if(!resuelta.ok)throw fail(400,resuelta.mensaje);
  const reportada=resuelta.fechaOperacion;
  const fecha=validarOperacion(reportada>hoy?hoy:reportada,hoy);
  const data=await sequelize.transaction({isolationLevel:'READ COMMITTED'},tx=>cotizar(req.usuario.usuarioId,req.body.reparto,req.body.monto,fecha,tx));
  res.setHeader('Cache-Control','private, no-store');return res.json({ok:true,data:{...data,fechaOperacionReal:reportada}});
 }catch(e){return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible cotizar el reparto.'});}
}
module.exports={esReparto,condicionCasa,condicionLectura,resumen,vinculos,catalogo,cotizar,confirmar,obtenerCatalogo,cotizacion};
