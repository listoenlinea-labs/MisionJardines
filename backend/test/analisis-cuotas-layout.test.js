'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Consulta de viviendas va justo debajo de Cumplimiento general y Desglose por calle',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
  const cumplimiento=html.indexOf('CUMPLIMIENTO GENERAL');
  const desglose=html.indexOf('DESGLOSE POR CALLE');
  const consulta=html.indexOf('CONSULTA DE VIVIENDAS');
  const movimientos=html.indexOf('MOVIMIENTOS');
  const egresos=html.indexOf('REGISTRO DE EGRESOS');
  assert.ok(cumplimiento>0 && cumplimiento<desglose && desglose<consulta &&
    consulta<movimientos && movimientos<egresos,
    'Las gráficas deben preceder inmediatamente la tabla de viviendas');
  const between=html.slice(desglose,consulta);
  assert.doesNotMatch(between,/MOVIMIENTOS|EGRESOS|REGISTRO DE EGRESOS/);
  assert.match(html,/<\/section><\/div>\s*<section class="analysis-card"><div class="heading"><div><span class="eyebrow">CONSULTA DE VIVIENDAS/);
});

test('Mover la tabla no elimina filtros, paginación ni registro de pagos',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
  for(const id of [
    'financeHouseCount','financeSearch','financeStreet','financeStatus','financeClear',
    'financeHouseRows','financeHousePagination','financePrev','financePageInfo','financeNext',
    'housePaymentModal','housePaymentForm','housePaymentSubmit','housePaymentRefreshC3'
  ]){
    const matches=html.match(new RegExp('id="'+id+'"','g'))||[];
    assert.equal(matches.length,1,'Solo una instancia de '+id);
  }
});
