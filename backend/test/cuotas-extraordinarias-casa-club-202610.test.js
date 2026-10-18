'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
Object.assign(process.env,{DB_HOST:'localhost',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'test',JWT_SECRET:'clave-sintetica-pruebas'});
const {distribuir,padronOficial}=require('../src/services/cargos-extraordinarios.service');
const {Casa,Cuota}=require('../src/models');

test('un egreso extraordinario se reparte en exactamente 231 viviendas y centavos exactos',()=>{
 const casas=Array.from({length:231},(_,i)=>({id:i+1}));
 const rows=distribuir(123456.78,casas,7,'2026-11-01');
 assert.equal(rows.length,231*7);
 assert.equal(rows.reduce((sum,r)=>sum+Math.round(r.monto*100),0),12345678);
 assert.equal(new Set(rows.filter(r=>r.periodo==='2026-11-01').map(r=>r.casaId)).size,231);
 assert.equal(new Set(rows.map(r=>r.periodo)).size,7);
 const values=new Set(rows.map(r=>Math.round(r.monto*100)));
 assert.ok(Math.max(...values)-Math.min(...values)<=1);
});
test('ningún cargo se emite con padrón distinto a las 231 casas acordadas',async t=>{
 t.mock.method(Casa,'findAll',async()=>Array.from({length:232},(_,i)=>({id:i+1,calle:'Gardenias',numero:String(i+1)})));
 t.mock.method(Cuota,'findAll',async()=>[]);
 await assert.rejects(padronOficial(),{status:409});
});
test('se rechazan proyectos que no cubren un centavo por casa y mes',()=>{
 assert.throws(()=>distribuir(1,Array.from({length:231},(_,i)=>({id:i+1})),2,'2026-11-01'),{status:400});
});
test('frontend incluye tres conceptos, avisos y registro por categoría, sin escrituras extraordinarias al C3',()=>{
 const root=path.resolve(__dirname,'../..');
 const pagos=fs.readFileSync(path.join(root,'docs/pagos.html'),'utf8');
 const analisis=fs.readFileSync(path.join(root,'docs/analisis-cuotas.html'),'utf8');
 const js=fs.readFileSync(path.join(root,'docs/assets/js/analisis-cuotas.js'),'utf8');
 const backend=fs.readFileSync(path.join(root,'backend/src/controllers/pagos-manuales-analisis.controller.js'),'utf8');
 assert.match(pagos,/data-tab="CASA_CLUB"/);
 assert.match(pagos,/id="debtModal"/);
 assert.match(analisis,/id="housePaymentType"/);
 assert.match(analisis,/id="expenseMonths"/);
 assert.match(js,/request\('\/pagos-concepto'/);
 assert.match(backend,/PagoManualConcepto\.create/);
 const other=backend.slice(backend.indexOf('async function registrarPagoConcepto'));
 assert.doesNotMatch(other,/registrarLoteManual|vigenciaService\.actualizar|writeUserValidity/);
});
