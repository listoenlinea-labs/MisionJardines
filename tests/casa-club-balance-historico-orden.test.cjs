'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const financeBalance=require('../docs/assets/js/analisis-balance.js');
const {conciliarMovimientos}=require('../backend/src/services/casa-club-historico-viviendas.service');
test('29 recuperaciones de 2026: 25550 de ingreso, 8700 previsto de limpieza, 16850 de diferencia',()=>{
 const historical={disponible:true,total:25550,registros:29};
 const cleaning=historical.registros*300;
 const balance=financeBalance.casaClub({ingresos:historical.total,egresos:cleaning,criterioHistorico:'Histórico de 2026'});
 assert.equal(balance.ingresos,25550);
 assert.equal(balance.egresos,8700);
 assert.equal(balance.diferencia,16850);
 assert.equal(balance.criterio,'Histórico de 2026');
});
test('recuperaciones repetidas por vivienda se acumulan, pero sólo casas con recuperación se marcan',()=>{
 const homes=[{id:11,calle:'Gardenias',numero:20},{id:12,calle:'Lirios',numero:32}];
 const entries=[{calle:'GARDENIAS',numero:'20',monto:700,fila:3},
  {calle:'GARDENIAS',numero:'20',monto:1000,fila:8},
  {calle:'LIRIOS',numero:'32',monto:250,fila:9}];
 const x=conciliarMovimientos(entries,homes);
 assert.equal(x.coincidencias,3);
 assert.equal(x.viviendasConRecuperacion,2);
 assert.equal(x.porCasa['11'].monto,1700);
 assert.equal(x.porCasa['12'].monto,250);
});
test('orden y tarjeta de limpieza sólo cambian en Casa Club',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../docs/assets/js/analisis-cuotas.js'),'utf8');
 const charts=fs.readFileSync(path.join(__dirname,'../docs/assets/js/finanzas-ambitos-vista.js'),'utf8');
 const backend=fs.readFileSync(path.join(__dirname,'../backend/src/controllers/finanzas.controller.js'),'utf8');
 assert.match(ui,/if\(activeConcept==='CASA_CLUB'\)/);
 assert.match(ui,/recuperacionHistoricaGoogle/);
 assert.match(ui,/historico\.limpiezaPrevista/);
 assert.match(backend,/const limpiezaPrevista=Math\.round\(matched\.registros\*costoLimpiezaUnitario/);
 assert.match(charts,/criterioHistorico:clubHist\.criterioHistorico/);
 assert.match(charts,/historical\.limpiezaPrevista/);
 assert.match(charts,/Casa Club · Histórico 2026/);
});
