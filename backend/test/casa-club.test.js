const test=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'test',JWT_SECRET:'test-secret'});
const {Casa,UsuarioCasa,Cuota,CargoExtraordinario}=require('../src/models');
const Reserva=require('../src/models/ReservaCasaClub');
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
 let wrote=false;t.mock.method(Reserva,'create',async()=>{wrote=true;});
 const response=res();await club.crear(req(),response);
 assert.equal(response.code,409);assert.equal(wrote,false);
 assert.match(response.body.message,/adeudos/i);
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
