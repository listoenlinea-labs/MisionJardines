const crypto=require('crypto');
const {UsuarioCasa,InvitacionCasa,HistorialVinculo}=require('../models');
const admin=rol=>['SUPER_ADMIN','ADMINISTRADOR'].includes(rol);
const hash=token=>crypto.createHash('sha256').update(String(token)).digest('hex');
function fallo(status,message){return Object.assign(new Error(message),{status});}
async function seleccionarCasa(usuarioId,selected){
 if(selected !== undefined && !/^[1-9][0-9]*$/.test(String(selected))) throw fallo(400,'Vivienda no válida');
 const row=await UsuarioCasa.findOne({where:{usuarioId,activo:true,...(selected!==undefined?{casaId:selected}:{})},order:[['id','ASC']]});
 if(selected!==undefined && !row) throw fallo(403,'No tienes acceso a esa vivienda');
 return row?.casaId || null;
}
async function gestionar(actor,casaId,transaction){
 if(admin(actor.rol)) return;
 const link=await UsuarioCasa.findOne({where:{usuarioId:actor.usuarioId,casaId,activo:true,tipo:'RESPONSABLE'},transaction,...(transaction?{lock:transaction.LOCK.UPDATE}:{})});
 if(!link) throw fallo(403,'Solo el responsable o Administración puede gestionar miembros');
}
function vigente(inv){return inv && !inv.aceptadoEn && !inv.revocadoEn && new Date(inv.expiraEn)>new Date();}
async function invitacion(token,transaction){
 if(!/^[a-f0-9]{64}$/.test(String(token||''))) throw fallo(400,'Invitación no válida');
 const inv=await InvitacionCasa.findOne({where:{tokenHash:hash(token)},transaction,...(transaction?{lock:transaction.LOCK.UPDATE}:{})});
 if(!vigente(inv)) throw fallo(410,'La invitación venció, fue revocada o ya se utilizó');
 return inv;
}
async function vincular({usuarioId,casaId,tipo,actorId,transaction}){
 const [link,created]=await UsuarioCasa.findOrCreate({where:{usuarioId,casaId},defaults:{tipo,activo:true},transaction});
 // Invitations must never downgrade an existing responsible member.
 if(!created) await link.update({activo:true,tipo:link.activo&&link.tipo==='RESPONSABLE'?'RESPONSABLE':tipo,desvinculadoEn:null},{transaction});
 await HistorialVinculo.create({usuarioId,casaId,tipo:link.tipo,actorId,accion:'VINCULAR'},{transaction});
 return link;
}
module.exports={admin,hash,fallo,seleccionarCasa,gestionar,vigente,invitacion,vincular};
