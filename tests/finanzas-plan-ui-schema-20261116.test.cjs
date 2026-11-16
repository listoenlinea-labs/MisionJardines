'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('el backend prepara planes sin SQL manual en arranque y también en consulta/guardado',()=>{
 const schema=read('backend/src/services/finanzas-planes-schema.service.js');
 const boot=read('backend/src/services/finanzas-schema.service.js');
 const ctrl=read('backend/src/controllers/finanzas-plan.controller.js');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS finanzas_planes_mutex/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS finanzas_planes_mensuales/);
 assert.match(schema,/INSERT IGNORE INTO finanzas_planes_mutex/);
 assert.match(boot,/await require\('\.\/finanzas-planes-schema\.service'\)\.asegurarPlanes\(\)/);
 assert.equal((ctrl.match(/await asegurarPlanes\(\);/g)||[]).length,2);
});
test('el modal tiene un solo control por ID y los meses dentro de barras de acción',()=>{
 const html=read('docs/analisis-cuotas.html');
 const block=html.slice(html.indexOf('<dialog id="fplanDialog"'),html.indexOf('</dialog>')+9);
 const ids=[...block.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(new Set(ids).size,ids.length,'no repetir IDs');
 assert.ok(block.indexOf('id="fplanTargetMonth"')>block.indexOf('class="fplan-commandbar"'));
 assert.ok(block.indexOf('id="fplanSourceMonth"')>block.indexOf('class="fplan-income-panel"'));
 assert.match(block,/id="fplanLoadNotice"/);
 assert.match(block,/id="fplanReload"/);
 assert.match(block,/id="fplanRecommendation"/);
});
test('la interfaz renderiza análisis aunque fallen asignaciones y bloquea guardado',()=>{
 const ui=read('docs/assets/js/finanzas-plan.js');
 assert.match(ui,/Promise\.allSettled\(/);
 assert.match(ui,/if\(result\[1\]\.status==='fulfilled'\)/);
 assert.match(ui,/planReady=false/);
 assert.match(ui,/\$\('fplanSave'\)\.disabled=!planReady\|\|loading/);
 assert.match(ui,/sourceMonthOptions\(/);
 assert.match(ui,/fplanPeriodText/);
 assert.doesNotThrow(()=>new Function(ui));
});
test('el diseño móvil cubre el iframe y da ancho completo a búsqueda',()=>{
 const css=read('docs/assets/css/finanzas-plan.css');
 assert.match(css,/\.fplan-dialog\{width:100vw;height:100dvh/);
 assert.match(css,/\.fplan-expense-panel \.fplan-panel-toolbar\{grid-template-columns:1fr\}/);
 assert.match(css,/\.fplan-content\{flex:1;min-height:0;overflow-y:auto/);
 assert.match(css,/\.fplan-footer\{/);
});
