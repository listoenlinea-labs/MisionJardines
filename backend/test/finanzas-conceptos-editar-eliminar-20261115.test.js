'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'../..');
const controller=fs.readFileSync(path.join(base,'backend/src/controllers/finanzas.controller.js'),'utf8');
const routes=fs.readFileSync(path.join(base,'backend/src/routes/finanzas.routes.js'),'utf8');
const html=fs.readFileSync(path.join(base,'docs/analisis-cuotas.html'),'utf8');
const ui=fs.readFileSync(path.join(base,'docs/assets/js/analisis-cuotas.js'),'utf8');
const css=fs.readFileSync(path.join(base,'docs/assets/css/analisis-cuotas.css'),'utf8');
const {resumen}=require('../../docs/assets/js/costos-presupuesto-proyecto.js');

function helpers(model={findByPk:async()=>null},linked={findOne:async()=>null}){
 const start=controller.indexOf('function validarDatosConcepto(body){');
 const end=controller.indexOf('async function editarConceptoProyecto(req,res){',start);
 assert.ok(start>0&&end>start);
 const sandbox={
  Egreso:model,CuotaExtraordinaria:linked,
  fail:(status,message)=>Object.assign(new Error(message),{status})
 };
 vm.runInNewContext(controller.slice(start,end)+
  ';globalThis.helpers={validarDatosConcepto,estadoConcepto,validarVersionConcepto,conceptoEditableProyecto,solicitudConcepto};',sandbox);
 return sandbox.helpers;
}
const previo={concepto:'Barandal',fecha:'2026-11-14',monto:29300,
 incluidoPresupuesto:true,pagado:true};
const row={id:83,proyectoId:12,categoria:'PROYECTO',ambito:'EXTRAORDINARIO',
 ...previo,comprobanteArchivo:'abc.pdf'};

test('editar concepto valida fecha, monto entero, nombre y palomitas',()=>{
 const v=helpers().validarDatosConcepto;
 assert.equal(v(previo).monto,29300);
 assert.throws(()=>v({...previo,monto:19.7}),/importe entero/);
 assert.throws(()=>v({...previo,fecha:'2026-02-30'}),/fecha/);
 assert.throws(()=>v({...previo,concepto:' '}),/Nombre/);
 assert.throws(()=>v({...previo,pagado:'sí'}),/estados/);
});
test('editar o eliminar requiere el mismo proyecto y rechaza egresos vinculados',async()=>{
 const ok=helpers({findByPk:async()=>row}).conceptoEditableProyecto;
 assert.equal((await ok(83,12,{LOCK:{UPDATE:'UPDATE'}})).id,83);
 await assert.rejects(ok(83,13,{LOCK:{UPDATE:'UPDATE'}}),/No se encontró/);
 const linked=helpers({findByPk:async()=>row},{findOne:async()=>({id:44})}).conceptoEditableProyecto;
 await assert.rejects(linked(83,12,{LOCK:{UPDATE:'UPDATE'}}),/cuotas vinculadas/);
});
test('cambios de otro administrador se rechazan antes de guardar o eliminar',()=>{
 const {validarVersionConcepto,estadoConcepto}=helpers();
 assert.equal(estadoConcepto(row).monto,29300);
 assert.doesNotThrow(()=>validarVersionConcepto(row,previo));
 assert.throws(()=>validarVersionConcepto({...row,monto:30500},previo),/otra sesión/);
 assert.throws(()=>validarVersionConcepto({...row,pagado:false},previo),/otra sesión/);
});
test('endpoints son exclusivos del administrador y registran auditoría antes de eliminar',()=>{
 assert.match(routes,/router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
 assert.match(routes,/router\.patch\('\/egresos\/:id\/concepto',controller\.editarConceptoProyecto\)/);
 assert.match(routes,/router\.delete\('\/egresos\/:id\/concepto',controller\.eliminarConceptoProyecto\)/);
 assert.match(controller,/EDITAR_CONCEPTO_PROYECTO/);
 assert.match(controller,/ELIMINAR_CONCEPTO_PROYECTO/);
 assert.match(controller,/validarVersionConcepto\(row,anterior\)/);
 assert.match(controller,/await row\.destroy\(\{transaction\}\)/);
 const deletion=controller.slice(controller.indexOf('async function eliminarConceptoProyecto'),
  controller.indexOf('async function comprobanteEgreso'));
 assert.ok(deletion.indexOf('await sequelize.query(')<deletion.indexOf('await row.destroy('));
 assert.ok(deletion.indexOf('await row.destroy(')<deletion.indexOf('await archivosEgresos.eliminar(comprobante)'));
});
test('interfaz integra editar, eliminar, confirmación, recarga y uso móvil',()=>{
 for(const id of ['financeProjectProofEditOpen','financeProjectProofDelete','financeProjectProofEditForm',
  'financeProjectProofEditName','financeProjectProofEditAmount','financeProjectProofEditDate',
  'financeProjectProofEditIncluded','financeProjectProofEditPaid'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ui,/financeProjectProofDelete'\)\.addEventListener\('click'/);
 assert.match(ui,/financeProjectProofEditForm'\)\.addEventListener\('submit'/);
 assert.match(ui,/\/egresos\/'\+id\+'\/concepto'.*'DELETE'/);
 assert.match(ui,/\/egresos\/'\+id\+'\/concepto'.*'PATCH'/);
 assert.match(ui,/confirm\(aviso\)/);
 assert.match(ui,/const ok=await load\(\)/);
 assert.match(css,/finance-project-proof-edit-form/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(html,/analisis-cuotas\.js\?v=20261115-editar-eliminar-concepto-v1/);
});
test('eliminar un concepto cambia solo el proyecto seleccionado y su saldo',()=>{
 const p={presupuestoBase:138600,recaudado:62700,gastosConceptos:[
  {monto:29300,incluidoPresupuesto:true,pagado:true}]};
 assert.equal(resumen(p).presupuestoRestante,109300);
 assert.equal(resumen({...p,gastosConceptos:[]}).presupuestoRestante,138600);
 const q={presupuestoBase:50000,recaudado:20000,gastosConceptos:[]};
 assert.equal(resumen(q).costoComprometido,50000);
 const additional={...p,gastosConceptos:[...p.gastosConceptos,{monto:2000,incluidoPresupuesto:false,pagado:true}]};
 assert.equal(resumen(additional).costoComprometido,140600);
 assert.equal(resumen({...additional,gastosConceptos:p.gastosConceptos}).costoComprometido,138600);
});
