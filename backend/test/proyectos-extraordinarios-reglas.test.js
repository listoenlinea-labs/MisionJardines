'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validarPaquete,key,cents}=require('../src/services/proyectos-extraordinarios-validacion.service');
const root=x=>fs.readFileSync(path.resolve(__dirname,'../../',x),'utf8');

const padron=Array.from({length:231},(_,i)=>({id:i+1,calle:'Jardines',calleCorrecta:'Jardines',numero:String(i+1)}));
const fecha='2026-11-03';
const proyecto=(code,name,price,specials=[],paid=[])=>({
 codigo:code,nombre:name,fechaInicio:'2026-11-01',cuotaBase:price,
 tarifasEspeciales:specials.map(n=>({calle:'Jardines',numero:String(n),monto:2500})),
 aportaciones:paid.map(([n,m],i)=>({calle:'Jardines',numero:String(n),monto:m,fecha,referencia:code+'-XLSX-'+(100+i)}))
});
const bundle=(...projects)=>({version:1,padronEsperado:231,proyectos:projects});

test('cada proyecto cobra exactamente 231 viviendas y aplica importes por casa',()=>{
 const selected=Array.from({length:19},(_,i)=>i+1);
 const input=bundle(
  proyecto('MJ-CALLE-JARDINES-2026','Reparación de calle Jardines',1000,selected,[[1,2500],[21,200]]),
  proyecto('MJ-MEJORAS-GENERALES-2026','Mejoras en acceso y áreas comunes',600,[],[[1,600],[2,400]])
 );
 const out=validarPaquete(input,padron);
 assert.deepEqual(out.errors,[]);
 assert.equal(out.proyectos[0].cargos.length,231);
 assert.equal(out.proyectos[0].cuotasEspeciales,19);
 assert.equal(out.proyectos[0].resumen.totalEsperado,259500);
 assert.equal(out.proyectos[0].resumen.recaudado,2700);
 assert.equal(out.proyectos[0].resumen.cumplidos,1);
 assert.equal(out.proyectos[0].resumen.parciales,1);
 assert.equal(out.proyectos[0].resumen.pendientes,229);
 assert.equal(out.proyectos[1].resumen.totalEsperado,138600);
 assert.equal(out.proyectos[1].resumen.parciales,1);
 assert.equal(out.proyectos[1].resumen.cumplidos,1);
 assert.equal(out.proyectos[1].resumen.recaudado,1000);
});

test('aportes superiores a la cuota se reconocen como saldo a favor sin perder dinero',()=>{
 const out=validarPaquete(bundle(proyecto('MJ-PROYECTO-2026','Prueba de crédito extraordinario',1000,[],[[5,1500]])),padron);
 assert.equal(out.proyectos[0].resumen.saldoFavor,500);
 assert.equal(out.proyectos[0].resumen.cumplidos,1);
 assert.equal(out.proyectos[0].resumen.recaudado,1500);
 assert.equal(out.proyectos[0].resumen.saldoPendiente,230000);
});
test('normalización de calle y número permite cotejar acentos, espacios y ceros',()=>{
 assert.equal(key('  JÁrdines  ','00173'),key('jardines','173'));
 assert.equal(cents('203500.00'),20350000);
});

test('la tarifa especial $0 reduce meta sin crear un pago artificial',()=>{
 const p=proyecto('MJ-PROYECTO-CERO-2026','Proyecto de prueba con exención',1000);
 p.tarifasEspeciales=[{calle:'Jardines',numero:'1',monto:0}];
 const result=validarPaquete(bundle(p),padron);
 assert.deepEqual(result.errors,[]);
 assert.equal(result.proyectos[0].cargos.find(h=>h.casaId===1).montoCentavos,0);
 assert.equal(result.proyectos[0].resumen.totalEsperado,230000);
 assert.equal(result.proyectos[0].cuotasEspeciales,1);
});
test('padrón inconsistente no permite crear cargos ni importar pagos',()=>{
 assert.throws(()=>validarPaquete(bundle(proyecto('MJ-PROYECTO-2026','Proyecto de prueba de pagos',600)),padron.slice(1)),{status:409});
 assert.throws(()=>validarPaquete(bundle(proyecto('MJ-PROYECTO-2026','Proyecto de prueba de pagos',600)),[...padron.slice(0,230),{...padron[0],id:300}]),{status:409});
});
test('vivienda inexistente, fecha errónea o referencia duplicada bloquean importación',()=>{
 const p=proyecto('MJ-PROYECTO-2026','Proyecto de prueba de pagos',600,[],[[1,600],[2,600]]);
 p.tarifasEspeciales=[{calle:'Desconocida',numero:'99',monto:2500}];
 p.aportaciones[1].referencia=p.aportaciones[0].referencia;
 const result=validarPaquete(bundle(p),padron);
 assert.equal(result.errors.length,2);
 assert.match(result.errors.join(' '),/referencia|Tarifa especial/);
});
test('tarifas de casas frente al parque por confirmar se hacen explícitas',()=>{
 const p=proyecto('MJ-PROYECTO-2026','Proyecto de prueba de pagos',1000);
 p.tarifasEspeciales=[{calle:'Jardines',numero:'253',monto:2500,requiereConfirmacion:true}];
 const out=validarPaquete(bundle(p),padron);
 assert.equal(out.proyectos[0].errors.length,1); // Jardines 253 está fuera del padrón de prueba.
 const p2=proyecto('MJ-PROYECTO-2026','Proyecto de prueba de pagos',1000);
 p2.tarifasEspeciales=[{calle:'Jardines',numero:'3',monto:2500,requiereConfirmacion:true}];
 const good=validarPaquete(bundle(p2),padron);
 assert.equal(good.proyectos[0].tarifasPorConfirmar,1);
 assert.match(good.warnings.join(' '),/confirmar/);
});
test('la respuesta por proyecto usa pagos parciales de ese proyecto solamente',()=>{
 const source=root('backend/src/services/proyectos-extraordinarios.service.js');
 const mod={exports:{}};
 const fake={
  sequelize:{Op:{},Transaction:{ISOLATION_LEVELS:{SERIALIZABLE:'SERIALIZABLE'}}},
  crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000000'},
  '../config/database':{},'../models':{},
  './cargos-extraordinarios.service':{},'./proyectos-extraordinarios-validacion.service':require('../src/services/proyectos-extraordinarios-validacion.service'),
  './vigencia-calculo':{fechaMexico:()=> '2026-11-03'}
 };
 new Function('module','exports','require',source)(mod,mod.exports,name=>{if(!(name in fake))throw Error(name);return fake[name];});
 const p=[{id:10,codigo:'P1',concepto:'Calle',activo:true,fechaInicio:'2026-11-01'},
          {id:11,codigo:'P2',concepto:'Accesos',activo:true,fechaInicio:'2026-11-01'}];
 const c=[{id:20,cuotaExtraordinariaId:10,casaId:1,monto:1000},
          {id:21,cuotaExtraordinariaId:11,casaId:1,monto:600}];
 const a=[{cargoExtraordinarioId:20,monto:400,fecha:'2026-11-03',referencia:'IMPORT20'},
          {cargoExtraordinarioId:21,monto:600,fecha:'2026-11-02',referencia:'IMPORT21'}];
 const actual=mod.exports.juntar(p,c,a,[],[],[{casaId:1,calle:'Jardines',numero:'1'}]);
 assert.equal(actual[0].parciales,1);
 assert.equal(actual[0].saldoPendiente,600);
 assert.equal(actual[0].recaudado,400);
 assert.equal(actual[1].cumplidos,1);
 assert.equal(actual[1].recaudado,600);
});
test('solo administración puede importar: previsualización y aprobación explícita',()=>{
 const routes=root('backend/src/routes/finanzas.routes.js'),
  service=root('backend/src/services/proyectos-extraordinarios.service.js'),
  ui=root('docs/assets/js/analisis-cuotas.js'),
  html=root('docs/analisis-cuotas.html');
 assert.match(routes,/router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
 assert.match(routes,/router\.post\('\/proyectos-extraordinarios\/previsualizar'/);
 assert.match(routes,/router\.post\('\/proyectos-extraordinarios\/importar'/);
 assert.match(service,/Transaction\.ISOLATION_LEVELS\.SERIALIZABLE/);
 assert.match(service,/if\(x\.prepared\.errors\.length\)/);
 assert.match(service,/!aceptarDiferencias/);
 assert.match(service,/!confirmarTarifas/);
 for(const id of ['financeProjectPanel','financeProjectSelect','financeProjectPreview',
  'financeProjectCommit','financeNewProjectForm','financeProjectApproveExceptions','financeProjectApproveDifference'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ui,/importacionPrevisualizada/);
 assert.match(ui,/confirmacion:'IMPORTAR'/);
 assert.match(ui,/data-edit-project-house/);
 assert.match(ui,/activeProyectoId/);
 assert.doesNotThrow(()=>new Function(ui));
});
test('migración de MySQL es idempotente y no toca las tablas de mantenimiento o TAGs',()=>{
 const schema=root('backend/src/services/proyectos-extraordinarios-schema.service.js');
 assert.match(schema,/information_schema\.COLUMNS/);
 assert.match(schema,/uq_cuota_extra_codigo/);
 assert.match(schema,/Aportacion\.sync\(\)/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS proyectos_cuotas_auditoria/);
 assert.doesNotMatch(schema,/TRUNCATE|DROP TABLE|DELETE FROM/);
});
