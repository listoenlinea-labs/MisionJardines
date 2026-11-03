'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {verificarSnapshotCuotas}=require('../src/services/proyectos-cuotas-version.service');

const cargos=Array.from({length:231},(_,i)=>({casaId:i+1,monto:1000}));
const snapshot={cuotaBase:1000,cargos:cargos.map(c=>({casaId:c.casaId,monto:c.monto}))};

test('admite una versión vigente de las 231 cuotas',()=>{
 assert.equal(verificarSnapshotCuotas(snapshot,{monto:1000},cargos),true);
});
test('rechaza cuando otra pantalla cambió el importe general',()=>{
 assert.throws(()=>verificarSnapshotCuotas(snapshot,{monto:900},cargos),e=>e.status===409);
});
test('rechaza cuando el historial cambió una cuota individual',()=>{
 const updated=cargos.map(c=>({...c}));updated[2].monto=750;
 assert.throws(()=>verificarSnapshotCuotas(snapshot,{monto:1000},updated),e=>e.status===409);
});
test('rechaza versiones incompletas o duplicadas',()=>{
 assert.throws(()=>verificarSnapshotCuotas({...snapshot,cargos:snapshot.cargos.slice(1)},{monto:1000},cargos),e=>e.status===400);
 const repeated=snapshot.cargos.map(c=>({...c}));repeated[1].casaId=1;
 assert.throws(()=>verificarSnapshotCuotas({...snapshot,cargos:repeated},{monto:1000},cargos),e=>e.status===400);
});

test('acepta cuotas individuales en $0 en snapshot',()=>{
 const withZero=cargos.map(c=>({...c}));withZero[29].monto=0;
 assert.equal(verificarSnapshotCuotas({cuotaBase:1000,cargos:withZero.map(c=>({...c}))},{monto:1000},withZero),true);
});
test('acepta cuota general $0 en snapshot',()=>{
 const free=cargos.map(c=>({...c,monto:0}));
 assert.equal(verificarSnapshotCuotas({cuotaBase:0,cargos:free.map(c=>({...c}))},{monto:0},free),true);
});
