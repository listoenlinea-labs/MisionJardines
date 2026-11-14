'use strict';
// Enlace no adivinable para subir un comprobante de una sola reservación.
// No es una sesión de condómino: jamás autoriza mantenimiento, extraordinarias
// ni datos de otras casas. Solo se almacena SHA-256 del secreto.
const {randomBytes,createHash,createHmac,timingSafeEqual}=require('node:crypto');
const Reserva=require('../models/ReservaCasaClub');
const REGLAMENTO_VERSION='2026-03-26-firmado';
const FRONTEND_PUBLICO='https://listoenlinea-labs.github.io/MisionJardines/casa-club.html';
const hoy=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const error=(status,msg)=>Object.assign(Error(msg),{status});
const hash=token=>createHash('sha256').update(token).digest('hex');
function crear(){
 const token=randomBytes(32).toString('hex');
 return {token,hash:hash(token)};
}
function enlace(id,token){
 return FRONTEND_PUBLICO+'#comprobante='+encodeURIComponent(String(id)+'.'+token);
}
// Token independiente del comprobante; se envía ÚNICAMENTE al buzón,
// nunca al JSON devuelto al navegador que solicita la reservación.
function secretoHistorial(){
 const secreto=process.env.CASA_CLUB_HISTORIAL_SECRET||process.env.JWT_SECRET;
 if(!secreto||secreto.length<16)throw error(503,'No está configurada la firma privada de Casa Club.');
 return secreto;
}
const correoNormalizado=value=>String(value||'').trim().toLowerCase();
function tokenHistorial(id,email){
 return createHmac('sha256',secretoHistorial())
  .update('mision-jardines:casa-club:historial:v1:'+id+':'+correoNormalizado(email))
  .digest('hex');
}
function enlaceMisReservas(id,email){
 return FRONTEND_PUBLICO+'#mis-reservas='+encodeURIComponent(String(id)+'.'+tokenHistorial(id,email));
}
async function verificarHistorial({id,token}){
 const reservaId=Number(id);
 if(!Number.isSafeInteger(reservaId)||reservaId<1||typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))
  throw error(404,'No se encontró el enlace de historial.');
 const reserva=await Reserva.findByPk(reservaId);
 if(!reserva||!reserva.correo)throw error(404,'No se encontró el enlace de historial.');
 const recibido=Buffer.from(token,'hex');
 const esperado=Buffer.from(tokenHistorial(reservaId,reserva.correo),'hex');
 if(!timingSafeEqual(recibido,esperado))throw error(404,'No se encontró el enlace de historial.');
 return reserva;
}
async function verificar({id,token,exigirVigente=false}){
 const reservaId=Number(id);
 if(!Number.isSafeInteger(reservaId)||reservaId<1||typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))
  throw error(404,'No se encontró el enlace de carga de esta reservación.');
 const row=await Reserva.findByPk(reservaId);
 const guardado=row?.tokenPagoPublicoHash;
 const esperado=Buffer.from(hash(token),'hex');
 const recibido=Buffer.from(/^[0-9a-f]{64}$/.test(String(guardado||''))?guardado:'0'.repeat(64),'hex');
 if(!row||!timingSafeEqual(esperado,recibido))
  throw error(404,'No se encontró el enlace de carga de esta reservación.');
 if(exigirVigente&&(!['PENDIENTE','APROBADA'].includes(row.estatus)||row.pagado||
  !row.fechaBloqueada||row.fechaBloqueada!==row.fecha||!row.fechaLimitePago||
  hoy()>row.fechaLimitePago))
  throw error(409,'La reservación ya no permite subir un comprobante. Revisa su estado con Administración.');
 return row;
}
module.exports={REGLAMENTO_VERSION,crear,enlace,enlaceMisReservas,verificarHistorial,verificar,hoy,FRONTEND_PUBLICO};
