'use strict';
const {Op}=require('sequelize');
const bcrypt=require('bcryptjs');
const crypto=require('crypto');
const db=require('../config/database');
const Usuario=require('../models/Usuario');
const Recuperacion=require('../models/RecuperacionContrasena');
const email=require('../services/email.service');
const GENERICO='Si existe una cuenta activa con un correo registrado, recibirás un enlace para restablecer tu contraseña.';
const hash=token=>crypto.createHash('sha256').update(token).digest('hex');
const fuerte=v=>typeof v==='string'&&v.length>=8&&Buffer.byteLength(v,'utf8')<=72&&
 /[a-z]/.test(v)&&/[A-Z]/.test(v)&&/\d/.test(v);

async function solicitar(req,res){
 const identificador=String(req.body?.identificador||'').trim().toLowerCase();
 if(!identificador||identificador.length>190)return res.status(400).json({ok:false,message:'Ingresa tu usuario o correo registrado.'});
 try{
  const usuario=await Usuario.findOne({where:{[Op.or]:[{nombreUsuario:identificador},{correo:identificador}]},
   attributes:['id','correo','estatus','cuentaAceptada']});
  if(usuario?.estatus==='ACTIVO'&&usuario.cuentaAceptada!==false&&
     /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(usuario.correo||''))){
   const recientes=await Recuperacion.count({where:{usuarioId:usuario.id,creadoEn:{[Op.gte]:new Date(Date.now()-15*60*1000)}}});
   if(recientes<3){
    const token=crypto.randomBytes(32).toString('hex');
    const registro=await Recuperacion.create({usuarioId:usuario.id,tokenHash:hash(token),
     venceEn:new Date(Date.now()+20*60*1000)});
    try{await email.enviarRecuperacionContrasena({destinatario:usuario.correo,token});}
    catch(e){
     await registro.destroy().catch(()=>{});
     console.warn('[Auth] No se pudo enviar el enlace de recuperación por SMTP.');
    }
   }
  }
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,message:GENERICO});
 }catch(e){
  console.error('[Auth] Recuperación no disponible:',e.name);
  return res.status(503).json({ok:false,message:'La recuperación no está disponible temporalmente. Intenta de nuevo.'});
 }
}
async function confirmar(req,res){
 const token=String(req.body?.token||'');
 const nueva=req.body?.contrasenaNueva;
 if(!/^[a-f0-9]{64}$/.test(token))return res.status(400).json({ok:false,message:'El enlace no es válido. Solicita uno nuevo.'});
 if(!fuerte(nueva))return res.status(400).json({ok:false,message:'Usa al menos 8 caracteres con mayúscula, minúscula y número.'});
 try{
  const contrasenaHash=await bcrypt.hash(nueva,12);
  const ok=await db.transaction(async transaction=>{
   const registro=await Recuperacion.findOne({where:{tokenHash:hash(token)},
    transaction,lock:transaction.LOCK.UPDATE});
   if(!registro||registro.utilizadoEn||new Date(registro.venceEn).getTime()<=Date.now())return false;
   const usuario=await Usuario.scope('conContrasena').findByPk(registro.usuarioId,{
    transaction,lock:transaction.LOCK.UPDATE});
   if(!usuario||usuario.estatus!=='ACTIVO'||usuario.cuentaAceptada===false)return false;
   const ahora=new Date();
   await usuario.update({contrasenaHash,sesionVersion:Number(usuario.sesionVersion||0)+1,
    actualizadoEn:ahora},{transaction});
   // Invalida ESTE y todos los enlaces pendientes para la misma cuenta.
   await Recuperacion.update({utilizadoEn:ahora},{where:{usuarioId:usuario.id,utilizadoEn:null},transaction});
   return true;
  });
  if(!ok)return res.status(409).json({ok:false,message:'El enlace venció o ya se utilizó. Solicita uno nuevo.'});
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,message:'Contraseña actualizada. Inicia sesión nuevamente.'});
 }catch(e){
  console.error('[Auth] No se pudo restablecer contraseña:',e.name);
  return res.status(503).json({ok:false,message:'No se pudo cambiar la contraseña. Vuelve a intentarlo.'});
 }
}
module.exports={solicitar,confirmar,fuerte};
