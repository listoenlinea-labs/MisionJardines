'use strict';
const {randomBytes,createHash}=require('node:crypto');
const db=require('../config/database');
const {QueryTypes}=require('sequelize');
const {Usuario,UsuarioCasa,Casa,Rol}=require('../models');
const fail=(status,message)=>Object.assign(Error(message),{status});
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const WEB=()=>String(process.env.APP_BASE_URL||'https://api-misionjardines.listoenlinea.host').replace(/\/$/,'');
const isPhone=v=>/^\d{8,32}$/.test(String(v||''));
async function enlace(phone){
 if(!isPhone(phone))throw fail(400,'Número de WhatsApp inválido');
 const token=randomBytes(32).toString('hex');
 await db.query(`INSERT INTO whatsapp_bot_vinculos (remitente,enlace_hash,enlace_expira_en)
 VALUES(:phone,:hash,DATE_ADD(NOW(),INTERVAL 10 MINUTE))
 ON DUPLICATE KEY UPDATE enlace_hash=VALUES(enlace_hash),enlace_expira_en=VALUES(enlace_expira_en)`,{
  replacements:{phone,hash:hash(token)}
 });
 // El fragmento no se envía en la solicitud HTTP ni en logs del servidor.
 return WEB()+'/whatsapp-vincular.html#clave='+token;
}
async function confirmar({token,usuarioId,casaId}){
 if(!/^[a-f0-9]{64}$/.test(String(token||''))||!Number.isSafeInteger(Number(casaId))||Number(casaId)<1)
  throw fail(400,'Enlace o vivienda inválidos');
 const usuario=await Usuario.findByPk(usuarioId,{include:[{model:Rol,as:'rol',attributes:['nombre','activo']}]});
 if(!usuario||usuario.estatus!=='ACTIVO'||usuario.cuentaAceptada===false||
    usuario.rol?.nombre!=='CONDOMINO'||!usuario.rol?.activo)
  throw fail(403,'Esta cuenta no puede vincularse como residente');
 const miembro=await UsuarioCasa.findOne({where:{usuarioId,casaId,activo:true}});
 if(!miembro)throw fail(403,'Selecciona una vivienda vinculada a tu cuenta');
 const idHash=hash(token);
 return db.transaction(async transaction=>{
  const [row]=await db.query(`SELECT remitente FROM whatsapp_bot_vinculos
   WHERE enlace_hash=:hash AND enlace_expira_en>NOW()
   LIMIT 1 FOR UPDATE`,{type:QueryTypes.SELECT,replacements:{hash:idHash},transaction});
  if(!row)throw fail(410,'El enlace venció o ya fue utilizado. Solicita uno nuevo en WhatsApp');
  // Si el número apunta sin ambigüedad a una cuenta y vivienda, no permitir
  // vincularlo a otra identidad aunque alguien tenga sus propias credenciales.
  const reconocido=await require('./whatsapp-bot-identidad.service').reconocer(row.remitente,{transaction});
  if(reconocido.tipo==='unico'&&(Number(reconocido.usuarioId)!==Number(usuarioId)||
    Number(reconocido.casaId)!==Number(casaId)))
   throw fail(403,'La cuenta y la vivienda no coinciden con el número registrado. Consulta a Administración.');
  await db.query(`UPDATE whatsapp_bot_vinculos SET usuario_id=:usuarioId,casa_id=:casaId,
    sesion_version=:version,autenticado_hasta=DATE_ADD(NOW(),INTERVAL 24 HOUR),
    enlace_hash=NULL,enlace_expira_en=NULL WHERE remitente=:phone`,{
   transaction,replacements:{usuarioId,casaId,version:Number(usuario.sesionVersion||0),phone:row.remitente}
  });
  return true;
 });
}
async function verificar(phone,expectedHouse=null){
 if(!isPhone(phone))return null;
 const [link]=await db.query(`SELECT usuario_id,casa_id,sesion_version
 FROM whatsapp_bot_vinculos WHERE remitente=:phone AND autenticado_hasta>NOW() LIMIT 1`,{
  type:QueryTypes.SELECT,replacements:{phone}
 });
 if(!link||!link.usuario_id||!link.casa_id)return null;
 if(expectedHouse!=null&&Number(expectedHouse)!==Number(link.casa_id))return null;
 const [user,membership,casa]=await Promise.all([
  Usuario.findByPk(link.usuario_id,{include:[{model:Rol,as:'rol',attributes:['nombre','activo']}]}),
  UsuarioCasa.findOne({where:{usuarioId:link.usuario_id,casaId:link.casa_id,activo:true}}),
  Casa.findByPk(link.casa_id,{attributes:['id','calle','calleCorrecta','numero','nombre','correo']})
 ]);
 if(!user||user.estatus!=='ACTIVO'||user.cuentaAceptada===false||
   user.rol?.nombre!=='CONDOMINO'||!user.rol?.activo||!membership||!casa||
   Number(user.sesionVersion||0)!==Number(link.sesion_version||0))return null;
 return {usuarioId:Number(user.id),casaId:Number(casa.id),rol:'CONDOMINO',
  correo:String(user.correo||'').trim().toLowerCase(),
  nombre:[user.nombre,user.apellidoPaterno,user.apellidoMaterno].filter(Boolean).join(' ').trim(),
  casa};
}
async function desvincular(phone){
 if(isPhone(phone))await db.query(`UPDATE whatsapp_bot_vinculos SET usuario_id=NULL,casa_id=NULL,
  sesion_version=NULL,autenticado_hasta=NULL,enlace_hash=NULL,enlace_expira_en=NULL
  WHERE remitente=:phone`,{replacements:{phone}});
}
module.exports={enlace,confirmar,verificar,desvincular};
