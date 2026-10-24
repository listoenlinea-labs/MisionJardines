'use strict';
// Comparar SOLO campos del mismo tipo, extraídos del OCR leído por el servidor.
// Las referencias numéricas admiten ceros iniciales (0910260 === 910260),
// mientras clave de rastreo y folio requieren coincidencia alfanumérica exacta.
const parser=require('./comprobante-parser');
const normal=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const referencia=v=>{
 const original=String(v??'').trim().replace(/[\s-]+/g,'');
 return /^\d{5,20}$/.test(original) ? original.replace(/^0+(?=\d)/,'') : '';
};
const extraer=text=>{
 const data=parser.extract(text||'');
 return {
  claveRastreo:normal(data.claveRastreo),
  referencia:referencia(data.referencia),
  folio:normal(data.folio)
 };
};
function identificadoresPago(pago){
 const extraidos=extraer(pago?.textoOcr);
 // Compatibilidad estricta con reportes históricos: el identificador legado
 // solo puede compararse a la CLAVE, nunca asumir que era referencia o folio.
 if(!extraidos.claveRastreo&&!extraidos.referencia&&!extraidos.folio
    && !String(pago?.textoOcr||'').trim())
    extraidos.claveRastreo=normal(pago?.folioOperacion);
 return extraidos;
}
function identificadoresAviso(aviso){
 return {claveRastreo:normal(aviso?.tracking),referencia:referencia(aviso?.referencia),folio:normal(aviso?.folio)};
}
function coinciden(pago,aviso){
 const a=identificadoresPago(pago),b=identificadoresAviso(aviso);
 return ['claveRastreo','referencia','folio'].some(tipo=>a[tipo]&&b[tipo]&&a[tipo]===b[tipo]);
}
function disponibles(v){
 return ['claveRastreo','referencia','folio'].filter(k=>v[k]);
}
module.exports={normal,referencia,extraer,identificadoresPago,identificadoresAviso,coinciden,disponibles};
