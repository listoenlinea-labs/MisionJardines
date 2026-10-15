'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
Object.assign(process.env, {
 DB_HOST: process.env.DB_HOST || 'localhost',
 DB_PORT: process.env.DB_PORT || '3306',
 DB_NAME: process.env.DB_NAME || 'test',
 DB_USER: process.env.DB_USER || 'test',
 DB_PASSWORD: process.env.DB_PASSWORD || 'unused',
 JWT_SECRET: process.env.JWT_SECRET || 'test-secret'
});
const { Op } = require('sequelize');
const { Visita, Acceso, UsuarioCasa } = require('../src/models');
const { obtenerDashboardOperativo } = require('../src/controllers/dashboard-operativo.controller');

async function withMocks(links, callback) {
 const originals = {
  links: UsuarioCasa.findAll, vc: Visita.count, vf: Visita.findAll,
  ac: Acceso.count, af: Acceso.findAll
 };
 const spy = { visits: [], access: [], links: [] };
 UsuarioCasa.findAll = async options => { spy.links.push(options); return links; };
 Visita.count = async options => { spy.visits.push(options); return options.where.estatus === 'PROGRAMADA' ? 2 :
   options.where.estatus === 'EN_CURSO' ? 1 : 3; };
 Acceso.count = async options => { spy.access.push(options); return 2; };
 Visita.findAll = async options => {
   spy.visits.push(options);
   return [{id:1,nombreVisitante:'Visitante autorizado',horaProgramada:'10:15:00',
     estatus:'PROGRAMADA',fechaEntrada:null,casa:{calleCorrecta:'Gardenias',numero:'7'}}];
 };
 Acceso.findAll = async options => {
   spy.access.push(options);
   return [{id:1,nombre:'Persona dentro',tipo:'VISITA',
     fechaEntrada:new Date('2026-10-14T15:25:00Z'),casa:{calleCorrecta:'Gardenias',numero:'7'}}];
 };
 try { return await callback(spy); }
 finally {
  UsuarioCasa.findAll=originals.links;Visita.count=originals.vc;Visita.findAll=originals.vf;
  Acceso.count=originals.ac;Acceso.findAll=originals.af;
 }
}
async function call(role,spyUser={}) {
 let code=200,body;
 const res = {status(n){code=n;return this;},json(v){body=v;return this;}};
 await obtenerDashboardOperativo({usuario:{rol:role,usuarioId:4,casaId:999,...spyUser}},res);
 return {code,body};
}

test('Seguridad recibe visitas y accesos de TODO el fraccionamiento sin saldo ni cuotas',async()=>{
 await withMocks([],async spy=>{
  const {code,body}=await call('SEGURIDAD');
  assert.equal(code,200);
  assert.equal(body.vista,'OPERATIVA');
  assert.equal(body.alcance,'FRACCIONAMIENTO');
  assert.equal(body.kpis.visitas.hoy,3);
  assert.equal(body.kpis.accesos.activos,2);
  assert.equal(body.operativo.visitas[0].vivienda,'Gardenias 7');
  assert.equal(body.operativo.accesos[0].nombre,'Persona dentro');
  for(const q of [...spy.visits,...spy.access])assert.equal('casaId' in q.where,false);
  assert.equal(spy.links.length,0);
  for(const key of ['recaudacion','cuotas','residentes','actividad','eventos','errores'])
    assert.equal(key in body,false,'Sin campos sensibles: '+key);
 });
});

test('Residente solo recibe registros de las viviendas vinculadas por el servidor',async()=>{
 await withMocks([{casaId:7},{casaId:9},{casaId:7}],async spy=>{
  const {body}=await call('CONDOMINO',{casaId:999});
  assert.equal(body.alcance,'MIS_VIVIENDAS');
  assert.equal(spy.links[0].where.usuarioId,4);
  assert.equal(spy.links[0].where.activo,true);
  for(const q of [...spy.visits,...spy.access])
    assert.deepEqual(q.where.casaId[Op.in],[7,9]);
 });
});

test('Usuario sin vínculos no puede consultar todas las viviendas por accidente',async()=>{
 await withMocks([],async spy=>{
  const {body}=await call('CONDOMINO');
  assert.equal(body.ok,true);
  for(const q of [...spy.visits,...spy.access])
    assert.deepEqual(q.where.casaId[Op.in],[-1]);
 });
});

test('Visitas del día excluyen canceladas; activos exigen ausencia de salida',async()=>{
 await withMocks([{casaId:7}],async spy=>{
  await call('CONDOMINO');
  for(const q of spy.visits){
   assert.equal(typeof q.where.fechaProgramada,'string');
   if(typeof q.where.estatus==='object')assert.equal(q.where.estatus[Op.ne],'CANCELADA');
  }
  for(const q of spy.access) assert.equal(q.where.fechaSalida,null);
  assert.ok(spy.visits.find(q=>q.limit===15));
  assert.ok(spy.access.find(q=>q.limit===15));
 });
});

test('El dashboard administrador sigue separado y operativo se resuelve antes de finanzas',()=>{
 const controller=fs.readFileSync(path.resolve(__dirname,'../src/controllers/dashboard.controller.js'),'utf8');
 const start=controller.indexOf('async function obtenerDashboard(req, res) {');
 const role=controller.indexOf("if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(req.usuario.rol))",start);
 const finance=controller.indexOf("consultaSegura(",start);
 assert.ok(start>=0&&role>start&&finance>role);
 assert.match(controller,/return obtenerDashboardOperativo\(req, res\)/);
 assert.match(controller,/recaudacionRows/);
 assert.match(controller,/const fuentes = \{/);
});

test('Frontend usa la respuesta operativa antes del dashboard financiero',()=>{
 const js=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/home-dashboard.js'),'utf8');
 const start=js.indexOf('function renderDashboard(data)');
 const op=js.indexOf("if (data?.vista === 'OPERATIVA') return renderOperationalDashboard(data);",start);
 const finance=js.indexOf('const q = k.cuotas || {};',start);
 assert.ok(start>=0&&op>start&&finance>op);
 assert.match(js,/function renderOperationalDashboard\(data\)/);
 assert.match(js,/function renderEnvironmentMarkup\(\)/);
 assert.match(js,/href: 'analisis-cuotas\.html', label: 'Ver cuotas'/);
 assert.match(js,/roles: \['SUPER_ADMIN','ADMINISTRADOR'\]/);
 assert.match(js,/hl-op-map/);
 assert.match(js,/hl-op-grid/);
 assert.doesNotMatch(js.slice(js.indexOf('function renderOperationalDashboard(data)'),start),/recaudacion|hl-collection|hl-finance-flip/);
});
