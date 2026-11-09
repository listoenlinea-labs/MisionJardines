'use strict';
// Comprobante documental: NO representa una actualización del estado de cuenta.
const fs=require('node:fs');
const path=require('node:path');
const PDFDocument=require('pdfkit');
const { MESES }=require('./recibos-manuales.service');

const dinero=n=>'$'+Number(n).toLocaleString('es-MX',{maximumFractionDigits:0})+' MXN';
const fechaMX=iso=>{const [y,m,d]=String(iso).slice(0,10).split('-');return [d,m,y].join('/')};
function logo(){
 const p=[process.env.RECEIPT_LOGO_PATH,
  path.resolve(__dirname,'../assets/logo-mision-jardines.png'),
  path.resolve(__dirname,'../../../docs/assets/images/logo-mision-jardines.png')].filter(Boolean);
 return p.find(x=>fs.existsSync(x))||null;
}
function pdfManual(r){
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'LETTER',margins:0,compress:true,info:{
   Title:'Recibo manual '+r.folio,Author:'Administración Misión Jardines',
   Subject:'Comprobante manual independiente del estado de cuenta'
  }});
  const chunks=[];
  doc.on('data',v=>chunks.push(v));
  doc.on('error',reject);
  doc.on('end',()=>resolve(Buffer.concat(chunks)));
  const line=y=>doc.save().lineWidth(.7).strokeColor('#8c8c8c').moveTo(30,y).lineTo(582,y).stroke().restore();
  const label=(name,text,x,y,width=546)=>{
   doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#161616')
    .text(name+': ',x,y,{continued:true,width})
    .font('Helvetica').text(String(text));
  };
  doc.save().lineWidth(1).strokeColor('#202020').rect(8,8,596,776).stroke().restore();
  const image=logo();
  if(image)doc.image(image,35,22,{fit:[134,48]});
  else{
   doc.roundedRect(35,22,134,48,4).fill('#18452a');
   doc.font('Helvetica-Bold').fontSize(12).fillColor('white')
    .text('Misión Jardines',43,39,{width:118,align:'center'});
  }
  doc.font('Helvetica-Bold').fontSize(13.3).fillColor('#111')
   .text('FRACCIONAMIENTO MISIÓN JARDINES',170,91,{width:385,align:'center'});
  doc.font('Helvetica-Bold').fontSize(10)
   .text('Recibo de pago · Emisión manual',170,120,{width:385,align:'center'});
  line(142);
  label('Folio',r.folio,32,160);
  label('Fecha de emisión',fechaMX(r.fechaEmision),32,178);
  line(199);
  doc.font('Helvetica-Bold').fontSize(10).text('Recibido de:',32,222);
  label('Nombre',r.nombre,32,244,535);
  label('Calle',r.calle,32,267,535);
  label('Número',r.numeroCasa,32,286);
  line(307);
  doc.font('Helvetica-Bold').fontSize(10).text('Concepto del pago:',32,326);
  doc.font('Helvetica-Bold').fontSize(10)
   .text(r.conceptoPago,32,341,{width:548,height:36,ellipsis:true});
  label('Mes cubierto',MESES[r.mesCubierto-1]+' '+r.anioCubierto,32,381);
  line(408);
  doc.font('Helvetica-Bold').fontSize(10).text('Detalle del pago',32,426,{width:548,align:'center'});
  doc.font('Helvetica-Bold').fontSize(9.5).text('Concepto',42,457).text('Monto',458,457);
  doc.font('Helvetica').fontSize(9.5).text(r.conceptoDetalle,42,478,{width:375,height:32,ellipsis:true})
   .text(dinero(r.monto),434,478,{width:144,align:'right'});
  line(523);
  label('Forma de pago',r.formaPago,32,541);
  label('Referencia',r.referencia,32,559);
  line(590);
  doc.font('Helvetica').fontSize(8.1).text(
   'El presente comprobante se expide para fines administrativos internos del Fraccionamiento Misión Jardines. No constituye un CFDI. Su emisión manual no modifica saldos, cuotas, pagos bancarios, vigencias de TAGs ni el estado contable de la vivienda.',
   32,605,{width:548,align:'justify',lineGap:2});
  doc.font('Helvetica-Bold').fontSize(8.7).fillColor('#9b5a0b')
   .text('DOCUMENTO MANUAL · Sin movimiento contable automático',32,652,{width:548,align:'center'});
  line(670);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111')
   .text('Atentamente:',32,682,{width:548,align:'center'});
  doc.font('Helvetica').fontSize(10)
   .text('Administración',32,704,{width:548,align:'center'})
   .text('Fraccionamiento Misión Jardines',32,720,{width:548,align:'center'});
  line(735);
  doc.font('Helvetica-Bold').fontSize(10).text('Sello:',32,743,{width:548,align:'center'});
  doc.font('Helvetica-BoldOblique').fontSize(12)
   .text(r.sello,32,758,{width:548,height:20,align:'center',underline:true,ellipsis:true});
  doc.end();
 });
}
module.exports={pdfManual};
