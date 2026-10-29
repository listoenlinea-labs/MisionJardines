'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8');

test('Cumplimiento y desglose tienen botones independientes, inicialmente cerrados en móvil', () => {
 const html = read('docs/analisis-cuotas.html');
 const charts = html.slice(html.indexOf('<div class="analysis-columns">'),html.indexOf('CONSULTA DE VIVIENDAS'));
 assert.equal((charts.match(/class="analysis-card analysis-chart-card"/g)||[]).length,2);
 assert.equal((charts.match(/class="analysis-chart-toggle" aria-expanded="false"/g)||[]).length,2);
 assert.equal((charts.match(/class="analysis-chart-toggle-label">Mostrar/g)||[]).length,2);
 for(const [panel,chart] of [['financeCompliancePanel','financeDonut'],['financeStreetPanel','financeStreetChart']]){
  assert.match(charts,new RegExp('aria-controls="'+panel+'"'));
  assert.match(charts,new RegExp('id="'+panel+'" class="analysis-chart-panel"'));
  assert.match(charts,new RegExp('id="'+chart+'"'));
 }
 assert.match(charts,/Cumplimiento general/);
 assert.match(charts,/Desglose por calle/);
});

test('Solo el móvil colapsa los paneles; escritorio conserva gráficas visibles', () => {
 const css = read('docs/assets/css/analisis-cuotas.css');
 const start=css.lastIndexOf('/* Gráficas de cumplimiento: en escritorio');
 const rules=css.slice(start);
 assert.ok(start>0);
 assert.match(rules,/\.analysis-chart-toggle\{display:none\}/);
 assert.match(rules,/@media\(max-width:700px\)/);
 assert.match(rules,/\.analysis-chart-panel\{display:none\}/);
 assert.match(rules,/\.analysis-chart-card\.is-expanded \.analysis-chart-panel\{/);
 assert.match(rules,/display:block;\s*padding:4px 14px 14px/);
 assert.match(rules,/\.analysis-chart-toggle:focus-visible/);
});

test('Mostrar y Ocultar funcionan por separado sin recargar el análisis', () => {
 const js=read('docs/assets/js/analisis-cuotas.js');
 const begin=js.indexOf(" document.querySelectorAll('.analysis-chart-toggle').forEach(button=>{");
 const end=js.indexOf('\n const notice=',begin);
 assert.ok(begin>0 && end>begin,'se puede aislar el controlador de las gráficas');
 const fn=new Function('document',js.slice(begin,end));
 function fakeToggle(){
  let expanded=false;
  const label={textContent:'Mostrar'};
  const attrs={};
  const listeners={};
  const card={classList:{toggle(cls){assert.equal(cls,'is-expanded');expanded=!expanded;return expanded;}}};
  const button={
   closest:cls=>cls==='.analysis-chart-card'?card:null,
   querySelector:cls=>cls==='.analysis-chart-toggle-label'?label:null,
   addEventListener:(type,cb)=>{listeners[type]=cb;},
   setAttribute:(name,value)=>{attrs[name]=value;}
  };
  return {button,label,attrs,listeners,isExpanded:()=>expanded};
 }
 const first=fakeToggle(),second=fakeToggle();
 fn({querySelectorAll:selector=>{
  assert.equal(selector,'.analysis-chart-toggle');return [first.button,second.button];
 }});
 first.listeners.click();
 assert.equal(first.isExpanded(),true);
 assert.equal(first.label.textContent,'Ocultar');
 assert.equal(first.attrs['aria-expanded'],'true');
 assert.equal(second.isExpanded(),false);
 assert.equal(second.label.textContent,'Mostrar');
 first.listeners.click();
 assert.equal(first.isExpanded(),false);
 assert.equal(first.attrs['aria-expanded'],'false');
 assert.equal(first.label.textContent,'Mostrar');
 second.listeners.click();
 assert.equal(second.label.textContent,'Ocultar');
});

test('Se quita el texto largo en escritorio y móvil, sin retirar filtros o controles', () => {
 const html=read('docs/analisis-cuotas.html');
 assert.doesNotMatch(html,/Filtra por calle, casa, residente, estado y último mes pagado/);
 assert.doesNotMatch(html,/Los saldos corresponden al período elegido; el estado de TAGs/);
 for(const id of ['financeSearch','financeStreet','financeStatus','financeLastPaidMonth',
  'financeHouseRows','financeDonut','financeStreetChart','financeGenerateReceipt']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 }
 assert.match(html,/analisis-cuotas\.css\?v=20261029-acordeones-alineados/);
 assert.match(html,/analisis-cuotas\.js\?v=20261029-graficas-colapsadas/);
});

test('Las dos tarjetas cerradas miden 46px en móvil y recuperan altura al expandirse', () => {
 const css=read('docs/assets/css/analisis-cuotas.css');
 const mobile=css.slice(css.lastIndexOf('/* Gráficas de cumplimiento: en escritorio'));
 assert.match(mobile, /@media\(max-width:700px\)/);
 assert.match(mobile, /body\.page-analisis \.analysis-chart-card\{[^}]*margin-bottom:0;[^}]*min-height:0;[^}]*height:auto;/);
 assert.match(mobile, /body\.page-analisis \.analysis-chart-card:not\(\.is-expanded\)\{\s*height:46px;\s*min-height:46px;\s*max-height:46px;/);
 assert.match(mobile, /body\.page-analisis \.analysis-chart-toggle\{[^}]*height:46px;[^}]*min-height:46px;[^}]*padding:0 14px;/);
 assert.match(mobile, /body\.page-analisis \.analysis-chart-card\.is-expanded \.analysis-chart-panel\{/);
 const html=read('docs/analisis-cuotas.html');
 assert.equal((html.match(/class="analysis-card analysis-chart-card"/g)||[]).length,2);
 assert.match(html, /analisis-cuotas\.css\?v=20261029-acordeones-alineados/);
});

test('El estilo compartido no recorta los títulos y los tres desplegables se ven iguales', () => {
 const css=read('docs/assets/css/analisis-cuotas.css');
 const product=read('docs/assets/css/product-ui.css');
 assert.match(product,/body\.page-analisis\.mj-shared-sidebar-enabled \.analysis-card\{padding:12px!important\}/);
 const rules=css.slice(css.lastIndexOf('/* Gráficas de cumplimiento: en escritorio'));
 assert.match(rules,/body\.page-analisis\.mj-shared-sidebar-enabled \.analysis-columns > \.analysis-card\.analysis-chart-card\{\s*padding:0!important;\s*margin-bottom:0!important;/);
 assert.match(rules,/\.analysis-chart-card:not\(\.is-expanded\)\{\s*height:46px;\s*min-height:46px;\s*max-height:46px;/);
 assert.match(rules,/\.analysis-chart-toggle\{[\s\S]*?align-items:center;[\s\S]*?height:46px;/);
 assert.match(rules,/padding:0 14px;[\s\S]*?color:#965418;\s*font-size:12px;\s*font-weight:800;/);
 assert.match(rules,/\.analysis-chart-toggle-arrow::before\{content:"▾"\}/);
 assert.match(rules,/\.analysis-chart-card\.is-expanded \.analysis-chart-toggle-arrow::before\{content:"▴"\}/);
 assert.match(rules,/@media\(max-width:430px\)\{\s*body\.page-analisis \.analysis-chart-toggle\{font-size:11px\}/);
 assert.match(rules,/\.analysis-chart-card\.is-expanded \.analysis-chart-panel\{/);
 const html=read('docs/analisis-cuotas.html');
 assert.equal((html.match(/class="analysis-chart-toggle"/g)||[]).length,2);
 assert.match(html, /analisis-cuotas\.css\?v=20261029-acordeones-alineados/);
});
