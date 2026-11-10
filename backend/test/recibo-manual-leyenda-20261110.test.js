'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(
 path.resolve(__dirname,'../src/services/recibos-manuales-pdf.service.js'),'utf8'
);
const legal='El presente comprobante de pago se expide exclusivamente para fines administrativos internos del Fraccionamiento Misión Jardines, de conformidad con el Código Civil del Estado de Jalisco. No constituye un comprobante fiscal ni sustituye a un Comprobante Fiscal Digital por Internet (CFDI), ni implica la liberación de adeudos anteriores o pendientes.';

test('El PDF manual contiene exactamente la nueva leyenda administrativa',()=>{
 assert.ok(source.includes("'"+legal+"'"),'Falta la leyenda solicitada en el generador PDF');
 assert.doesNotMatch(source,/El presente comprobante se expide para fines administrativos internos/);
 assert.doesNotMatch(source,/Su emisión manual no modifica saldos/);
});
test('El PDF no imprime la leyenda naranja de documento manual',()=>{
 assert.doesNotMatch(source,/\.text\('DOCUMENTO MANUAL/);
 assert.match(source,/\bline\(670\);/);
});
test('La leyenda cabe antes de la línea de cierre y la firma',()=>{
 const PDFDocument=require('pdfkit');
 const pdf=new PDFDocument({size:'LETTER',margins:0});
 pdf.font('Helvetica').fontSize(8.1);
 const height=pdf.heightOfString(legal,{width:548,align:'justify',lineGap:2});
 assert.ok(height<=65,'La nueva leyenda puede invadir la firma (altura '+height+' pt)');
 pdf.end();
});
