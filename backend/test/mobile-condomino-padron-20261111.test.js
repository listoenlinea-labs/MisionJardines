'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const frontend=require('../../docs/assets/js/permissions.js');
const backend=require('../src/config/permissions.js');
const {resumenResidentesVisibles}=require('../src/services/dashboard-residentes.service.js');
test('condómino solamente Pagos y Casa Club en frontend y backend',()=>{
  for(const policy of [frontend,backend]){
    assert.equal(policy.landing('CONDOMINO'),'pagos.html');
    assert.deepEqual(policy.pages.filter(page=>policy.canAccess('CONDOMINO',page)).sort(),['casa-club.html','pagos.html']);
    assert.equal(policy.canAccess('ADMINISTRADOR','index.html'),true);
    assert.equal(policy.canAccess('SEGURIDAD','conmutador.html'),true);
  }
});
test('padrón ignora tests, domicilios no oficiales y duplicados',()=>{
  const rows=[
    {id:1,calle:'Gardenias',numero:'5',condominoId:22},
    {id:1,calle:'Gardenias',numero:'5',condominoId:23},
    {id:2,calle:'Rosas',numero:'18',condominoId:22},
    {id:3,calle:'Prueba',numero:'TEST-001',condominoId:88},
    {id:4,calle:'Prueba',numero:'TEST-002',condominoId:89},
    {id:5,calle:'Guadalajara',numero:'12',condominoId:90},
    {id:6,calle:'Guadalajara',numero:'707',condominoId:null},
    {id:7,calle:'Magnolias',numero:'12',condominoId:null}
  ];
  assert.deepEqual(resumenResidentesVisibles(rows),{residentes_activos:2,viviendas_ocupadas:2,viviendas_totales:4});
});
test('mobile y middleware: reglas presentes',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../../docs/assets/css/mobile-polish-20261111.css'),'utf8');
  for(const selector of ['.mj-db-capacity:not([hidden])','#newExpense.expense-form','#expenseStart','.expense-filters','#tab-reservar .form-grid','#clubSubmit']) assert.ok(css.includes(selector),selector);
  const middleware=fs.readFileSync(path.join(__dirname,'../src/middlewares/auth.middleware.js'),'utf8');
  assert.match(middleware,/\['auth', 'viviendas', 'pagos', 'casa-club'\]/);
  assert.match(middleware,/req\.usuario\.rol === 'CONDOMINO'/);
});
