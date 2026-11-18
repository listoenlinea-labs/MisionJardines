'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {clasificarCoincidencia}=require('../src/services/whatsapp-bot-identidad.service');
const {normalizarTelefono}=require('../src/services/telefono-cuenta.service');

const activo={id:12,estatus:'ACTIVO',cuentaAceptada:true,rol:{nombre:'CONDOMINO',activo:true}};
const miembro={casaId:5,activo:true};

test('número único, residente activo y una vivienda autorizada: identificar sin pedir domicilio',()=>{
 assert.deepEqual(clasificarCoincidencia([activo],[miembro]),{tipo:'unico',usuarioId:12,casaId:5});
});
test('números compartidos o cuentas repetidas nunca seleccionan casas al azar',()=>{
 assert.deepEqual(clasificarCoincidencia([activo,{...activo,id:13}],[miembro]),{tipo:'ambiguo'});
});
test('sin registro, sin asociación o varias viviendas requieren verificación adicional',()=>{
 assert.deepEqual(clasificarCoincidencia([],[]),{tipo:'desconocido'});
 assert.deepEqual(clasificarCoincidencia([activo],[]),{tipo:'sin_vivienda'});
 assert.deepEqual(clasificarCoincidencia([activo],[miembro,{casaId:7,activo:true}]),{tipo:'varias_viviendas'});
});
test('usuarios suspendidos y sin rol residencial no dan acceso automático',()=>{
 assert.deepEqual(clasificarCoincidencia([{...activo,estatus:'SUSPENDIDO'}],[miembro]),{tipo:'sin_acceso'});
 assert.deepEqual(clasificarCoincidencia([{...activo,rol:{nombre:'ADMINISTRADOR',activo:true}}],[miembro]),{tipo:'sin_acceso'});
 assert.deepEqual(clasificarCoincidencia([{...activo,rol:{nombre:'CONDOMINO',activo:false}}],[miembro]),{tipo:'sin_acceso'});
});
test('ignora vínculos de viviendas inactivos sin permitir su uso',()=>{
 assert.deepEqual(clasificarCoincidencia([activo],[{casaId:5,activo:false}]),{tipo:'sin_vivienda'});
});

test('normaliza variantes mexicanas de WhatsApp 52/521 y teléfonos locales',()=>{
 assert.equal(normalizarTelefono('5213312345678'),'523312345678');
 assert.equal(normalizarTelefono('+52 33 1234 5678'),'523312345678');
 assert.equal(normalizarTelefono('3312345678'),'523312345678');
});
