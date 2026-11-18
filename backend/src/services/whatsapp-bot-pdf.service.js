'use strict';
const PDFDocument=require('pdfkit');
const {consultarAdeudos}=require('./adeudos-comunidad.service');
function moneda(n){return '$'+Number(n||0).toLocaleString('es-MX',{maximumFractionDigits:0})+' MXN';}
async function deudaPdf(auth){
 const datos=await consultarAdeudos(auth.casaId);
 const pdf=new PDFDocument({size:'LETTER',margin:48,info:{Title:'Estado de adeudos Misión Jardines'}});
 const chunks=[];
 pdf.on('data',chunk=>chunks.push(chunk));
 const finish=new Promise((resolve,reject)=>{
  pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject);
 });
 pdf.fontSize(18).fillColor('#1e5537').text('Misión Jardines');
 pdf.moveDown(.4).fillColor('#222222').fontSize(15).text('Estado de adeudos');
 pdf.moveDown(.6).fontSize(11).text('Vivienda: '+(auth.casa.calleCorrecta||auth.casa.calle)+' '+auth.casa.numero);
 pdf.text('Fecha de consulta: '+datos.fechaConsulta);
 pdf.moveDown().fontSize(12).text('Mantenimiento: '+moneda(datos.totales?.MANTENIMIENTO));
 pdf.text('Cuotas extraordinarias: '+moneda(datos.totales?.EXTRAORDINARIO));
 pdf.text('Casa Club: '+moneda(datos.totales?.CASA_CLUB));
 pdf.moveDown().fontSize(14).text('Total: '+moneda(datos.total));
 pdf.moveDown(1.5).fontSize(9).fillColor('#555555')
  .text('Documento informativo generado a partir de los saldos actuales de Misión Jardines. Los pagos en revisión bancaria no se consideran confirmados hasta su conciliación.');
 pdf.end();
 return {buffer:await finish,total:datos.total};
}
module.exports={deudaPdf};
