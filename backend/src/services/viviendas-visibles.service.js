'use strict';

// Política central de VISIBILIDAD del padrón: Guadalajara solo 707.
// Filtrar respuestas, no borrar direcciones ni bloquear operaciones históricas
// del C3/TAGs con registros existentes.
function normalizarCalle(valor){
  return String(valor??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
    .replace(/^(?:avenida|avda|av)\s+/,'').replace(/\s+/g,' ');
}
function esViviendaVisible(casa){
  if(!casa)return false;
  const c=casa.get?casa.get({plain:true}):casa;
  const calle=normalizarCalle(c.calleCorrecta||c.calle_correcta||c.calle||
    c.calleSnapshot||c.calle_snapshot);
  return calle!=='guadalajara'||String(c.numero??c.numeroCasaSnapshot??c.numero_casa_snapshot??'').trim()==='707';
}
function filtrarViviendasVisibles(casas){
  return (casas||[]).filter(esViviendaVisible);
}
module.exports={normalizarCalle,esViviendaVisible,filtrarViviendasVisibles};
