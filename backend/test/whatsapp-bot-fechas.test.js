'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {fechaISO}=require('../src/services/whatsapp-bot-fechas.service');

test('interpreta fechas en español, texto libre común y formatos numéricos',()=>{
 const samples=[
  ['20/04/2027','2027-04-20'],
  ['20 de Abril de 2027','2027-04-20'],
  ['Diciembre 13 de 2026','2026-12-13'],
  ['13 de diciembre de 2026','2026-12-13'],
  ['2027-04-20','2027-04-20'],
  ['12/31/2026','2026-12-31'],
  ['20.04.2027','2027-04-20'],
  ['21 Noviembre 2026','2026-11-21'],
  ['31/02/2027',''],
  ['29 de febrero de 2027',''],
  ['21 del noviembre de 2026','']
 ];
 for(const [input,expected] of samples)assert.equal(fechaISO(input),expected,input);
});

test('rechaza fechas ambiguas e imposibles sin usar Date.parse de idiomas del sistema',()=>{
 for(const invalid of ['mañana','13/13/2026','2027-02-31','Abril cuarenta 2027',''])assert.equal(fechaISO(invalid),'');
});
