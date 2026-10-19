'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {evaluarElegibilidadReserva}=require('../src/services/elegibilidad-casa-club.service');

test('un adeudo exclusivo de Casa club no impide otra solicitud',()=>{
 const decision=evaluarElegibilidadReserva({tipos:{MANTENIMIENTO:[],EXTRAORDINARIO:[],CASA_CLUB:[{monto:1400}]}});
 assert.equal(decision.puedeReservar,true);
 assert.equal(decision.total,0);
 assert.deepEqual(decision.totales,{MANTENIMIENTO:0,EXTRAORDINARIO:0});
});
test('mantenimiento y cuotas extraordinarias impiden reservar con desglose exacto',()=>{
 const decision=evaluarElegibilidadReserva({tipos:{
  MANTENIMIENTO:[{periodo:'2026-10',monto:350,recargo:50}],
  EXTRAORDINARIO:[{periodo:'2026-10',monto:120.5,concepto:'Proyecto de alumbrado'}],
  CASA_CLUB:[{monto:9999}]
 }});
 assert.equal(decision.puedeReservar,false);
 assert.equal(decision.total,470.5);
 assert.deepEqual(decision.totales,{MANTENIMIENTO:350,EXTRAORDINARIO:120.5});
 assert.equal(decision.tipos.MANTENIMIENTO[0].recargo,50);
 assert.equal(decision.tipos.EXTRAORDINARIO[0].concepto,'Proyecto de alumbrado');
});
test('falla de manera segura si no se pueden verificar las dos deudas necesarias',()=>{
 assert.throws(()=>evaluarElegibilidadReserva(null),/No es posible/);
 assert.throws(()=>evaluarElegibilidadReserva({tipos:{MANTENIMIENTO:[]}}),/No es posible/);
});
test('el importe de Pagado sigue abriendo historial sin mostrar la etiqueta adicional',()=>{
 const ui=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-cuotas.js'),'utf8');
 const cell=ui.slice(ui.indexOf("houseCell('Pagado'"),ui.indexOf("houseCell('Último mes pagado'"));
 assert.match(cell,/data-paid-history/);
 assert.match(cell,/h\.ultimoPago\?\.monto/);
 assert.doesNotMatch(cell,/Ver historial<\/span>/);
});
test('la alerta de Casa club presenta ambos tipos de deuda y conserva acceso a Pagos',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../../docs/casa-club.html'),'utf8');
 const ui=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/casa-club.js'),'utf8');
 assert.match(html,/id="clubDebtModal"/);
 assert.match(html,/id="clubDebtDetails"/);
 assert.match(html,/href="pagos.html"/);
 assert.match(ui,/showDebtAlert\(err\)/);
 assert.match(ui,/adeudos\.totales/);
});
