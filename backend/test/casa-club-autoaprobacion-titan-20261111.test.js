'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'test',JWT_SECRET:'test-secret'});
const Reserva=require('../src/models/ReservaCasaClub');
const automatico=require('../src/services/casa-club-pago-automatico.service');
const email=require('../src/services/email.service');
const avisos=require('../src/services/casa-club-avisos.service');
const hoy=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const plusDays=n=>new Date(Date.parse(hoy()+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
function booking(){
 return {id:81,casaId:11,usuarioId:null,fecha:plusDays(7),fechaBloqueada:plusDays(7),
  fechaLimitePago:plusDays(3),estatus:'PENDIENTE',pagado:false,cuotaRecuperacion:'700.00',
  depositoGarantia:'700.00',limpieza:'600.00',solicitante:'Vecino prueba',
  correo:'vecino@example.test',telefono:'3312345678'};
}
const proof=()=>({id:97,tipoPago:'CASA_CLUB',reservaCasaClubId:81,casaId:11,
  monto:'2000.00',fechaOperacion:hoy(),folioOperacion:'TESTREF-123',
  folioReporte:'MJ-2026-0097'});
test('Pago de $2,000 al banco para fecha apartada puede confirmar una solicitud PENDIENTE',()=>{
 assert.equal(automatico.validarReserva(booking(),proof()),true);
 assert.equal(automatico.validarReserva({...booking(),estatus:'APROBADA'},proof()),true);
});
test('No confirma si fecha libre, otra vivienda, otro monto, cancelación o evento pasado',()=>{
 const cases=[
  [{...booking(),fechaBloqueada:null},proof()],
  [{...booking(),casaId:22},proof()],
  [booking(),{...proof(),monto:1999}],
  [booking(),{...proof(),monto:2001}],
  [booking(),{...proof(),tipoPago:'MANTENIMIENTO'}],
  [{...booking(),estatus:'CANCELADA'},proof()],
  [{...booking(),estatus:'RECHAZADA'},proof()],
  [{...booking(),pagado:true},proof()],
  [{...booking(),fecha:plusDays(-1),fechaBloqueada:plusDays(-1)},proof()],
  [booking(),{...proof(),fechaOperacion:plusDays(5)}]
 ];
 for(const [row,p] of cases)assert.throws(()=>automatico.validarReserva(row,p),{status:409});
});
test('La transacción bancaria aprueba y registra pago una sola vez; no toca TAGs',async t=>{
 let updated=null,lookups=0;
 const row={...booking(),update:async d=>{updated=d;}};
 t.mock.method(Reserva,'findByPk',async (id,options)=>{
  lookups++;
  assert.equal(Number(id),81);
  assert.ok(options.transaction);
  assert.equal(options.lock,'UPDATE');
  return row;
 });
 const tx={LOCK:{UPDATE:'UPDATE'}};
 const result=await automatico.aplicarConfirmacion({pago:proof(),transaction:tx});
 assert.equal(lookups,1);
 assert.equal(updated.estatus,'APROBADA');
 assert.equal(updated.pagado,true);
 assert.equal(updated.fechaBloqueada,row.fecha);
 assert.equal(updated.fechaPago,hoy());
 assert.equal(updated.folio,proof().folioOperacion);
 assert.equal(result.folioReporte,'MJ-2026-0097');
 assert.equal(updated.cuotaRecuperacion,undefined,'No modificar montos congelados');
 const invalid=()=>automatico.aplicarConfirmacion({pago:{...proof(),monto:1000},transaction:tx});
 await assert.rejects(invalid,{status:409});
});
test('El correo automático se envía al residente y Administración después de confirmar el banco',async t=>{
 const old=process.env.CASA_CLUB_ADMIN_CORREO;
 process.env.CASA_CLUB_ADMIN_CORREO='admin@example.test';
 t.after(()=>{if(old===undefined)delete process.env.CASA_CLUB_ADMIN_CORREO;else process.env.CASA_CLUB_ADMIN_CORREO=old;});
 const destinatarios=[];
 t.mock.method(email,'enviarAvisoCasaClub',async data=>{destinatarios.push(data);});
 const result=await avisos.notificarConfirmacionBancaria({...booking(),monto:2000,
  folioReporte:'MJ-2026-0097',fechaPago:hoy()});
 assert.equal(result.aceptados,2);
 assert.deepEqual(destinatarios.map(d=>d.destinatario).sort(),['admin@example.test','vecino@example.test']);
 assert.ok(destinatarios.every(x=>x.texto.includes('confirmada automáticamente')));
});
test('Sólo el worker con aviso completo puede confirmar: OCR y la captura no aprueban',()=>{
 const pagos=fs.readFileSync(path.resolve(__dirname,'../src/controllers/pagos.controller.js'),'utf8');
 const banco=fs.readFileSync(path.resolve(__dirname,'../src/services/banco-correo-worker.service.js'),'utf8');
 assert.match(pagos,/estatus: 'PENDIENTE_VALIDACION'/);
 assert.match(pagos,/programarRevision\(\)/);
 assert.match(pagos,/aplicarConfirmacion\(\{pago,transaction\}\)/);
 assert.match(pagos,/transaction\.afterCommit\(\(\)=>/);
 assert.match(banco,/confirmarPagoDesdeBanco\(pago\.id,hash\)/);
 assert.match(banco,/completos\.length===1\?completos\[0\]:null/);
});
test('Solicitud pendiente aparece en Pagos y el residente puede elegir reserva desde Casa Club',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/services/adeudos-comunidad.service.js'),'utf8');
 const payUI=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/pagos.js'),'utf8');
 const clubUI=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/casa-club.js'),'utf8');
 assert.match(source,/\['PENDIENTE','APROBADA'\]/);
 assert.match(payUI,/reservaSolicitada/);
 assert.match(payUI,/\.find\(c=>Number\(c\.id\)===reservaSolicitada\)/);
 assert.match(clubUI,/pagos\.html\?tab=CASA_CLUB&reserva=/);
 assert.match(clubUI,/clubReviewProofs/);
});
test('No se cancela una fecha con comprobante todavía en revisión',async t=>{
 const db=require('../src/config/database');
 const PagoReportado=require('../src/models/PagoReportado');
 const club=require('../src/controllers/casa-club.controller');
 const r={code:200,body:null,status(n){this.code=n;return this;},json(d){this.body=d;return this;}};
 let cancelada=false;
 t.mock.method(db,'transaction',async fn=>fn({LOCK:{UPDATE:'UPDATE'}}));
 t.mock.method(Reserva,'findByPk',async()=>({
  id:81,usuarioId:10,estatus:'PENDIENTE',fecha:plusDays(7),pagado:false,
  update:async()=>{cancelada=true;}
 }));
 t.mock.method(PagoReportado,'count',async()=>1);
 await club.cancelar({usuario:{rol:'CONDOMINO',usuarioId:10},params:{id:81}},r);
 assert.equal(r.code,409);
 assert.equal(cancelada,false);
});
test('La API de comprobantes pertenece exclusivamente a Administración',()=>{
 const routes=fs.readFileSync(path.resolve(__dirname,'../src/routes/casa-club.routes.js'),'utf8');
 assert.match(routes,/administracion\/:id\/comprobantes',autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)/);
 const controller=fs.readFileSync(path.resolve(__dirname,'../src/controllers/casa-club.controller.js'),'utf8');
 assert.match(controller,/async function comprobantes\(req,res\)/);
 assert.match(controller,/if\(!admin\(req\.usuario\?\.rol\)\)/);
});
