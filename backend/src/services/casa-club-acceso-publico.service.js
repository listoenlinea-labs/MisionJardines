'use strict';
// Enlace no adivinable para subir un comprobante de una sola reservación.
// No es una sesión de condómino: jamás autoriza mantenimiento, extraordinarias
// ni datos de otras casas. Solo se almacena SHA-256 del secreto.
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
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
// El mismo secreto privado entregado a ese correo autoriza únicamente la
// lectura de los estados asociados a la dirección verificada de la reserva.
function enlaceMisReservas(id,token){
 return FRONTEND_PUBLICO+'#mis-reservas='+encodeURIComponent(String(id)+'.'+token);
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
module.exports={REGLAMENTO_VERSION,crear,enlace,enlaceMisReservas,verificar,hoy,FRONTEND_PUBLICO};
