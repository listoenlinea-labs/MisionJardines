/* Cargar motores OCR/PDF solo después de seleccionar un comprobante.
   No ejecuta OCR ni sube archivos; la validación bancaria sigue en el backend. */
(function(root){
 'use strict';
 let ocrTask=null,pdfTask=null;
 function ocr(){
  if(root.Tesseract)return Promise.resolve(root.Tesseract);
  if(!ocrTask){
   ocrTask=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async=true;
    script.onload=()=>root.Tesseract?resolve(root.Tesseract):reject(Error('El lector OCR no se inicializó.'));
    script.onerror=()=>reject(Error('No se pudo descargar el lector OCR. Revisa la conexión.'));
    document.head.appendChild(script);
   }).catch(error=>{ocrTask=null;throw error;});
  }
  return ocrTask;
 }
 function pdf(){
  if(root.mjPdfJs)return Promise.resolve(root.mjPdfJs);
  if(!pdfTask){
   pdfTask=import('./pagos-pdf.js?v=20261006').then(()=>{
    if(!root.mjPdfJs)throw Error('El lector PDF no se inicializó.');
    return root.mjPdfJs;
   }).catch(error=>{pdfTask=null;throw error;});
  }
  return pdfTask;
 }
 root.MJComprobanteTools={ocr,pdf};
})(window);
