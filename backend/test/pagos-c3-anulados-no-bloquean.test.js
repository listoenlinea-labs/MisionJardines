'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {vinculosC3Bloqueantes}=require('../src/services/pagos-c3-vinculos-bloqueantes.service');
const c={id:2815,referencia:null,folio:null};
const anulado={id:46,casaId:542,origen:'CUOTA',origenId:2815,estado:'ANULADO',
 referencia:'MJMAN:2027-01-10:4ef8d39c-9767-4238-9f61-...',montoOrigen:600};
test('Rosas 10: movimiento 46 anulado no bloquea la cuota 2815 de noviembre',()=>{
 assert.deepEqual(vinculosC3Bloqueantes([anulado],c,[]),[]);
 assert.deepEqual(vinculosC3Bloqueantes([{...anulado,estado:' anulado '}],c,[]),[]);
});
test('un intento C3 todavía pendiente o aplicado sí bloquea un segundo cobro',()=>{
 for(const estado of ['PENDIENTE','EN_PROCESO','APLICADO','ERROR','SIN_CONFIRMAR']){
  const item={...anulado,estado};
  assert.deepEqual(vinculosC3Bloqueantes([item],c,[]),[item]);
 }
});
test('un vínculo por referencia activa sigue bloqueando',()=>{
 const e={...anulado,id:47,origen:'OTRO',origenId:999,estado:'PENDIENTE',referencia:'FOLIO-NOV-2815'};
 assert.deepEqual(vinculosC3Bloqueantes([e],{id:2815},['FOLIO-NOV-2815']),[e]);
 assert.deepEqual(vinculosC3Bloqueantes([{...e,estado:'ANULADO'}],{id:2815},['FOLIO-NOV-2815']),[]);
});
test('una cuota no se desbloquea si hay un anulado y otro movimiento activo',()=>{
 const activo={...anulado,id:47,estado:'PENDIENTE'};
 assert.deepEqual(vinculosC3Bloqueantes([anulado,activo],c,[]),[activo]);
});
test('el bloqueo bancario y las validaciones de cotización y confirmación no se eliminan',()=>{
 const file=fs.readFileSync(path.resolve(__dirname,'../src/controllers/pagos-manuales-analisis.controller.js'),'utf8');
 assert.match(file,/const c3=vinculosC3Bloqueantes\(eventos,cuota,refs\)/);
 assert.match(file,/const bank=bancos\.filter/);
 assert.match(file,/tipoPago:'MANTENIMIENTO'/);
 assert.match(file,/if\(!bank\.length&&!c3\.length\)continue/);
 assert.match(file,/await comprobarReferenciasVinculadas\(casaId,evaluadas\);/);
 assert.match(file,/await comprobarReferenciasVinculadas\(casaId,evaluadas,transaction\);/);
 assert.match(file,/if\(!revision\.registrable\)/);
 assert.match(file,/No se generará cobro ni orden duplicada al C3/);
});
