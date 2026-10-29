const test=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'test',JWT_SECRET:'test-secret'});
const {Casa,UsuarioCasa,Cuota,CargoExtraordinario}=require('../src/models');
const Reserva=require('../src/models/ReservaCasaClub');
const PagoReportado=require('../src/models/PagoReportado');
const PagoManualConcepto=require('../src/models/PagoManualConcepto');
const club=require('../src/controllers/casa-club.controller');
function res(){return{code:200,body:null,headers:{},status(n){this.code=n;return this;},setHeader(k,v){this.headers[k]=v;},json(v){this.body=v;return this;}};}
const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const req=overrides=>({usuario:{usuarioId:19,rol:'CONDOMINO',casaId:5},body:{fecha:day,solicitante:'Prueba Usuario',telefono:'3331234567',correo:'persona@example.com',motivo:'Cumpleaños',casaId:5,propietario:true},...overrides});
function sinAdeudos(t){
 t.mock.method(Reserva,'findAll',async()=>[]); // no reservas aprobadas por expirar ni cobros de club
 t.mock.method(CargoExtraordinario,'findAll',async()=>[]);
 const mesNombres=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
 const [year,month]=day.split('-').map(Number),cuotas=[];
 for(let y=2026;y<=year;y++)for(let m=y===2026?9:1;m<=(y===year?month:12);m++)cuotas.push({anio:y,mes:mesNombres[m-1],estatusPago:'PAGADO',montoPagado:300});
 t.mock.method(Cuota,'findAll',async()=>cuotas);
}
test('resident puede solicitar la fecha solo para su vivienda activa y queda pendiente',async t=>{
 sinAdeudos(t);
 t.mock.method(Casa,'findByPk',async()=>({id:5}));
 t.mock.method(UsuarioCasa,'findOne',async()=>({casaId:5,activo:true}));
 let created=null;
 t.mock.method(Reserva,'create',async v=>{created=v;return{id:71};});
 const response=res();
 await club.crear(req(),response);
 assert.equal(response.code,201);
 assert.equal(created.estatus,'PENDIENTE');
 assert.equal(created.fechaBloqueada,day);
 assert.equal(created.casaId,5);
 assert.equal(created.usuarioId,19);
 assert.equal(created.propietario,true);
});
test('no permite reservar una vivienda ajena',async t=>{
 sinAdeudos(t);
 t.mock.method(Casa,'findByPk',async()=>({id:99}));
 t.mock.method(UsuarioCasa,'findOne',async()=>null);
 let wrote=false;
 t.mock.method(Reserva,'create',async()=>{wrote=true;});
 const response=res();
 await club.crear(req({body:{...req().body,casaId:99}}),response);
 assert.equal(response.code,403);assert.equal(wrote,false);
});
test('no acepta solicitudes de casa club con mantenimiento vencido',async t=>{
 t.mock.method(Reserva,'findAll',async()=>[]);
 t.mock.method(CargoExtraordinario,'findAll',async()=>[]);
 t.mock.method(Cuota,'findAll',async()=>[]);
  t.mock.method(Casa,'findByPk',async()=>({id:5}));
  t.mock.method(UsuarioCasa,'findOne',async()=>({casaId:5,activo:true}));
 let wrote=false;t.mock.method(Reserva,'create',async()=>{wrote=true;});
 const response=res();await club.crear(req(),response);
 assert.equal(response.code,409);assert.equal(wrote,false);
 assert.match(response.body.message,/adeudos/i);
  assert.equal(response.body.codigo,'ADEUDOS_RESERVA');
  assert.ok(response.body.adeudos.totales.MANTENIMIENTO>0);
});
test('permite reservar aunque tenga una deuda exclusiva de Casa club',async t=>{
 const monthNames=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
 const [year,month]=day.split('-').map(Number),cuotas=[];
 for(let y=2026;y<=year;y++)for(let m=y===2026?9:1;m<=(y===year?month:12);m++)
  cuotas.push({anio:y,mes:monthNames[m-1],estatusPago:'PAGADO',montoPagado:300});
 t.mock.method(Cuota,'findAll',async()=>cuotas);
 t.mock.method(CargoExtraordinario,'findAll',async()=>[]);
 t.mock.method(Reserva,'findAll',async options=>options.attributes?.length===1?[]:[{
  id:100,fecha:day,fechaLimitePago:day,cuotaRecuperacion:700,depositoGarantia:700,limpieza:0
 }]);
 t.mock.method(PagoReportado,'findAll',async()=>[]);
 t.mock.method(Casa,'findByPk',async()=>({id:5}));
 t.mock.method(UsuarioCasa,'findOne',async()=>({casaId:5,activo:true}));
 let created=false;
 t.mock.method(Reserva,'create',async()=>{created=true;return {id:101};});
 const response=res();await club.crear(req(),response);
 assert.equal(response.code,201);
 assert.equal(created,true);
});
test('impide reservar si hay un cargo extraordinario exigible y muestra el monto',async t=>{
 const monthNames=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
 const [year,month]=day.split('-').map(Number),cuotas=[];
 for(let y=2026;y<=year;y++)for(let m=y===2026?9:1;m<=(y===year?month:12);m++)
  cuotas.push({anio:y,mes:monthNames[m-1],estatusPago:'PAGADO',montoPagado:300});
 t.mock.method(Cuota,'findAll',async()=>cuotas);
 t.mock.method(CargoExtraordinario,'findAll',async()=>[{
  id:81,periodo:day.slice(0,7)+'-01',monto:123.45,cuota:{concepto:'Pintura comunitaria'},cuotaExtraordinariaId:20
 }]);
 t.mock.method(PagoReportado,'findAll',async()=>[]);
 t.mock.method(PagoManualConcepto,'findAll',async()=>[]);
 t.mock.method(Reserva,'findAll',async()=>[]);
 t.mock.method(Casa,'findByPk',async()=>({id:5}));
 t.mock.method(UsuarioCasa,'findOne',async()=>({casaId:5,activo:true}));
 let created=false;
 t.mock.method(Reserva,'create',async()=>{created=true;});
 const response=res();await club.crear(req(),response);
 assert.equal(response.code,409);
 assert.equal(response.body.codigo,'ADEUDOS_RESERVA');
 assert.equal(response.body.adeudos.totales.EXTRAORDINARIO,123.45);
 assert.equal(created,false);
});
test('la colisión de fecha única produce respuesta 409 para evitar dobles reservas',async t=>{
 sinAdeudos(t);
 t.mock.method(Casa,'findByPk',async()=>({id:5}));
 t.mock.method(UsuarioCasa,'findOne',async()=>({activo:true}));
 t.mock.method(Reserva,'create',async()=>{const e=new Error('duplicate');e.name='SequelizeUniqueConstraintError';throw e;});
 const response=res();await club.crear(req(),response);
 assert.equal(response.code,409);
});
test('fechas ocupadas muestran únicamente la fecha y su estado',async t=>{
 t.mock.method(Reserva,'findAll',async options=>options.where.fechaBloqueada?[{fecha:day,estatus:'APROBADA',usuarioId:34,telefono:'privado'}]:[]);
 const response=res();await club.fechas({query:{}},response);
 assert.equal(response.code,200);
 assert.deepEqual(response.body.ocupadas,[{fecha:day,estatus:'APROBADA'}]);
 assert.equal(JSON.stringify(response.body).includes('privado'),false);
});

test('ADMINISTRADOR reserva inmediatamente con cargos sin marcarlos pagados',async t=>{
 sinAdeudos(t);
 t.mock.method(Casa,'findByPk',async()=>({id:5}));
 t.mock.method(UsuarioCasa,'findOne',async()=>({casaId:5,activo:true}));
 let payload=null;
 t.mock.method(Reserva,'create',async v=>{payload=v;return{id:303};});
 const nextWeek=new Date(Date.parse(day+'T12:00:00Z')+7*86400000).toISOString().slice(0,10);
 const response=res();
 await club.crear(req({usuario:{usuarioId:19,rol:'ADMINISTRADOR',casaId:5},
  body:{...req().body,fecha:nextWeek}}),response);
 assert.equal(response.code,201);
 assert.equal(response.body.data.estatus,'APROBADA');
 assert.match(response.body.message,/Reserva confirmada/);
 assert.deepEqual({
  estatus:payload.estatus,fechaBloqueada:payload.fechaBloqueada,
  cuotaRecuperacion:payload.cuotaRecuperacion,depositoGarantia:payload.depositoGarantia,
  limpieza:payload.limpieza,fechaLimitePago:payload.fechaLimitePago,pagado:payload.pagado,
  revisadoPor:payload.revisadoPor
 },{
  estatus:'APROBADA',fechaBloqueada:nextWeek,
  cuotaRecuperacion:700,depositoGarantia:700,limpieza:0,
  fechaLimitePago:new Date(Date.parse(nextWeek+'T12:00:00Z')-86400000).toISOString().slice(0,10),
  pagado:false,revisadoPor:19
 });
});

test('SUPER_ADMIN también reserva directamente, incluso para fecha de hoy',async t=>{
 sinAdeudos(t);
 t.mock.method(Casa,'findByPk',async()=>({id:5}));
 t.mock.method(UsuarioCasa,'findOne',async()=>({casaId:5,activo:true}));
 let payload=null;
 t.mock.method(Reserva,'create',async v=>{payload=v;return{id:304};});
 const response=res();
 await club.crear(req({usuario:{usuarioId:91,rol:'SUPER_ADMIN',casaId:5}}),response);
 assert.equal(response.code,201);
 assert.equal(payload.estatus,'APROBADA');
 assert.equal(payload.fechaLimitePago,day,'mismo día: fecha límite no puede quedar en pasado');
 assert.equal(payload.revisadoPor,91);
 assert.equal(payload.pagado,false);
});

test('un residente no puede autoprobarse mediante flags ni rol falsificado en el body',async t=>{
 sinAdeudos(t);
 t.mock.method(Casa,'findByPk',async()=>({id:5}));
 t.mock.method(UsuarioCasa,'findOne',async()=>({casaId:5,activo:true}));
 let payload=null;
 t.mock.method(Reserva,'create',async v=>{payload=v;return{id:305};});
 const response=res();
 await club.crear(req({body:{...req().body,rol:'ADMINISTRADOR',estatus:'APROBADA',
  autoAprobar:true,cuotaRecuperacion:0,pagado:true}}),response);
 assert.equal(response.code,201);
 assert.equal(response.body.data.estatus,'PENDIENTE');
 assert.equal(payload.estatus,'PENDIENTE');
 assert.equal(payload.pagado,undefined);
 assert.equal(payload.revisadoPor,undefined);
});

test('un administrador con mantenimiento vencido tampoco puede reservar directamente',async t=>{
 t.mock.method(Reserva,'findAll',async()=>[]);
 t.mock.method(CargoExtraordinario,'findAll',async()=>[]);
 t.mock.method(Cuota,'findAll',async()=>[]);
 t.mock.method(Casa,'findByPk',async()=>({id:5}));
 t.mock.method(UsuarioCasa,'findOne',async()=>({casaId:5,activo:true}));
 let wrote=false;
 t.mock.method(Reserva,'create',async()=>{wrote=true;});
 const response=res();
 await club.crear(req({usuario:{usuarioId:19,rol:'ADMINISTRADOR',casaId:5}}),response);
 assert.equal(response.code,409);
 assert.equal(response.body.codigo,'ADEUDOS_RESERVA');
 assert.equal(wrote,false);
});

test('la fecha ocupada también rechaza una reserva directa de administrador',async t=>{
 sinAdeudos(t);
 t.mock.method(Casa,'findByPk',async()=>({id:5}));
 t.mock.method(UsuarioCasa,'findOne',async()=>({casaId:5,activo:true}));
 t.mock.method(Reserva,'create',async()=>{const e=new Error('duplicate');e.name='SequelizeUniqueConstraintError';throw e;});
 const response=res();
 await club.crear(req({usuario:{usuarioId:19,rol:'ADMINISTRADOR',casaId:5}}),response);
 assert.equal(response.code,409);
 assert.match(response.body.message,/ocupada/);
});

test('Casa club muestra Reservar a admin y informa la confirmación usando el estado de la API',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const ui=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/casa-club.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../../docs/casa-club.html'),'utf8');
 assert.match(ui,/\['SUPER_ADMIN','ADMINISTRADOR'\]\.includes\(role\)/);
 assert.match(ui,/\$\('clubSubmit'\)\.textContent='Reservar'/);
 assert.match(ui,/result\.data\?\.estatus==='APROBADA'/);
 assert.match(ui,/notify\(result\.data\?\.estatus==='APROBADA'/);
 assert.match(html,/id="clubCalendarHint"/);
 assert.match(html,/id="clubFormHint"/);
 assert.match(html,/casa-club\.js\?v=20261029-reserva-directa-admin/);
});
