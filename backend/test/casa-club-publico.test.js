const test=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'test',JWT_SECRET:'test-secret'});
const {Op}=require('sequelize');
const {Casa,Cuota,CargoExtraordinario}=require('../src/models');
const Reserva=require('../src/models/ReservaCasaClub');
const PagoReportado=require('../src/models/PagoReportado');
const Manual=require('../src/models/PagoManualConcepto');
const db=require('../src/config/database');
const avisos=require('../src/services/casa-club-avisos.service');
const tarifas=require('../src/services/casa-club-tarifas.service');
const email=require('../src/services/email.service');
const club=require('../src/controllers/casa-club.controller');
const hoy=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City'}).format(new Date());
const offset=n=>new Date(Date.parse(hoy+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const body={fecha:offset(7),calle:'Calle de prueba',numero:'10',solicitante:'Persona de prueba',
 telefono:'3312345678',correo:'prueba@example.invalid',motivo:'Reunión',aceptaWhatsApp:true};
const res=()=>({code:200,body:null,status(n){this.code=n;return this;},json(d){this.body=d;return this;},setHeader(){}});
const admin={rol:'ADMINISTRADOR',usuarioId:9};
const config={dias:3,banco:'Banco de prueba',titular:'Titular de prueba',cuenta:'000000000000000000',administracion:'admin@example.invalid',
 nombrePlantilla:'reserva_prueba',idioma:'es_MX',version:'v25.0',telefonoId:'123',token:'fake'};
function setup(t){
 t.mock.method(tarifas,'obtener',async()=>({cuotaRecuperacion:700,depositoGarantia:700,limpieza:600}));
 t.mock.method(Casa,'findAll',async()=>[{id:5}]);
 t.mock.method(Casa,'findByPk',async()=>({id:5}));
 t.mock.method(Cuota,'findAll',async()=>[{anio:Number(hoy.slice(0,4)),mes:['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'][Number(hoy.slice(5,7))-1],estatusPago:'PAGADO',montoPagado:300}]);
 t.mock.method(CargoExtraordinario,'findAll',async()=>[]);
 t.mock.method(Reserva,'findAll',async()=>[]);
 t.mock.method(Reserva,'findOne',async()=>null);
 t.mock.method(db,'transaction',async fn=>fn({LOCK:{UPDATE:'UPDATE'}}));
 t.mock.method(avisos,'configuracion',()=>config);
}
test('la solicitud anónima bloquea la fecha antes de los tres avisos y fija monto y plazo en servidor',async t=>{
 setup(t);
 let guardada;const correos=[];
 t.mock.method(Reserva,'create',async values=>{guardada=values;return {id:23,...values};});
 t.mock.method(email,'enviarAvisoCasaClub',async data=>{assert.equal(guardada.estatus,'PENDIENTE');correos.push(data);});
 t.mock.method(global,'fetch',async (url,req)=>{
  assert.equal(guardada.fechaBloqueada,body.fecha);
  assert.match(url,/graph\.facebook\.com/);
  const d=JSON.parse(req.body);assert.equal(d.to,'523312345678');assert.equal(d.type,'template');
  assert.equal(d.template.components[0].parameters[6].text,offset(3));
  return {ok:true,json:async()=>({messages:[{id:'wamid.test'}]})};
 });
 const r=res();await club.solicitar({body:{...body,usuarioId:9,estatus:'APROBADA',pagado:true,cuotaRecuperacion:1}},r);
 assert.equal(r.code,201);
 assert.equal(guardada.usuarioId,null);assert.equal(guardada.cuotaRecuperacion,700);
 assert.equal(r.body.data.pago.monto,2000);assert.equal(r.body.data.pago.limpieza,600);assert.equal(r.body.data.pago.fechaLimitePago,offset(3));
 assert.deepEqual(r.body.data.notificaciones,{correo:true,whatsapp:true,administracion:true});
 assert.deepEqual(correos.map(c=>c.destinatario),[body.correo,config.administracion]);
});
test('un rechazo del proveedor no se presenta como mensaje enviado ni cancela el apartado',async t=>{
 setup(t);
 t.mock.method(Reserva,'create',async values=>({id:24,...values}));
 t.mock.method(email,'enviarAvisoCasaClub',async()=>{});
 t.mock.method(global,'fetch',async()=>({ok:false}));
 const r=res();await club.solicitar({body:{...body,fecha:offset(1)}},r);
 assert.equal(r.code,201);assert.equal(r.body.data.notificaciones.whatsapp,false);
 assert.equal(r.body.data.pago.fechaLimitePago,hoy);
});
test('un choque de fecha no genera avisos',async t=>{
 setup(t);
 t.mock.method(Reserva,'create',async()=>{throw Object.assign(Error('duplicate'),{name:'SequelizeUniqueConstraintError'});});
 const enviar=t.mock.method(avisos,'notificar',async()=>{});
 const r=res();await club.solicitar({body},r);
 assert.equal(r.code,409);assert.equal(enviar.mock.callCount(),0);
});
test('sin consentimiento no se acepta una solicitud pública',async ()=>{
 const r=res();await club.solicitar({body:{...body,aceptaWhatsApp:false}},r);
 assert.equal(r.code,400);
});
test('al consultar el calendario se libera un apartado vencido sin exponer datos privados',async t=>{
 setup(t);
 let cambio;
 Reserva.findAll.mock.mockImplementation(async options=>{
  if(options.attributes[0]==='id'){
   assert.ok(options.where.estatus[Op.in].includes('PENDIENTE'));
   return [{id:32}];
  }
  return [{fecha:offset(9),estatus:'APROBADA',correo:'privado@example.invalid'}];
 });
 t.mock.method(Reserva,'findByPk',async()=>({id:32,estatus:'PENDIENTE',fechaLimitePago:offset(-1),pagado:false,
  update:async d=>{cambio=d;}}));
 t.mock.method(PagoReportado,'count',async()=>0);
 const r=res();await club.fechas({query:{}},r);
 assert.equal(cambio.estatus,'CANCELADA');assert.equal(cambio.fechaBloqueada,null);
 assert.deepEqual(r.body.ocupadas,[{fecha:offset(9),estatus:'APROBADA'}]);
});
test('solo el administrador puede confirmar el pago y aprobar el monto ya comunicado',async t=>{
 setup(t);
 let cambio,pago;
 t.mock.method(Reserva,'findByPk',async()=>({id:22,estatus:'PENDIENTE',fechaLimitePago:offset(3),fecha:body.fecha,
  casaId:5,cuotaRecuperacion:700,depositoGarantia:700,limpieza:0,update:async d=>{cambio=d;}}));
 t.mock.method(Manual,'create',async d=>{pago=d;});
 const run=async(usuario,info)=>{const r=res();await club.revisar({usuario,params:{id:22},body:{accion:'APROBAR',...info}},r);return r;};
 assert.equal((await run({rol:'CONDOMINO'},{pagoVerificado:true,folio:'REF-123'})).code,403);
 assert.equal((await run(admin,{})).code,400);
 assert.equal(cambio,undefined);
 assert.equal((await run(admin,{pagoVerificado:true,folio:'REF-123',cuotaRecuperacion:1})).code,200);
 assert.equal(pago.monto,1400);assert.equal(cambio.estatus,'APROBADA');assert.equal(cambio.pagado,true);
});

test('el catálogo público devuelve solo calles o números de la calle solicitada',async t=>{
 const registros=[
  {calle:'Magnolias',calleCorrecta:'Misión Magnolias',numero:'10',correo:'privado'},
  {calle:'Magnolias',calleCorrecta:'Misión Magnolias',numero:'2'},
  {calle:'Magnolias',calleCorrecta:'Misión Magnolias',numero:'2'},
  {calle:'Rosas',numero:'5'},{calle:'Prueba',numero:'TEST-001'}
 ];
 const read=t.mock.method(Casa,'findAll',async options=>{
  assert.deepEqual(options.attributes,['calle','calleCorrecta','numero']);
  if(!options.where)return registros;
  assert.deepEqual(options.where[Op.or],[{calle:'Misión Magnolias'},{calleCorrecta:'Misión Magnolias'}]);
  return registros.slice(0,3);
 });
 const calles=res();await club.domicilios({query:{}},calles);
 assert.deepEqual(calles.body,{ok:true,opciones:['Misión Magnolias','Rosas']});
 const numeros=res();await club.domicilios({query:{calle:'Misión Magnolias'}},numeros);
 assert.deepEqual(numeros.body,{ok:true,opciones:['2','10']});
 const invalida=res();await club.domicilios({query:{calle:['Rosas','Magnolias']}},invalida);
 assert.equal(invalida.code,400);
 assert.equal(read.mock.callCount(),2);
});

test('el borrador administrativo cambia de instrucciones bancarias a confirmación después del pago',async t=>{
 const row={id:23,estatus:'PENDIENTE',pagado:false,telefono:'+52 (33) 1234-5678',fecha:body.fecha,
  fechaLimitePago:offset(3),cuotaRecuperacion:700,depositoGarantia:700,limpieza:0};
 const buscar=t.mock.method(Reserva,'findByPk',async()=>row);
 const bancaria=t.mock.method(avisos,'datosBancarios',()=>config);
 const borrador=async(usuario=admin)=>{const r=res();await club.mensajeWhatsApp({usuario,params:{id:23}},r);return r;};
 assert.equal((await borrador({rol:'CONDOMINO'})).code,403);
 assert.equal(buscar.mock.callCount(),0);
 const previo=await borrador();
 assert.equal(previo.body.tipo,'PAGO');
 assert.equal(previo.body.telefono,'523312345678');
 for(const texto of ['1,400',config.cuenta,config.titular,offset(3)])assert.ok(previo.body.mensaje.includes(texto));
 row.estatus='APROBADA';row.pagado=true;
 const posterior=await borrador();
 assert.equal(posterior.body.tipo,'CONFIRMACION');
 assert.match(posterior.body.mensaje,/ya quedó apartada/);
 assert.ok(!posterior.body.mensaje.includes(config.cuenta));
 assert.equal(bancaria.mock.callCount(),1);
 row.estatus='CANCELADA';
 assert.equal((await borrador()).code,409);
});
