'use strict';
const {Op}=require('sequelize');
const {Casa,UsuarioCasa,Usuario}=require('../models');
const mail=require('./email.service');
const recibos=require('./recibo-mantenimiento-analisis.service');
const extras=require('./recibo-extraordinario-analisis.service');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const validEmail=v=>{const email=String(v||'').trim();return email.length<=254&&email.length>=3&&/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email);};
const recent=new Map();
async function correoRegistrado(casa){
 const links=await UsuarioCasa.findAll({where:{casaId:casa.id,activo:true},attributes:['usuarioId']});
 const ids=[...new Set(links.map(l=>Number(l.usuarioId)).filter(Number.isSafeInteger))];
 const users=ids.length?await Usuario.findAll({where:{id:{[Op.in]:ids},estatus:'ACTIVO',cuentaAceptada:true,recibeCorreosPago:true},
  attributes:['id','correo','esContactoPrincipal']}):[];
 const preferred=users.filter(u=>validEmail(u.correo)).sort((a,b)=>
  Number(Boolean(b.esContactoPrincipal))-Number(Boolean(a.esContactoPrincipal))||Number(a.id)-Number(b.id));
 return preferred[0]?.correo||(validEmail(casa.correo)?String(casa.correo).trim():null);
}
async function consultarCorreo(casaId){
 const casa=await Casa.findByPk(casaId,{attributes:['id','correo']});
 if(!casa)throw fail(404,'Vivienda no encontrada');
 return correoRegistrado(casa);
}
async function enviar({casaId,concepto,proyectoId,referencia,periodo,actor,correoDestino}){
 const cid=Number(casaId),admin=Number(actor),tipo=String(concepto||'MANTENIMIENTO').toUpperCase();
 if(!Number.isSafeInteger(cid)||cid<1||!Number.isSafeInteger(admin)||admin<1)
  throw fail(400,'Vivienda o administrador inválidos');
 if(!['MANTENIMIENTO','EXTRAORDINARIO'].includes(tipo))throw fail(400,'Concepto inválido');
 if(tipo==='EXTRAORDINARIO'&&(!Number.isSafeInteger(Number(proyectoId))||Number(proyectoId)<1))
  throw fail(400,'Proyecto inválido');
 const registro=tipo==='EXTRAORDINARIO'
  ?await extras.consultarPago(cid,proyectoId,referencia||null)
  :await recibos.consultarPago(cid,periodo||null,referencia||null);
 // El administrador puede sustituir el correo para este envío únicamente.
 // El valor de correoDestino NO se guarda en direcciones ni usuarios.
 // La ruta de Finanzas exige ADMINISTRADOR/SUPER_ADMIN.
 const registrado=await consultarCorreo(cid);
 const override=correoDestino==null?null:String(correoDestino).trim();
 const correo=override===null?registrado:override;
 if(!validEmail(correo))throw fail(400,'Ingresa un solo correo de destino válido (máximo 254 caracteres).');
 const esAlternativo=!registrado||correo.toLowerCase()!==registrado.toLowerCase();
 const folio=registro.recibo.folio,key=admin+':'+cid+':'+tipo+':'+folio,now=Date.now();
 if(recent.has(key)&&now-recent.get(key)<60000)
  throw fail(429,'Este recibo ya se envió recientemente. Espera un minuto antes de repetirlo.');
 recent.set(key,now);
 if(recent.size>1000)for(const [k,t] of recent)if(now-t>120000)recent.delete(k);
 try{
  const {buffer,nombreArchivo}=await recibos.generarPdf(registro.recibo);
  if(!Buffer.isBuffer(buffer)||!buffer.length)throw fail(503,'No se pudo generar el PDF.');
  const result=await mail.enviarReciboAdjunto({
   destinatario:correo,folio,buffer,nombreArchivo,concepto:tipo,
   proyecto:tipo==='EXTRAORDINARIO'?registro.resumen.concepto:null,
   casa:(registro.casa.calleCorrecta||registro.casa.calle)+' '+registro.casa.numero,
   monto:registro.resumen.monto});
  if(esAlternativo)console.info('[recibo correo] Envío administrativo a destinatario alternativo',{
   casaId:cid,actor:admin,folio,concepto:tipo
  });
  return {enviado:true,correo,folio,messageId:result.messageId,
   destinoAlternativo:esAlternativo};
 }catch(e){recent.delete(key);throw e;}
}
module.exports={correoRegistrado,consultarCorreo,enviar};
