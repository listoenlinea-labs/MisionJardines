const {Op}=require('sequelize');
const Reserva=require('../models/ReservaCasaClub');
const {Casa,Usuario,UsuarioCasa}=require('../models');
const db=require('../config/database');
const admin=r=>['SUPER_ADMIN','ADMINISTRADOR'].includes(r);
const error=(status,message)=>Object.assign(new Error(message),{status});
const hoy=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const texto=(v,n=160)=>String(v||'').trim().slice(0,n);
const dinero=v=>Number(v);
const fechaValida=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&!Number.isNaN(Date.parse(String(v)+'T12:00:00Z'))&&new Date(String(v)+'T12:00:00Z').toISOString().slice(0,10)===v;
function manejar(res,e){if(!e.status)console.error('[casa-club]',e);return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No se pudo completar la operación'});}
async function fechas(req,res){
 try{
  const desde=fechaValida(req.query.desde)?req.query.desde:hoy();
  const hasta=fechaValida(req.query.hasta)?req.query.hasta:new Date(Date.parse(desde+'T12:00:00Z')+92*86400000).toISOString().slice(0,10);
  if(hasta<desde||Date.parse(hasta)-Date.parse(desde)>370*86400000)throw error(400,'Rango máximo de 370 días');
  const rows=await Reserva.findAll({where:{fechaBloqueada:{[Op.between]:[desde,hasta]}},attributes:['fecha','estatus']});
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,ocupadas:rows.map(x=>({fecha:x.fecha,estatus:x.estatus}))});
 }catch(e){return manejar(res,e);}
}
async function mias(req,res){
 try {
  const rows=await Reserva.findAll({where:{usuarioId:req.usuario.usuarioId},order:[['fecha','DESC'],['id','DESC']],limit:250});
  const ids=[...new Set(rows.map(x=>x.casaId))],casas=ids.length?await Casa.findAll({where:{id:{[Op.in]:ids}},attributes:['id','calle','numero']}):[];
  const mapa=new Map(casas.map(x=>[Number(x.id),x]));
  return res.json({ok:true,data:rows.map(x=>({...x.toJSON(),casa:mapa.get(Number(x.casaId))||null}))});
 }catch(e){return manejar(res,e);}
}
async function crear(req,res){
 const body=req.body||{};
 const fecha=texto(body.fecha,10),solicitante=texto(body.solicitante,180),telefono=texto(body.telefono,25),correo=texto(body.correo,150),motivo=texto(body.motivo,200);
 const casaId=Number(body.casaId||req.usuario.casaId);
 if(!fechaValida(fecha)||fecha<hoy())return res.status(400).json({ok:false,message:'Selecciona una fecha válida, desde hoy en adelante'});
 if(!solicitante||!telefono||!/^\S+@\S+\.\S+$/.test(correo)||!motivo)return res.status(400).json({ok:false,message:'Completa solicitante, teléfono, correo y motivo'});
 if(!Number.isSafeInteger(casaId)||casaId<=0)return res.status(400).json({ok:false,message:'Selecciona tu vivienda antes de reservar'});
 try{
  const house=await Casa.findByPk(casaId);
  if(!house)throw error(404,'La vivienda no está en el padrón');
  const membership=await UsuarioCasa.findOne({where:{usuarioId:req.usuario.usuarioId,casaId,activo:true}});
  if(!membership&&!admin(req.usuario.rol))throw error(403,'No tienes acceso a esa vivienda');
  const row=await Reserva.create({
   usuarioId:req.usuario.usuarioId,casaId,fecha,fechaBloqueada:fecha,
   solicitante,telefono,correo,motivo,propietario:body.propietario===true,
   estatus:'PENDIENTE'
  });
  return res.status(201).json({ok:true,data:{id:row.id,fecha},message:'Solicitud enviada. Administración debe aprobarla; la fecha queda apartada provisionalmente.'});
 }catch(e){if(e.name==='SequelizeUniqueConstraintError')return res.status(409).json({ok:false,message:'Esta fecha ya está ocupada o pendiente de aprobación'});return manejar(res,e);}
}
async function cancelar(req,res){
 try{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0)throw error(400,'Reserva no válida');
  await db.transaction(async transaction=>{
   const row=await Reserva.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!row||(!admin(req.usuario.rol)&&String(row.usuarioId)!==String(req.usuario.usuarioId)))throw error(404,'Reserva no encontrada');
   if(!['PENDIENTE','APROBADA'].includes(row.estatus))throw error(409,'No se puede cancelar esta reserva');
   if(row.fecha<hoy()&&!admin(req.usuario.rol))throw error(409,'Consulta a Administración para cancelar una fecha pasada');
   await row.update({estatus:'CANCELADA',fechaBloqueada:null,actualizadoEn:new Date(),notas:row.pagado?(texto(row.notas||'',480)+' | Cancelación: revisar devolución con administración').trim():row.notas},{transaction});
  });
  return res.json({ok:true,message:'Reserva cancelada. Si había pagos, Administración debe revisar cualquier devolución.'});
 }catch(e){return manejar(res,e);}
}
async function listar(req,res){
 if(!admin(req.usuario.rol))return res.status(403).json({ok:false,message:'Acceso exclusivo de administración'});
 try{
  const estado=texto(req.query.estatus,15);
  if(estado&&!['PENDIENTE','APROBADA','RECHAZADA','CANCELADA'].includes(estado))throw error(400,'Estado inválido');
  const rows=await Reserva.findAll({where:estado?{estatus:estado}:{},order:[['fecha','DESC']],limit:1000});
  const ids=[...new Set(rows.map(x=>x.casaId))],casas=ids.length?await Casa.findAll({where:{id:{[Op.in]:ids}},attributes:['id','calle','numero']}):[];
  const mapa=new Map(casas.map(x=>[Number(x.id),x]));
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,data:rows.map(x=>({...x.toJSON(),casa:mapa.get(Number(x.casaId))||null}))});
 }catch(e){return manejar(res,e);}
}
async function revisar(req,res){
 if(!admin(req.usuario.rol))return res.status(403).json({ok:false,message:'Acceso exclusivo de administración'});
 const id=Number(req.params.id),action=texto(req.body?.accion,16).toUpperCase();
 if(!Number.isSafeInteger(id)||id<=0||!['APROBAR','RECHAZAR','PAGO','GARANTIA'].includes(action))return res.status(400).json({ok:false,message:'Acción inválida'});
 try{
  await db.transaction(async transaction=>{
   const row=await Reserva.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!row)throw error(404,'Reserva no encontrada');
   if(['APROBAR','RECHAZAR'].includes(action)){
    if(row.estatus!=='PENDIENTE')throw error(409,'La solicitud ya no está pendiente');
    const approved=action==='APROBAR';
    const rec=dinero(req.body?.cuotaRecuperacion??0),dep=dinero(req.body?.depositoGarantia??0),clean=dinero(req.body?.limpieza??0);
    if(approved&&(![rec,dep,clean].every(v=>Number.isFinite(v)&&v>=0&&v<=1000000)))throw error(400,'Importes inválidos');
    await row.update({estatus:approved?'APROBADA':'RECHAZADA',
      fechaBloqueada:approved?row.fecha:null,cuotaRecuperacion:approved?rec:0,
      depositoGarantia:approved?dep:0,limpieza:approved?clean:0,pagado:approved&&req.body.pagado===true,
      fechaPago:approved&&req.body.pagado===true?hoy():null,
      notas:texto(req.body.notas,600),revisadoPor:req.usuario.usuarioId,actualizadoEn:new Date()},{transaction});
   } else {
    if(row.estatus!=='APROBADA')throw error(409,'Solo se registran movimientos de reservas aprobadas');
    if(action==='PAGO')await row.update({pagado:req.body.pagado===true,fechaPago:req.body.pagado===true?texto(req.body.fechaPago,10)||hoy():null,folio:texto(req.body.folio,60)||null,actualizadoEn:new Date()},{transaction});
    else await row.update({garantiaDevuelta:req.body.garantiaDevuelta===true,actualizadoEn:new Date()},{transaction});
   }
  });
  return res.json({ok:true,message:'Cambios guardados correctamente'});
 }catch(e){return manejar(res,e);}
}
module.exports={fechas,mias,crear,cancelar,listar,revisar};
