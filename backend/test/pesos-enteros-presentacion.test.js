'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=relative=>fs.readFileSync(path.resolve(__dirname,'../..',relative),'utf8');

test('UI y correos muestran pesos enteros',()=>{
 const paths=['docs/assets/js/pagos.js','docs/assets/js/analisis-cuotas.js',
  'docs/assets/js/casa-club.js','docs/assets/js/pagos-historial.js',
  'docs/assets/js/home-dashboard.js','backend/src/services/email.service.js'];
 for(const p of paths){
  const text=read(p);
  assert.match(text,/maximumFractionDigits:\s*0/,p);
  assert.doesNotMatch(text,/maximumFractionDigits:\s*2/,p);
 }
 const peso=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',
  minimumFractionDigits:0,maximumFractionDigits:0});
 assert.equal(peso.format(300),'$300');
 assert.equal(peso.format(38100),'$38,100');
});

test('Excel de padrón y de proyectos sin formatos decimales',()=>{
 const excel=read('docs/assets/js/analisis-excel.js');
 const cuotas=read('docs/cuotas.html');
 assert.doesNotMatch(excel,/#,##0\.00|#,##0\.##/);
 assert.doesNotMatch(cuotas,/"\$"#,##0\.00/);
 assert.match(excel,/nombre==='Resumen'/);
 assert.match(excel,/nombre==='Finanzas'&&cabeceras\.includes\('Monto \/ viviendas'\)/);
 assert.match(excel,/TEXT\(B/);
 assert.match(excel,/maximumFractionDigits:0/);
 assert.match(cuotas,/minimumFractionDigits: 0/);
 assert.match(cuotas,/maximumFractionDigits: 0/);
});

test('PDF de recibos y comprobantes usa formato entero',()=>{
 for(const p of ['backend/src/services/pdf.service.js',
   'backend/src/services/pago-reportado-pdf.service.js']){
  const body=read(p);
  assert.match(body,/style:\s*'currency'/);
  assert.match(body,/maximumFractionDigits:\s*0/);
  assert.doesNotMatch(body,/maximumFractionDigits:\s*2/);
 }
});

test('Sin ceros con decimales en pantallas y caché actualizada',()=>{
 const pagos=read('docs/pagos.html'),analisis=read('docs/analisis-cuotas.html');
 assert.doesNotMatch(pagos,/\$(?:0|300)\.00|placeholder="(?:300|500)\.00"/);
 assert.doesNotMatch(analisis,/\$0\.00|placeholder="231000\.00"/);
 assert.match(analisis,/analisis-excel\.js\?v=20261109-pesos-enteros-v1/);
 assert.match(pagos,/pagos\.js\?v=20261109-pesos-enteros-v1/);
});

test('Los números fuente y conciliaciones conservan precisión interna',()=>{
 const excel=read('docs/assets/js/analisis-excel.js');
 const cuotas=read('docs/assets/js/analisis-cuotas.js');
 const pagos=read('docs/pagos.html');
 assert.match(excel,/cell\.value=value/);
 assert.match(cuotas,/totalAnterior:anterior\.toFixed\(2\),totalPagado:nuevo\.toFixed\(2\)/);
 assert.match(pagos,/id="amount" type="number" min="0\.01" step="0\.01" required readonly/);
});
