'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=file=>fs.readFileSync(path.resolve(__dirname,'../../',file),'utf8');
const html=root('docs/analisis-cuotas.html');
const css=root('docs/assets/css/analisis-cuotas.css');
const js=root('docs/assets/js/analisis-cuotas.js');
const zk=root('docs/zkteco.html');

test('cumplimiento general y desglose por calle nacen ocultos en escritorio y móvil',()=>{
 for(const [name,id] of [['Cumplimiento general','financeCompliancePanel'],['Desglose por calle','financeStreetPanel']]){
  assert.match(html,new RegExp('aria-expanded="false" aria-controls="'+id+'"'));
  assert.match(html,new RegExp('id="'+id+'" class="analysis-chart-panel" hidden'));
  assert.ok(html.includes(name));
 }
 assert.match(css,/body\.page-analisis \.analysis-chart-toggle\s*\{\s*display:flex!important/);
 assert.match(css,/body\.page-analisis \.analysis-chart-panel\[hidden\]\{display:none!important\}/);
 assert.match(css,/body\.page-analisis \.analysis-chart-card\.is-expanded \.analysis-chart-panel:not\(\[hidden\]\)/);
});

test('dos colapsables independientes: mostrar, ocultar, estado aria y espacio liberado',()=>{
 const start=js.indexOf("document.querySelectorAll('.analysis-chart-toggle').forEach(button=>{");
 const end=js.indexOf('\n });',start);
 assert.ok(start>=0&&end>start,'listeners encontrados');
 const listeners=js.slice(start,end+5);
 const cards=new Map();
 const panels=new Map();
 const buttons=[];
 for(const id of ['financeCompliancePanel','financeStreetPanel']){
  const flags=new Set();
  const card={
   classList:{
    remove(name){flags.delete(name);},
    toggle(name){flags.has(name)?flags.delete(name):flags.add(name);return flags.has(name);}
   },
   flags
  };
  const panel={hidden:false};
  const label={textContent:'?'};
  const attrs=new Map([['aria-controls',id]]);
  const button={
   closest:()=>card,
   querySelector:()=>label,
   getAttribute:name=>attrs.get(name),
   setAttribute:(name,value)=>attrs.set(name,value),
   addEventListener:(event,callback)=>{if(event==='click')button.click=callback;}
  };
  cards.set(id,card);panels.set(id,panel);buttons.push({button,label,attrs,id});
 }
 const document={
  querySelectorAll:()=>buttons.map(item=>item.button),
  getElementById:id=>panels.get(id)
 };
 new Function('document',listeners)(document);
 for(const item of buttons){
  assert.equal(panels.get(item.id).hidden,true);
  assert.equal(item.label.textContent,'Mostrar');
  assert.equal(item.attrs.get('aria-expanded'),'false');
 }
 buttons[0].button.click();
 assert.equal(panels.get('financeCompliancePanel').hidden,false);
 assert.equal(panels.get('financeStreetPanel').hidden,true);
 assert.equal(buttons[0].label.textContent,'Ocultar');
 assert.equal(buttons[0].attrs.get('aria-expanded'),'true');
 buttons[1].button.click();
 assert.equal(panels.get('financeStreetPanel').hidden,false);
 buttons[0].button.click();
 assert.equal(panels.get('financeCompliancePanel').hidden,true);
 assert.equal(buttons[0].attrs.get('aria-expanded'),'false');
 assert.equal(buttons[1].attrs.get('aria-expanded'),'true');
});

test('paneles de ingresos y egresos tienen ocho barras gemelas y hover accesible',()=>{
 const income=html.slice(html.indexOf('id="financeIncomeCard"'),html.indexOf('id="financeExpenseCard"'));
 const expense=html.slice(html.indexOf('id="financeExpenseCard"'),html.indexOf('<!-- Los comparativos'));
 for(const panel of [income,expense]){
  assert.match(panel,/class="finance-card-subtitle"/);
  assert.match(panel,/class="hint finance-chart-description"/);
  assert.match(panel,/finance-graph-help/);
  assert.match(panel,/class="finance-period-summary"/);
  assert.match(panel,/class="money-bars"/);
 }
 assert.match(html,/<h2>Ingresos<\/h2>/);
 assert.match(html,/<h2>Egresos<\/h2>/);
 assert.match(html,/Ingresos por calle/);
 assert.match(html,/Gastos por concepto/);
 assert.match(css,/\.finance-chart-card \.finance-income-select \.bar-row,/);
 assert.match(css,/\.finance-chart-card \.finance-expense-select \.bar-row/);
 assert.match(css,/grid-template-columns:minmax\(86px,138px\) minmax\(20px,1fr\) minmax\(72px,95px\)/);
 assert.match(css,/\.finance-chart-card \.bar-row \.track\s*\{\s*height:13px/);
 assert.match(css,/\.finance-income-select:hover/);
 assert.match(css,/\.finance-expense-select:hover/);
 assert.match(css,/:focus-visible/);
 assert.doesNotMatch(css,/#financeIncomeCard \.bar-row\{/);
 assert.doesNotMatch(css,/#financeIncomeCard \.money-bars\{/);
 assert.match(js,/data-income-street/);
 assert.match(js,/data-expense-concept/);
});

test('iPhone usa búsqueda de TAG con teclado numérico, sin campos de pago/autocompletar',()=>{
 const ids=['tagNumber','newTagNumber','editTagNumber'];
 for(const id of ids){
  const tag=zk.match(new RegExp('<input id="'+id+'"[^>]*>'))?.[0];
  assert.ok(tag,'input '+id);
  assert.match(tag,/type="search"/);
  assert.match(tag,/inputmode="numeric"/);
  assert.match(tag,/pattern="\[0-9\]\*"/);
  assert.match(tag,/autocomplete="off"/);
  assert.match(tag,/autocorrect="off"/);
  assert.match(tag,/autocapitalize="none"/);
  assert.match(tag,/data-1p-ignore="true"/);
  assert.doesNotMatch(tag,/autocomplete="cc-|type="number"|type="tel"/);
 }
 assert.match(zk,/name="zk_access_tag_lookup"/);
 assert.doesNotMatch(zk,/NÚMERO DE TAG \/ TARJETA/);
});

test('entrada de TAG conserva ceros iniciales y elimina caracteres no numéricos',()=>{
 const prefix="for(const id of ['tagNumber','newTagNumber','editTagNumber']){";
 const start=zk.indexOf(prefix);
 const end=zk.indexOf('\n}',start);
 assert.ok(start>=0&&end>start);
 const source=zk.slice(start,end+2);
 const elements=new Map(['tagNumber','newTagNumber','editTagNumber'].map(id=>[id,{
  value:'',handlers:{},
  addEventListener(name,fn){this.handlers[name]=fn;}
 }]));
 new Function('$',source)(id=>elements.get(id));
 for(const input of elements.values()){
  input.value='00 123-AB45';
  input.handlers.input();
  assert.equal(input.value,'0012345');
  input.value='123456789012345';
  input.handlers.input();
  assert.equal(input.value,'123456789012345');
 }
});

test('nuevas versiones se cargan desde app shell, análisis y zkteco',()=>{
 const shell=root('docs/assets/js/app-shell.js');
 const app=root('docs/app.html');
 assert.match(shell,/_mjVersion.*borrar-todos-movimientos-20261103/);
 assert.match(shell,/_mjVersion.*tag-ios-sin-autofill-20261103/);
 assert.match(app,/app-shell\.js\?v=20261103-borrar-historicos/);
 assert.match(html,/analisis-cuotas\.js\?v=20261103-borrar-historicos/);
 assert.match(html,/analisis-cuotas\.css\?v=20261103-compactar-finanzas/);
});
