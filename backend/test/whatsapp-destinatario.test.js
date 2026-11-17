'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizarDestinatario}=require('../src/services/whatsapp-destinatario.service');

test('normaliza 521 + 10 dígitos a 52 + 10 dígitos para envíos de Meta',()=>{
 assert.equal(normalizarDestinatario('5213312345678'),'523312345678');
});
test('no altera destinatarios mexicanos ya en formato 52',()=>{
 assert.equal(normalizarDestinatario('523312345678'),'523312345678');
});
test('no altera destinatarios de otros países ni números no compatibles',()=>{
 assert.equal(normalizarDestinatario('15551234567'),'15551234567');
 assert.equal(normalizarDestinatario('521123'),'521123');
});
