'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {seleccionarPadronAnalisis} = require('../src/services/padron-finanzas.service');

test('Incluye temporalmente solo Prueba TEST-001 con ID 738', () => {
  const casas = [
    {id:738,calle:'Prueba',numero:'TEST-001',nombre:'Condómino Prueba'},
    {id:739,calle:'Prueba',numero:'TEST-001'},
    {id:740,calle:'Prueba',numero:'TEST-002'},
    {id:741,calle:'Prueba Auxiliar',numero:'1'},
    {id:111,calle:'Gardenias',numero:'5'},
  ];
  const r = seleccionarPadronAnalisis(casas,[]);
  assert.deepEqual(r.casas.map(x=>x.id).sort((a,b)=>a-b),[111,738]);
  assert.equal(r.excluidas,3);
});

test('No se puede incluir la casa ID 738 si deja de ser Prueba TEST-001', () => {
  const casas=[
    {id:738,calle:'Prueba',numero:'TEST-002'},
    {id:738,calle:'Gardenias',numero:'5'},
  ];
  const r=seleccionarPadronAnalisis(casas,[]);
  assert.equal(r.casas.some(x=>x.numero==='TEST-002'),false);
});

test('El filtro oficial de avenidas permanece intacto',()=>{
  const r=seleccionarPadronAnalisis([
    {id:3,calle:'Atotonilco',numero:'752'},
    {id:4,calle:'Atotonilco',numero:'751'},
    {id:5,calle:'Av. Guadalajara',numero:'707'},
    {id:6,calle:'Av. Guadalajara',numero:'789'},
    {id:7,calle:'Valle de México',numero:'3614'},
    {id:8,calle:'Valle de México',numero:'3650'},
    {id:738,calle:'Prueba',numero:'TEST-001'},
  ],[]);
  assert.deepEqual(r.casas.map(x=>x.id).sort((a,b)=>a-b),[3,5,7,738]);
  assert.equal(r.excluidas,3);
});

test('La selección no modifica domicilios ni pagos',()=>{
  const casa={id:738,calle:'Prueba',numero:'TEST-001'};
  const copia=JSON.stringify(casa);
  const r=seleccionarPadronAnalisis([casa],[]);
  assert.equal(r.casas[0],casa);
  assert.equal(JSON.stringify(casa),copia);
});
