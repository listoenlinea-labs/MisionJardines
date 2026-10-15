'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const read=p=>fs.readFileSync(path.resolve(__dirname,'../../'+p),'utf8');
const js=()=>read('docs/assets/js/analisis-cuotas.js');
const html=()=>read('docs/analisis-cuotas.html');
const css=()=>read('docs/assets/css/analisis-cuotas.css');
const section=(source,start,end)=>{
  const i=source.indexOf(start),j=source.indexOf(end,i+start.length);
  assert.ok(i>=0&&j>i,'Se encuentra el bloque '+start);
  return source.slice(i,j);
};

test('La columna de último mes pagado usa Sin pago, sin tocar su mes/año real',()=>{
  const row=section(js(),'\'financeHouseRows\').innerHTML=','\'financePageInfo\').textContent=');
  assert.match(row,/h\.ultimoMesPagado\.mes\+' '\+h\.ultimoMesPagado\.anio/);
  assert.match(row,/'Sin pago'\)/);
  assert.doesNotMatch(row,/Sin pago confirmado/);
  assert.match(html(),/<th>Último mes pagado<\/th>/);
});

test('La tabla de viviendas solo muestra número y palabra TAG/TAGs',()=>{
  const button=section(js(),'function renderHouseTagCell(h){','let openedTagsHouse=null;');
  assert.match(button,/data-tags-house/);
  assert.match(button,/count===1\?'TAG':'TAGs'/);
  assert.doesNotMatch(button,/tags-cell-meta|tags-cell-alert|Sin controles/);
  assert.match(button,/aria-label/);
  assert.match(button,/tagMismatch\(h,v\)/);
});

test('El modal tiene encabezados únicos fuera de la lista de TAGs',()=>{
  const layout=section(html(),'<section id="houseTagsModal"','<section id="housePaymentModal"');
  assert.match(layout,/id="houseTagsColumns"[^>]*>\s*<span>TAG<\/span><span>Estado<\/span><span>Fecha final guardada<\/span>/);
  assert.ok(layout.indexOf('houseTagsColumns')<layout.indexOf('houseTagsRows'));
  for(const title of ['TAG','Estado','Fecha final guardada']){
    assert.equal((layout.match(new RegExp('>'+title+'<','g'))||[]).length,1,
      title+' solo se usa en el encabezado');
  }
  assert.doesNotMatch(layout,/Fecha final leída del C3/);
});

test('Las filas de detalle muestran sólo número, estado y una fecha; sin dirección repetida',()=>{
  const modal=section(js(),'function renderTagsModal(){','async function verifyHouseTags(){');
  assert.match(modal,/t\.numeroTarjeta/);
  assert.match(modal,/estado\.etiqueta/);
  assert.match(modal,/t\.fechaFin\|\|'Sin fecha'/);
  assert.match(modal,/houseTagsColumns'\)\.hidden=!v\.detail\.length/);
  assert.doesNotMatch(modal,/t\.nombre|t\.departamento|fechaFinC3|fechaC3|<small>|Fecha final leída del C3/);
  assert.match(modal,/houseTagsAddress.*h\.calle/);
});

test('CSS comparte rejilla de 3 columnas y permite desplazamiento móvil',()=>{
  const style=css();
  assert.match(style,/\.tags-detail-header,\.tags-detail-item\{display:grid;grid-template-columns:/);
  assert.match(style,/\.tags-detail-scroll\{overflow-x:auto/);
  assert.doesNotMatch(style,/\.tags-detail-item\{grid-template-columns:1fr/);
  assert.doesNotMatch(style,/\.tags-detail-item\{grid-template-columns:repeat\(2/);
});

test('Siguen presentes diagnóstico físico y botones principales sin escrituras nuevas',()=>{
  const source=js(),layout=html();
  assert.match(source,/diagnostico\/viviendas\//);
  assert.match(source,/tagStateForHouse/);
  assert.match(source,/tagMismatch\(h,v\)/);
  assert.match(source,/openHousePayment\(id\)/);
  for(const id of ['houseTagsClose','houseTagsRefresh','houseTagsPay','houseTagsEdit']){
    assert.match(layout,new RegExp('id="'+id+'"'));
  }
  assert.match(source,/URLSearchParams\(\{casaId:/);
});
