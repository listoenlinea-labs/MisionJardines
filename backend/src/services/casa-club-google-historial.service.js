'use strict';
// Vista histórica SIN alterar reservas, pagos ni disponibilidad de MySQL.
// Las filas CC-* del Sheet son espejos de registros locales, no nuevas personas.
const normalize=value=>String(value||'').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
const iso=value=>{
 const v=String(value||'').trim();
 const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
 const candidate=match?match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0'):v;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(candidate))return null;
 const d=new Date(candidate+'T12:00:00Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===candidate?candidate:null;
};
const value=(row,index)=>String(row.values?.[index]||'').trim().slice(0,300);
const identity=r=>{
 const email=normalize(r.correo),phone=String(r.telefono||'').replace(/\D/g,'');
 if(email)return 'm:'+email;
 if(phone.length>=10)return 't:'+phone.slice(-10);
 return 'n:'+normalize(r.solicitante)+'|'+normalize(r.casa?.numero||r.numero);
};
function build({sheetRows=[],casas=[],existing=[],today,houseId}){
 const localIds=new Map(existing.map(r=>[Number(r.id),r]));
 const localFolios=new Set(existing.map(r=>String(r.folio||'')).filter(Boolean));
 const localByHouseDate=new Set(existing
  .filter(r=>r.casaId&&r.fecha).map(r=>String(r.fecha)+'|'+Number(r.casaId)));
 const sheetFolios=new Set(),history=[];
 for(const row of sheetRows){
  const folio=value(row,0),fecha=iso(value(row,8));
  if(!/^MJ-\d{8}-\d{5,12}$/.test(folio)||!fecha||sheetFolios.has(folio))continue;
  sheetFolios.add(folio);
  if(localFolios.has(folio))continue;
  const calle=value(row,4),numero=value(row,3);
  const casaId=houseId([folio,'','',numero,calle],casas);
  if(casaId&&localByHouseDate.has(fecha+'|'+casaId))continue;
  const conflicting=existing.some(r=>String(r.fechaBloqueada||'')===fecha&&
   ['PENDIENTE','APROBADA'].includes(r.estatus));
  const casa=casas.find(c=>Number(c.id)===casaId);
  history.push({
   // No es una reserva MySQL ni se puede aprobar, liberar o cobrar.
   soloLectura:true,origen:'GOOGLE_HISTORICO',folio,fecha,
   estatus:fecha<today?'HISTORICA_GOOGLE':conflicting?'CONFLICTO_GOOGLE':'EN_REVISION_GOOGLE',
   solicitante:value(row,5),telefono:value(row,6),correo:value(row,2),
   propietario:/^s[ií]$/i.test(value(row,7)),fechaRegistroGoogle:value(row,1),
   calleOriginal:calle,numeroOriginal:numero,
   casa:{id:casaId||null,calle: casa?.calleCorrecta||casa?.calle||calle,
    calleCorrecta:casa?.calleCorrecta||calle,numero:casa?.numero||numero}
  });
 }
 // Una solicitud y una persona no son necesariamente lo mismo.
 // El identificador de persona es aproximado: correo, teléfono o nombre+vivienda.
 const all=[...existing,...history],persons=new Set(all.map(identity));
 return {historial:history,counts:{
  solicitudes:all.length,personas:persons.size,
  enRevision:existing.filter(r=>r.estatus==='PENDIENTE').length+
   history.filter(r=>r.estatus==='EN_REVISION_GOOGLE').length,
  reservadas:existing.filter(r=>r.estatus==='APROBADA').length,
  soloGoogle:history.length,
  filasHoja:sheetRows.length
 }};
}
module.exports={build,iso,identity};
