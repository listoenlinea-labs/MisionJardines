'use strict';
// Al cotizar un cobro de mantenimiento, no interpretar un intento C3 anulado
// como pago acreditado ni como operación activa. La fila ANULADO se mantiene
// intacta en la BD para auditoría; no se revierte la vigencia física del TAG.
// Cualquier operación aún pendiente/en proceso/confirmada sigue bloqueando
// hasta conciliar. Esta función se comparte entre cotización y confirmación.
function vinculosC3Bloqueantes(eventos,cuota,referencias=[]){
 if(!cuota||!Number.isSafeInteger(Number(cuota.id)))return [];
 const refs=(Array.isArray(referencias)?referencias:[]).map(x=>String(x||'').trim()).filter(Boolean);
 return (Array.isArray(eventos)?eventos:[]).filter(e=>{
  const estado=String(e?.estado||'').trim().toUpperCase();
  if(estado==='ANULADO')return false;
  return (String(e?.origen||'').trim().toUpperCase()==='CUOTA'&&Number(e.origenId)===Number(cuota.id))
    ||refs.some(ref=>String(e?.referencia||'').trim()===ref);
 });
}
module.exports={vinculosC3Bloqueantes};
