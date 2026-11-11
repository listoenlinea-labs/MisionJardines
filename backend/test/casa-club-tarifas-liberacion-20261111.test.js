'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'test',JWT_SECRET:'test-secret'});
const tarifas=require('../src/services/casa-club-tarifas.service');
const Tarifa=require('../src/models/TarifaCasaClub');
const Reserva=require('../src/models/ReservaCasaClub');
const PagoReportado=require('../src/models/PagoReportado');
const db=require('../src/config/database');
const email=require('../src/services/email.service');
const club=require('../src/controllers/casa-club.controller');
const avisos=require('../src/services/casa-club-avisos.service');
const respuesta=()=>({code:200,body:null,status(n){this.code=n;return this;},json(data){this.body=data;return this;}});
test('distribución libre con total estricto $2,000, sin decimales ni negativos',()=>{
 assert.deepEqual(tarifas.validar({cuotaRecuperacion:'500',depositoGarantia:1200,limpieza:300}),
  {cuotaRecuperacion:500,depositoGarantia:1200,limpieza:300});
 for(const valores of [
  {cuotaRecuperacion:700,depositoGarantia:700,limpieza:0},
  {cuotaRecuperacion:700,depositoGarantia:700,limpieza:600.5},
  {cuotaRecuperacion:-1,depositoGarantia:2001,limpieza:0},
  {cuotaRecuperacion:700,depositoGarantia:700}
 ])assert.throws(()=>tarifas.validar(valores));
});
test('leer DECIMAL de MySQL y preservar $2,000',async t=>{
 t.mock.method(Tarifa,'findByPk',async()=>({cuotaRecuperacion:'700.00',depositoGarantia:'700.00',limpieza:'600.00'}));
 assert.deepEqual(await tarifas.obtener(),{cuotaRecuperacion:700,depositoGarantia:700,limpieza:600});
});
test('solo administración puede editar y el reparto queda persistido',async t=>{
 let escritos=null;
 t.mock.method(db,'transaction',async fn=>fn({LOCK:{UPDATE:'UPDATE'}}));
 t.mock.method(Tarifa,'findByPk',async()=>({update:async values=>{escritos=values;}}));
 const residente=respuesta();
 await club.guardarTarifas({usuario:{rol:'CONDOMINO'},body:{cuotaRecuperacion:500,depositoGarantia:1000,limpieza:500}},residente);
 assert.equal(residente.code,403);
 const admin=respuesta();
 await club.guardarTarifas({usuario:{rol:'ADMINISTRADOR',usuarioId:12},body:{cuotaRecuperacion:500,depositoGarantia:1000,limpieza:500}},admin);
 assert.equal(admin.code,200);
 assert.equal(escritos.actualizadoPor,12);
 assert.equal(escritos.limpieza,500);
 assert.equal(admin.body.data.total,2000);
});
test('liberar reserva aprobada deja historial de pago y desbloquea la fecha',async t=>{
 t.mock.method(PagoReportado,'count',async()=>0);
 let cambio=null,enviado=null;
 t.mock.method(db,'transaction',async fn=>fn({LOCK:{UPDATE:'UPDATE'}}));
 t.mock.method(Reserva,'findByPk',async()=>({
  id:22,estatus:'APROBADA',pagado:true,fecha:'2027-01-20',correo:'vecino@example.com',notas:'',
  update:async v=>{cambio=v;}
 }));
 t.mock.method(email,'enviarAvisoCasaClub',async data=>{enviado=data;});
 const res=respuesta();
 await club.liberar({usuario:{rol:'ADMINISTRADOR',usuarioId:9},params:{id:22},body:{motivo:'Solicitante canceló el evento'}},res);
 assert.equal(res.code,200);
 assert.equal(cambio.estatus,'CANCELADA');
 assert.equal(cambio.fechaBloqueada,null);
 assert.equal(cambio.pagado,undefined,'el pago NO se borra ni modifica');
 assert.equal(cambio.revisadoPor,9);
 assert.equal(res.body.pagoPendienteDeRevision,true);
 assert.equal(res.body.avisoCorreo,true);
 assert.match(enviado.texto,/devolución/);
});
test('condómino no puede liberar reservas ajenas desde la API',async()=>{
 const res=respuesta();
 await club.liberar({usuario:{rol:'CONDOMINO'},params:{id:22},body:{motivo:'Deseo cancelar'}},res);
 assert.equal(res.code,403);
});
test('UI mantiene hora de solicitud, editor y WhatsApp sin la leyenda anterior',()=>{
 const root=path.resolve(__dirname,'../../docs');
 const html=fs.readFileSync(path.join(root,'casa-club.html'),'utf8');
 const js=fs.readFileSync(path.join(root,'assets/js/casa-club.js'),'utf8');
 for(const id of ['clubTariffRecovery','clubTariffGuarantee','clubTariffCleaning','clubTariffSave','clubRelease'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(!html.includes('Escribe 10 dígitos o +52 seguido de 10 dígitos.'));
 assert.match(js,/fechaSolicitud\(r\.creadoEn\)/);
 assert.match(js,/administracion\/.*liberar/);
});
test('la conciliación de mantenimiento conserva actualización durable de TAGs tras commit',()=>{
 const pagos=fs.readFileSync(path.resolve(__dirname,'../src/controllers/pagos.controller.js'),'utf8');
 const worker=fs.readFileSync(path.resolve(__dirname,'../src/services/banco-correo-worker.service.js'),'utf8');
 const cuotas=fs.readFileSync(path.resolve(__dirname,'../src/services/cuotas-mantenimiento.service.js'),'utf8');
 assert.match(worker,/banco\.corresponde\(pago,aviso\)/);
 assert.match(worker,/confirmarPagoDesdeBanco\(pago\.id,hash\)/);
 assert.match(pagos,/estatus: 'VALIDADO'/);
 assert.match(pagos,/cuotasMantenimiento\.confirmar\(pago, transaction\)/);
 assert.match(cuotas,/afterCommit\(\(\)=>require\('\.\/zkteco-vigencias\.service'\)\.solicitar\(pago\.casaId\)\)/);
});

test('Casa Club comparte la cuenta oficial de Pagos y no usa una cuenta distinta',()=>{
 const info=avisos.datosBancarios({
  PAGOS_BANCO:'Banco de pagos',PAGOS_TITULAR:'Titular de pagos',PAGOS_CUENTA:'12345678901234',
  CASA_CLUB_BANCO:'Otro banco',CASA_CLUB_TITULAR:'Otro titular',CASA_CLUB_CUENTA:'99999999999999',
  CASA_CLUB_ADMIN_CORREO:'admin@example.com'
 });
 assert.equal(info.banco,'Banco de pagos');
 assert.equal(info.titular,'Titular de pagos');
 assert.equal(info.cuenta,'12345678901234');
});
