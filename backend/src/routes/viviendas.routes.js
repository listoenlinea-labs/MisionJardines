const router=require('express').Router();
const rateLimit=require('express-rate-limit');
const db=require('../config/database');
const {Usuario,Rol,Casa,UsuarioCasa,InvitacionCasa,HistorialVinculo}=require('../models');
const {autenticarToken}=require('../middlewares/auth.middleware');
const {admin,hash,fallo,gestionar,invitacion,vincular}=require('../services/viviendas.service');
const crypto=require('crypto');
const {enviarInvitacionCasa}=require('../services/email.service');
const run=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){console.error('Viviendas:',e.message);res.status(e.status||500).json({ok:false,message:e.status?e.message:'No fue posible completar la operación'});}};
const casaFields=['id','calle','numero'];
const id=value=>{if(!/^[1-9][0-9]*$/.test(String(value)))throw fallo(400,'Identificador no válido');return String(value);};
router.get('/invitacion/:token',rateLimit({windowMs:60000,limit:30}),run(async(req,res)=>{
 const inv=await invitacion(req.params.token);
 const casa=await Casa.findByPk(inv.casaId,{attributes:casaFields});
 res.json({ok:true,casa,tipo:inv.tipo,expiraEn:inv.expiraEn});
}));
router.use(autenticarToken);
router.get('/mias',run(async(req,res)=>{
 const links=await UsuarioCasa.findAll({where:{usuarioId:req.usuario.usuarioId,activo:true},include:[{model:Casa,as:'casa',attributes:casaFields}],order:[['id','ASC']]});
 res.json({ok:true,viviendas:links,administrador:admin(req.usuario.rol)});
}));
router.get('/administracion/casas',run(async(req,res)=>{
 if(!admin(req.usuario.rol))throw fallo(403,'Solo Administración');
 res.json({ok:true,casas:await Casa.findAll({attributes:casaFields,order:[['calle','ASC'],['numero','ASC']]})});
}));
router.get('/:casaId/miembros',run(async(req,res)=>{
 const casaId=id(req.params.casaId); await gestionar(req.usuario,casaId);
 const miembros=await UsuarioCasa.findAll({where:{casaId},include:[{model:Usuario,as:'usuario',attributes:['id','nombre','apellidoPaterno','correo']}],order:[['id','ASC']]});
 const invitaciones=await InvitacionCasa.findAll({where:{casaId,aceptadoEn:null,revocadoEn:null},attributes:['id','correo','tipo','expiraEn'],order:[['id','DESC']]});
 res.json({ok:true,miembros,invitaciones});
}));
router.post('/:casaId/invitaciones',rateLimit({windowMs:3600000,limit:30}),run(async(req,res)=>{
 const casaId=id(req.params.casaId); const correo=String(req.body.correo||'').trim().toLowerCase();
 const tipo=req.body.tipo||'MIEMBRO';
 if(!/^\S+@\S+\.\S+$/.test(correo)||correo.length>150)throw fallo(400,'Correo no válido');
 if(!['RESPONSABLE','MIEMBRO'].includes(tipo))throw fallo(400,'Tipo no válido');
 if(tipo==='RESPONSABLE'&&!admin(req.usuario.rol))throw fallo(403,'Solo Administración asigna responsables');
 const token=crypto.randomBytes(32).toString('hex');
 const casa=await Casa.findByPk(casaId,{attributes:casaFields}); if(!casa)throw fallo(404,'Vivienda no encontrada');
 const inv=await db.transaction(async transaction=>{
  await gestionar(req.usuario,casaId,transaction);
  return InvitacionCasa.create({casaId,correo,tipo,tokenHash:hash(token),creadoPor:req.usuario.usuarioId,expiraEn:new Date(Date.now()+72*3600000)},{transaction});
 });
 try {await enviarInvitacionCasa({destinatario:correo,token,casa});}
 catch(e){await inv.update({revocadoEn:new Date()});throw fallo(502,'No se pudo enviar el correo. La invitación se anuló; inténtalo de nuevo.');}
 res.status(201).json({ok:true,message:'Invitación enviada. Vence en 72 horas.'});
}));
router.post('/invitaciones/aceptar',run(async(req,res)=>{
 await db.transaction(async transaction=>{
  const inv=await invitacion(req.body.token,transaction);
  const usuario=await Usuario.findByPk(req.usuario.usuarioId,{transaction,lock:transaction.LOCK.UPDATE});
  if(usuario.correo.trim().toLowerCase()!==inv.correo)throw fallo(403,'Inicia sesión con el correo que recibió la invitación');
  await vincular({usuarioId:usuario.id,casaId:inv.casaId,tipo:inv.tipo,actorId:usuario.id,transaction});
  await inv.update({aceptadoEn:new Date()},{transaction});
 });res.json({ok:true,message:'Vivienda vinculada a tu cuenta'});
}));
router.delete('/invitaciones/:id',run(async(req,res)=>{
 await db.transaction(async transaction=>{
  const inv=await InvitacionCasa.findByPk(id(req.params.id),{transaction,lock:transaction.LOCK.UPDATE});
  if(!inv)throw fallo(404,'Invitación no encontrada');
  await gestionar(req.usuario,inv.casaId,transaction);
  if(inv.tipo==='RESPONSABLE'&&!admin(req.usuario.rol))throw fallo(403,'Solo Administración');
  if(inv.aceptadoEn)throw fallo(409,'La invitación ya fue aceptada');
  await inv.update({revocadoEn:new Date()},{transaction});
 });res.json({ok:true,message:'Invitación revocada'});
}));
router.post('/:casaId/miembros',run(async(req,res)=>{
 if(!admin(req.usuario.rol))throw fallo(403,'Solo Administración vincula cuentas directamente');
 const casaId=id(req.params.casaId),tipo=req.body.tipo||'MIEMBRO';
 if(!['RESPONSABLE','MIEMBRO'].includes(tipo))throw fallo(400,'Tipo no válido');
 await db.transaction(async transaction=>{
  const casa=await Casa.findByPk(casaId,{transaction});if(!casa)throw fallo(404,'Vivienda no encontrada');
  const usuario=await Usuario.findOne({where:{correo:String(req.body.correo||'').trim().toLowerCase()},transaction});
  if(!usuario)throw fallo(404,'El correo aún no tiene cuenta. Usa Enviar invitación.');
  await vincular({usuarioId:usuario.id,casaId,tipo,actorId:req.usuario.usuarioId,transaction});
 });res.status(201).json({ok:true,message:'Usuario vinculado'});
}));
router.patch('/:casaId/miembros/:usuarioId',run(async(req,res)=>{
 if(!admin(req.usuario.rol))throw fallo(403,'Solo Administración cambia responsables o desvincula miembros');
 const casaId=id(req.params.casaId),usuarioId=id(req.params.usuarioId);
 const {tipo,activo}=req.body;
 if(!['RESPONSABLE','MIEMBRO'].includes(tipo)||typeof activo!=='boolean')throw fallo(400,'Tipo y estado obligatorios');
 await db.transaction(async transaction=>{
  const link=await UsuarioCasa.findOne({where:{casaId,usuarioId},transaction,lock:transaction.LOCK.UPDATE});
  if(!link)throw fallo(404,'Vinculación no encontrada');
  await link.update({tipo,activo,desvinculadoEn:activo?null:new Date()},{transaction});
  // Outstanding invitations from a removed/demoted responsible member cannot outlive their authority.
  if(!activo||tipo!=='RESPONSABLE')await InvitacionCasa.update({revocadoEn:new Date()},{where:{casaId,creadoPor:usuarioId,aceptadoEn:null,revocadoEn:null},transaction});
  await HistorialVinculo.create({usuarioId,casaId,tipo,actorId:req.usuario.usuarioId,accion:activo?'ACTUALIZAR':'DESVINCULAR'},{transaction});
 });res.json({ok:true,message:'Vinculación actualizada; el historial de pagos se conserva'});
}));
module.exports=router;
