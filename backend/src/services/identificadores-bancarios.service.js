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
function almacenarVerificados(extraido, folioOperacion) {
 const parsed = {
  claveRastreo: normal(extraido?.claveRastreo),
  referencia: referencia(extraido?.referencia),
  folio: normal(extraido?.folio)
 };
 const tipo = parsed.claveRastreo ? 'claveRastreo' : parsed.referencia ? 'referencia' : parsed.folio ? 'folio' : '';
 const valor = tipo === 'referencia' ? referencia(folioOperacion) : normal(folioOperacion);
 if (!tipo || parsed[tipo] !== valor)
  throw Object.assign(new Error('Los identificadores del comprobante no coinciden con el OCR del servidor.'), {status:422});
 return { version:1, origen:'OCR_SERVIDOR', tipo, ...parsed };
}
function identificadoresPago(pago){
 const meta=pago?.identificadoresVerificados;
 if(meta&&typeof meta==='object'&&meta.version===1&&meta.origen==='OCR_SERVIDOR'
   &&['claveRastreo','referencia','folio'].includes(meta.tipo)){
  const typed={claveRastreo:normal(meta.claveRastreo),referencia:referencia(meta.referencia),folio:normal(meta.folio)};
  if(typed[meta.tipo])return typed;
 }
 const extraidos=extraer(pago?.textoOcr);
 // Recuperación conservadora de comprobantes históricos: usar el campo que
 // fue comprobado al registrar el pago SOLO si aparece como valor explícito
 // cerca de una etiqueta REFERENCIA en el OCR almacenado por el servidor.
 // Nunca asignar una referencia inferida de cuentas, fechas o folios.
 const historica=referencia(pago?.folioOperacion);
 if(historica){
  const lines=String(pago?.textoOcr||'').split(/\r?\n/).map(line=>String(line).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim()).filter(Boolean);
  const candidatos=[];
  for(let i=0;i<lines.length;i++){
   const matched=lines[i].match(/^REFERENCIA(?:\s+NUMERICA)?\s*[:#=.-]?\s*(.*)$/);
   if(!matched)continue;
   const combined=[matched[1],lines[i+1]||''].join(' ').trim();
   const first=combined.match(/^(?:\s*)(\d[\d\s-]{4,20})(?:\s|$)/);
   if(first)candidatos.push(referencia(first[1]));
  }
  if(candidatos.length===1&&candidatos[0]===historica)extraidos.referencia=historica;
 }
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
module.exports={normal,referencia,extraer,almacenarVerificados,identificadoresPago,identificadoresAviso,coinciden,disponibles};
