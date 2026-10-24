'use strict';
const banco=require('./banco-correo.service');
const ids=require('./identificadores-bancarios.service');
const etiquetas={claveRastreo:'Clave de rastreo',referencia:'Referencia bancaria',folio:'Folio de operación'};
function rechazo(mensaje,camposFaltantes,camposCorreo=[],code='COMPROBANTE_NO_CONCILIABLE'){
 return Object.assign(new Error(mensaje),{status:422,code,camposFaltantes,camposCorreo});
}
// Un folio solo NO puede convertirse por inferencia en una referencia o clave.
// Consultar un aviso autenticado antes de guardar cuando el OCR solo detectó folio.
async function verificarPosibilidad({textoOcr,casa,fechaOperacion,horaOperacion,monto}){
 const encontrados=ids.extraer(textoOcr);
 if(encontrados.claveRastreo||encontrados.referencia)return {metodo:'CLAVE_O_REFERENCIA'};
 if(!encontrados.folio)throw rechazo(
  'La captura no contiene ningún identificador bancario verificable. Adjunta el detalle del movimiento.',
  ['Clave de rastreo','Referencia bancaria','Folio de operación']);
 if(!banco.configurado())throw rechazo(
  'La imagen solo contiene un folio de operación, y el buzón bancario no está disponible para compararlo. Adjunta una captura donde se vea también la referencia o la clave de rastreo.',
  ['Referencia bancaria','Clave de rastreo'],[],'FOLIO_SIN_RESPALDO_BANCARIO');
 let avisos;
 try{avisos=(await banco.obtenerAvisos()).filter(n=>banco.coincideDatosBancarios(
  {casa,fechaOperacion,horaOperacion,monto},n));}
 catch(error){
  // No asumir que el banco confirmó un folio porque falló IMAP.
  throw rechazo('No fue posible consultar el correo bancario para comprobar este folio. Adjunta el detalle con referencia o clave de rastreo.',
   ['Referencia bancaria','Clave de rastreo'],[],'BUZON_NO_VERIFICABLE');
 }
 const compatibles=avisos.filter(n=>ids.coinciden({textoOcr},n));
 if(compatibles.length===1&&avisos.length===1)return {metodo:'FOLIO_CONFIRMADO_EN_CORREO'};
 const correo=Array.from(new Set(avisos.flatMap(n=>ids.disponibles(ids.identificadoresAviso(n))))).map(k=>etiquetas[k]);
 throw rechazo(
  avisos.length
   ? 'El correo bancario no contiene un folio coincidente con esta captura. Necesitamos una referencia bancaria o clave de rastreo que también figure en el correo.'
   : 'No se encontró un aviso bancario autenticado con ese folio. Sube el detalle del movimiento donde aparezca la referencia o la clave de rastreo.',
  ['Referencia bancaria','Clave de rastreo'],correo,'FOLIO_NO_PRESENTE_EN_CORREO');
}
module.exports={verificarPosibilidad};
