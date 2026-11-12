'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'test',JWT_SECRET:'test'});
const db=require('../src/config/database');
const {Casa}=require('../src/models');
const Tarjeta=require('../src/models/TarjetaRojaCasaClub');
const Sancion=require('../src/models/SancionCasaClub');
const Config=require('../src/models/ConfiguracionTarjetasRojas');
const service=require('../src/services/casa-club-tarjetas-rojas.service');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');

test('la cuarta tarjeta activa suspende; la tercera NO suspende, y el retiro deshace la sanción',async t=>{
 const cards=[],sanciones=new Map();
 const settings={aniosBloqueo:1,async update(data){Object.assign(this,data)}};
 t.mock.method(db,'transaction',async fn=>fn({LOCK:{UPDATE:'UPDATE'}}));
 t.mock.method(Casa,'findByPk',async id=>({id:Number(id)}));
 t.mock.method(Config,'findByPk',async()=>settings);
 t.mock.method(Tarjeta,'count',async({where})=>cards.filter(c=>c.casaId===where.casaId&&!c.retiradaEn).length);
 t.mock.method(Tarjeta,'create',async data=>{
  const row={...data,id:cards.length+1,retiradaEn:null,
   async update(patch){Object.assign(this,patch)}};
  cards.push(row);return row;
 });
 t.mock.method(Tarjeta,'findByPk',async id=>cards.find(c=>Number(c.id)===Number(id))||null);
 t.mock.method(Tarjeta,'findAll',async({where})=>cards.filter(c=>c.casaId===where.casaId&&
  (where.retiradaEn===undefined||!c.retiradaEn)));
 t.mock.method(Sancion,'findByPk',async casaId=>sanciones.get(Number(casaId))||null);
 t.mock.method(Sancion,'create',async data=>{
  const row={...data,async update(patch){Object.assign(this,patch)}};
  sanciones.set(Number(data.casaId),row);return row;
 });
 t.mock.method(Sancion,'findAll',async()=>[...sanciones.values()].filter(s=>s.bloqueadoHasta));
 for(let i=0;i<3;i++)await service.agregar(5,'Falta documentada número '+(i+1),17);
 assert.equal((await service.obtener(5)).bloqueada,false);
 assert.equal((await service.obtener(5)).totalActivas,3);
 await service.agregar(5,'Cuarta falta documentada',17);
 assert.equal((await service.obtener(5)).bloqueada,true);
 await assert.rejects(()=>service.exigirDisponible(5),{status:409,codigo:'TARJETAS_ROJAS'});
 await service.retirar(4,'Se acreditó que la tarjeta fue asignada por error',21);
 assert.equal((await service.obtener(5)).bloqueada,false);
 assert.equal((await service.obtener(5)).totalActivas,3);
 const historial=await service.obtener(5,{historial:true});
 assert.equal(historial.tarjetas.length,4);
 assert.equal(historial.tarjetas.filter(x=>!x.activa).length,1);
 assert.match(historial.tarjetas.find(x=>!x.activa).motivoRetiro,/por error/);
 await service.configurarAnios(2,21);
 const added=await service.agregar(5,'Nueva falta registrada después del retiro',17);
 assert.equal(added.bloqueadoHasta,service.sumarAnios(service.diaMexico(),2));
});
test('el rol SEGURIDAD puede asignar y retirar, pero solo ADMINISTRACIÓN configura los años',()=>{
 const routes=read('backend/src/routes/casa-club.routes.js');
 const controller=read('backend/src/controllers/casa-club-tarjetas-rojas.controller.js');
 assert.match(routes,/autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR','SEGURIDAD'\)/);
 assert.match(routes,/router\.patch\('\/tarjetas-rojas\/configuracion',admins/);
 assert.match(controller,/if\(!rolAdmin\(req\)\)/);
 assert.match(routes,/tarjetas-rojas\/mias',autorizarRoles\('CONDOMINO'\)/);
});
test('vivienda morosa o suspendida se bloquea también desde solicitud pública',()=>{
 const c=read('backend/src/controllers/casa-club.controller.js');
 assert.match(c,/consultarSoloMantenimiento\(casaId\)/);
 assert.match(c,/tarjetasRojas\.exigirDisponible\(casaId\)/);
 assert.match(c,/e\.codigo==='TARJETAS_ROJAS'/);
 const ui=read('docs/assets/js/casa-club.js');
 assert.match(ui,/if\(err\.codigo==='TARJETAS_ROJAS'\)/);
 assert.match(ui,/tarjetas-rojas\/mias/);
});
test('al registrar o levantar tarjeta se conserva auditoría y no se toca ZKTeco',()=>{
 const model=read('backend/src/models/TarjetaRojaCasaClub.js');
 const serviceSource=read('backend/src/services/casa-club-tarjetas-rojas.service.js');
 for(const key of ['asignadaPor','asignadaEn','retiradaEn','retiradaPor','motivoRetiro'])assert.match(model,new RegExp(key));
 assert.doesNotMatch(serviceSource,/zkteco|tag|pluma/i);
});
test('reservas pagadas dejan de generar burbuja en Pagos, incluso con bandera antigua',()=>{
 const debt=read('backend/src/services/adeudos-comunidad.service.js');
 const ui=read('docs/assets/js/pagos.js');
 assert.match(debt,/VALIDADO/);
 assert.match(debt,/PagoManualConcepto\.findAll/);
 assert.match(debt,/reservas\.filter\(r=>!paid\.has\(String\(r\.id\)\)\)/);
 assert.match(ui,/clubItems\.find/);
 assert.match(ui,/setInterval\(\(\)=>\{if\(!document\.hidden\)void loadDebts/);
});
