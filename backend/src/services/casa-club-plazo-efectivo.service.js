'use strict';
const {limitePago}=require('./casa-club-avisos.service');
function fechaGuadalajara(fecha){
 const d=fecha instanceof Date?fecha:new Date(fecha);
 if(Number.isNaN(d.getTime()))return null;
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',
  year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
function plazoEfectivo({creadoEn,fecha,fechaLimitePago}){
 const dia=fechaGuadalajara(creadoEn);
 if(!dia||!/\d{4}-\d{2}-\d{2}/.test(String(fecha||'')))return fechaLimitePago||null;
 const correcto=limitePago(dia,fecha,1);
 // No prolongar fechas previamente comunicadas; sí corregir las de 3 días.
 return fechaLimitePago&&fechaLimitePago<correcto?fechaLimitePago:correcto;
}
module.exports={fechaGuadalajara,plazoEfectivo};
