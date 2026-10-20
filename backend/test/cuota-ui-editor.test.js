'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const leer=p=>fs.readFileSync(path.join(__dirname,'../../',p),'utf8');

test('editor lateral visible junto al historial y restringido a mantenimiento',()=>{
 const html=leer('docs/analisis-cuotas.html');
 const js=leer('docs/assets/js/analisis-cuotas.js');
 const css=leer('docs/assets/css/analisis-cuotas.css');
 for(const id of ['houseHistoryModal','houseTariffPanel','houseTariffOpen','houseTariffInput','houseTariffForm','houseTariffSave'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/activeConcept!=='MANTENIMIENTO'/);
 assert.match(js,/cuota-por-cobrar/);
 assert.match(js,/['"]PATCH['"]/);
 assert.match(css,/history-dialog-layout/);
 assert.match(css,/history-tariff-panel/);
});
test('montos de Análisis, Excel e Inicio sin centavos de presentación',()=>{
 assert.match(leer('docs/assets/js/analisis-cuotas.js'),/maximumFractionDigits:0/);
 assert.match(leer('docs/assets/js/home-dashboard.js'),/maximumFractionDigits: 0/);
 assert.match(leer('docs/assets/js/analisis-excel.js'),/Math\.round\(Number\(v\|\|0\)\)/);
});
