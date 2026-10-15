'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {clave,estadoTag,tagsParaViviendas}=require('../src/services/analisis-tags.service');
const ahora=Date.parse('2026-10-14T18:00:00Z');
const opciones={ahora,hoy:'2026-10-14'};
const tag=(extra={})=>({id:1,casaId:388,numeroTarjeta:'000123',enControlador:true,
  fechaFin:'2026-11-10',bloqueado:false,puertasAutorizadas:3,
  ultimaLectura:new Date(ahora-60000),...extra});

test('TAG habilitado con lectura reciente, permisos y vigencia es ACTIVO (snapshot)',()=>{
 assert.equal(estadoTag(tag(),opciones).codigo,'ACTIVO');
});
test('TAG bloqueado o vencido es INACTIVO si el inventario es reciente',()=>{
 assert.equal(estadoTag(tag({bloqueado:true}),opciones).codigo,'INACTIVO');
 assert.equal(estadoTag(tag({fechaFin:'2026-10-10'}),opciones).codigo,'INACTIVO');
});
test('Estado sin evidencia reciente o sin permiso nunca se presenta como activo',()=>{
 assert.equal(estadoTag(tag({enControlador:false}),opciones).codigo,'SIN_CONFIRMAR');
 assert.equal(estadoTag(tag({ultimaLectura:new Date(ahora-3600000)}),opciones).codigo,'SIN_CONFIRMAR');
 assert.equal(estadoTag(tag({ultimaLectura:null}),opciones).codigo,'SIN_CONFIRMAR');
 assert.equal(estadoTag(tag({puertasAutorizadas:null}),opciones).codigo,'SIN_CONFIRMAR');
});
test('La tabla asocia tags por casaId y cuenta una tarjeta una sola vez',()=>{
 const map=tagsParaViviendas([{id:388,controles:'000123, 000456'}],[
   tag(),tag({id:2,casaId:388,numeroTarjeta:'456',bloqueado:true})
 ],opciones);
 const r=map.get('388');
 assert.equal(r.total,2);
 assert.equal(r.activos,1);assert.equal(r.inactivos,1);
 assert.equal(r.controlesNoEnlazados.length,0);
});
test('Identifica control huérfano por número normalizado, sin cruzar vivienda ajena',()=>{
 assert.equal(clave('000123'),'123');
 const map=tagsParaViviendas([{id:2,controles:'000123, 999, 777'}],[
   tag({id:3,casaId:null,numeroTarjeta:'123'}),
   tag({id:4,casaId:388,numeroTarjeta:'777'})
 ],opciones);
 const r=map.get('2');
 assert.equal(r.total,1);
 assert.deepEqual(r.controlesNoEnlazados,['999','777']);
});
test('Las viviendas sin TAGs tienen contador cero explícito',()=>{
 const r=tagsParaViviendas([{id:5,controles:null}],[],opciones).get('5');
 assert.equal(r.total,0);assert.equal(r.sinConfirmar,0);
});
test('Análisis muestra TAGs y conserva registro de pago dentro del modal',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
 const ui=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-cuotas.js'),'utf8');
 assert.match(html,/<th>TAGs<\/th>/);
 assert.doesNotMatch(html,/<th>Acción<\/th>/);
 for(const id of ['houseTagsModal','houseTagsRows','houseTagsRefresh','houseTagsPay','houseTagsEdit']){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(ui,/data-tags-house/);
 assert.match(ui,/diagnostico\/viviendas\//);
 assert.match(ui,/h\.ultimoMesPagado/);
 assert.match(ui,/openHousePayment\(id\)/);
 assert.match(ui,/URLSearchParams\(\{casaId:/);
});
test('ZKTeco consume casaId y solo pierde filtro exacto al buscar o limpiar',()=>{
 const zkteco=fs.readFileSync(path.resolve(__dirname,'../../docs/zkteco.html'),'utf8');
 const service=fs.readFileSync(path.resolve(__dirname,'../src/services/zkteco-direct.service.js'),'utf8');
 assert.match(zkteco,/linkParams\.get\('casaId'\)/);
 assert.match(zkteco,/q\.set\('casaId',String\(linkedCasaId\)\)/);
 assert.match(service,/async function dashboard\(\{calle,numero,tag,pagina,limite,casaId\}/);
 assert.match(service,/where:\{id:exactHouseId\}/);
});
