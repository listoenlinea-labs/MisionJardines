'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'../../'+name),'utf8');
const js=read('docs/assets/js/analisis-cuotas.js');
const html=read('docs/analisis-cuotas.html');
const mobile=read('docs/assets/css/mobile-operativo.css');
const sidebar=read('docs/assets/js/site-sidebar.js');

function statusPredicate(){
  const start=js.indexOf('function houseMatchesStatus(h,status){');
  const end=js.indexOf('\n function renderHouseTagCell(h){',start);
  assert.ok(start>=0&&end>start);
  const source=js.slice(start,end);
  // Ejecuta exactamente el predicado de la UI, con los servicios de TAG
  // sustituidos por fixtures de solo lectura para no usar MySQL ni C3.
  return new Function('tagMismatch','tagsView',
    source+'; return houseMatchesStatus;')(
      (house,view)=>{
        if(Number(house.saldoPendiente)>0&&view.activos>0)return 'Revisar: deuda y TAG activo';
        if(Number(house.saldoPendiente)===0&&view.inactivos>0)return 'Revisar: sin deuda y TAG inactivo';
        return '';
      },
      h=>h.snapshot
    );
}

test('El selector ofrece exactamente Todos, Pagadas, Pendientes y Advertencias',()=>{
  const tag=html.match(/<select id="financeStatus">([\s\S]*?)<\/select>/);
  assert.ok(tag);
  assert.deepEqual([...tag[1].matchAll(/<option value="([^"]*)">([^<]+)<\/option>/g)]
    .map(m=>[m[1],m[2]]),[
    ['','Todos'],['PAGADO','Pagadas'],['PENDIENTE','Pendientes'],
    ['ADVERTENCIAS','Advertencias']
  ]);
});

test('Advertencias: deuda con TAG activo y sin deuda con TAG inactivo',()=>{
  const matches=statusPredicate();
  assert.equal(matches({estatus:'PENDIENTE',saldoPendiente:700,snapshot:{activos:1,inactivos:0}},'ADVERTENCIAS'),true);
  assert.equal(matches({estatus:'PAGADO',saldoPendiente:0,snapshot:{activos:1,inactivos:2}},'ADVERTENCIAS'),true);
  assert.equal(matches({estatus:'PAGADO',saldoPendiente:0,snapshot:{activos:2,inactivos:0}},'ADVERTENCIAS'),false);
  assert.equal(matches({estatus:'PENDIENTE',saldoPendiente:350,snapshot:{activos:0,inactivos:2}},'ADVERTENCIAS'),false);
});

test('No se inventa conflicto físico cuando los TAGs están sin confirmar',()=>{
  const matches=statusPredicate();
  assert.equal(matches({estatus:'PENDIENTE',saldoPendiente:700,snapshot:{activos:0,inactivos:0,sinConfirmar:3}},'ADVERTENCIAS'),false);
  assert.equal(matches({estatus:'PAGADO',saldoPendiente:0,snapshot:{activos:0,inactivos:0,sinConfirmar:2}},'ADVERTENCIAS'),false);
});

test('Pendientes incluye abonos parciales y Pagadas exige pago completo',()=>{
  const matches=statusPredicate();
  const partial={estatus:'PAGO_PARCIAL',saldoPendiente:200,snapshot:{activos:0,inactivos:1}};
  assert.equal(matches(partial,'PENDIENTE'),true);
  assert.equal(matches(partial,'PAGADO'),false);
  assert.equal(matches({...partial,estatus:'PAGADO'},'PAGADO'),true);
  assert.equal(matches({...partial,estatus:'PAGADO'},'PENDIENTE'),false);
  assert.equal(matches(partial,''),true);
});

test('El filtro comparte las advertencias del contador y del modal',()=>{
  assert.match(js,/status==='ADVERTENCIAS'\)return Boolean\(tagMismatch\(h,tagsView\(h\)\)\)/);
  assert.match(js,/houseMatchesStatus\(h,status\)/);
  assert.match(js,/const alert=tagMismatch\(h,v\)/);
  assert.match(js,/const mismatch=tagMismatch\(h,v\)/);
  assert.match(js,/housePage=1;renderHouses\(\)/);
});

test('Registrar un gasto es 2×2 en móvil y no desborda Safari',()=>{
  assert.match(mobile,/#newExpense\.expense-form\{\s*display:grid!important;\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  for(let i=1;i<=4;i++)assert.match(mobile,
    new RegExp('label:nth-of-type\\('+i+'\\)\\{grid-column:'+((i-1)%2+1)+'!important;grid-row:'+Math.ceil(i/2)+'!important'));
  assert.match(mobile,/#expenseDate\{[\s\S]*?min-width:0!important;[\s\S]*?max-width:100%!important/);
  assert.match(mobile,/#newExpense\.expense-form>\.expense-reference-note\{[\s\S]*?grid-column:1\/-1!important/);
  assert.match(mobile,/#newExpense\.expense-form>#saveExpense\{[\s\S]*?grid-column:1\/-1!important/);
  for(const id of ['expenseDate','expenseCategory','expenseAmount','expenseConcept']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
});

test('Dona mantiene el porcentaje dentro del círculo en teléfonos',()=>{
  assert.match(mobile,/#financeDonut\.donut\{[\s\S]*?aspect-ratio:1!important/);
  assert.match(mobile,/#financeDonut\.donut::before\{\s*inset:22%!important/);
  assert.match(mobile,/#financeDonutText\{[\s\S]*?font-size:clamp\(16px,4\.5vw,21px\)!important/);
  assert.match(mobile,/#financeDonutText small\{[\s\S]*?font-size:9px!important/);
  assert.match(js,/financeDonutText'\)\.innerHTML=esc\(data\.porcentaje\)/);
});

test('Versiones de caché actualizadas para JS, CSS y sidebar',()=>{
  assert.match(html,/analisis-cuotas\.js\?v=20261018-tres-conceptos/);
  assert.match(html,/analisis-cuotas\.css\?v=20261018-tres-conceptos/);
  assert.match(sidebar,/mobile-operativo\.css\?v=20261015-safari-fechas-compactas/);
});
