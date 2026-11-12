'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'test'});
const acceso=require('../src/services/casa-club-acceso-publico.service');
const Reserva=require('../src/models/ReservaCasaClub');
const Pago=require('../src/models/PagoReportado');
const pagos=require('../src/controllers/pagos.controller');
const publico=require('../src/controllers/casa-club-publico-comprobante.controller');
const ruta=archivo=>fs.readFileSync(path.resolve(__dirname,'../../',archivo),'utf8');
function response(){return{code:200,data:null,headers:{},status(c){this.code=c;return this;},json(d){this.data=d;return this;},setHeader(k,v){this.headers[k]=v;}};}

test('enlace no adivinable: guarda SHA-256, jamás el token de texto plano',async t=>{
 const generado=acceso.crear();
 assert.match(generado.token,/^[0-9a-f]{64}$/);
 assert.match(generado.hash,/^[0-9a-f]{64}$/);
 assert.notEqual(generado.token,generado.hash);
 const reserva={id:13,casaId:7,tokenPagoPublicoHash:generado.hash,
  estatus:'PENDIENTE',pagado:false,fecha:'2026-12-24',fechaBloqueada:'2026-12-24',
  fechaLimitePago:'2026-12-23'};
 t.mock.method(Reserva,'findByPk',async id=>id===13?reserva:null);
 assert.equal((await acceso.verificar({id:13,token:generado.token})).id,13);
 await assert.rejects(()=>acceso.verificar({id:13,token:'0'.repeat(64)}),{status:404});
 await assert.rejects(()=>acceso.verificar({id:14,token:generado.token}),{status:404});
 assert.match(acceso.enlace(13,generado.token),/casa-club\.html#comprobante=13\.[0-9a-f]{64}$/);
});
test('subida pública solo puede cargar el comprobante de SU reserva con la misma ruta Pagos/Titan',async t=>{
 const casa={id:71,casaId:22,solicitante:'Residente de prueba'};
 t.mock.method(acceso,'verificar',async()=>casa);
 let forwarded=null;
 t.mock.method(pagos,'reportarPago',async(req,res)=>{
  forwarded=req;
  return res.status(201).json({ok:true,data:{estatus:'PENDIENTE_VALIDACION'}});
 });
 const req={body:{reservaId:71,claveAcceso:'a'.repeat(64),
   tipoPago:'MANTENIMIENTO',reservaCasaClubId:999,casaId:999,usuarioId:10,
   monto:2000,folioOperacion:'TEST12345',fechaOperacion:'2026-11-12',
   horaOperacion:'12:00:00',comprobanteData:'data:image/jpeg;base64,abcd',comprobanteNombre:'banco.jpg'}};
 const r=response();await publico.reportar(req,r);
 assert.equal(r.code,201);
 assert.equal(forwarded.usuario.casaId,22);
 assert.equal(forwarded.usuario.usuarioId,null);
 assert.equal(forwarded.usuario.rol,'CONDOMINO');
 assert.equal(forwarded.body.tipoPago,'CASA_CLUB');
 assert.equal(forwarded.body.reservaCasaClubId,71);
 assert.equal(forwarded.body.casaId,undefined);
 assert.equal(forwarded.body.usuarioId,undefined);
 assert.equal(forwarded.reservaPublica.id,71);
});
test('estado público no devuelve referencias, OCR, comprobante ni correo bancario',async t=>{
 t.mock.method(Reserva,'findAll',async()=>[]); // La revisión de expiración no utiliza MySQL en pruebas.
 t.mock.method(acceso,'verificar',async()=>({id:88,fecha:'2026-12-20',estatus:'PENDIENTE',
  pagado:false,cuotaRecuperacion:1000,depositoGarantia:700,limpieza:300}));
 t.mock.method(Pago,'findOne',async()=>({id:43,estatus:'PENDIENTE_VALIDACION',
  verificacionBancaria:{etapa:'RECIBIDO',detalle:'secreto interno'},
  folioOperacion:'ID-SENSIBLE',comprobanteData:'DATA-SENSIBLE',correoBancarioHash:'HASH-SENSIBLE'}));
 const r=response();await publico.estado({body:{reservaId:88,claveAcceso:'b'.repeat(64)}},r);
 assert.equal(r.code,200);
 assert.equal(r.data.data.total,2000);
 assert.equal(r.data.data.pagado,false);
 assert.equal(r.data.data.folio,'CC-88');
 assert.equal(r.data.data.fecha,'2026-12-20');
 assert.equal(r.data.data.comprobante.estado,'PENDIENTE_VALIDACION');
 const body=JSON.stringify(r.data);
 for(const secreto of ['ID-SENSIBLE','DATA-SENSIBLE','HASH-SENSIBLE','secreto interno'])assert.ok(!body.includes(secreto));
});
test('reglamento verificado en backend, lectura obligatoria en cliente y texto completo disponible',()=>{
 const club=ruta('backend/src/controllers/casa-club.controller.js');
 const model=ruta('backend/src/models/ReservaCasaClub.js');
 const page=ruta('docs/casa-club.html');
 const script=ruta('docs/assets/js/casa-club.js');
 const payment=ruta('docs/assets/js/casa-club-publico-comprobante.js');
 const rules=ruta('docs/reglamento-casa-club.html');
 assert.match(club,/body\.aceptaReglamento!==true/);
 assert.match(model,/reglamentoAceptadoEn/);
 assert.match(model,/reglamentoVersion/);
 assert.match(script,/rulesAccepted&&Boolean\(selectedDate\)/);
 assert.match(script,/aceptaReglamento:rulesAccepted/);
 for(const marker of ['clubRulesDialog','clubRulesScroll','clubRulesConfirm','clubPublicProofFlow','clubPublicProofForm'])
  assert.ok(page.includes('id="'+marker+'"'),marker);
 assert.match(script,/rulesScroll\.scrollTop\+rulesScroll\.clientHeight>=rulesScroll\.scrollHeight-28/);
 for(const marker of ['Capítulo I','Capítulo II','Capítulo III','Capítulo IV','Capítulo V','12:00 a 23:00','23:00','10:00','1,000','700','300','entrega–recepción'])
  assert.ok(rules.includes(marker),marker);
 assert.match(payment,/MJComprobante\.verifyDestination/);
 assert.match(payment,/Tesseract\.createWorker/);
 assert.match(payment,/publico\/comprobante/);
});
test('pago público conserva controles OCR, deduplicación, Titan y confirmación atómica',()=>{
 const controller=ruta('backend/src/controllers/pagos.controller.js');
 const worker=ruta('backend/src/services/banco-correo-worker.service.js');
 const c3=ruta('backend/src/services/casa-club-pago-automatico.service.js');
 const routes=ruta('backend/src/routes/casa-club.routes.js');
 assert.match(controller,/publicoCasaClub\?'CASA_CLUB'/);
 assert.match(controller,/comprobarDestino\(/);
 assert.match(controller,/idsBanco\.almacenarVerificados/);
 assert.match(controller,/where: \{ folioOperacion \}/);
 assert.match(worker,/correoBancarioHash:hash/);
 assert.match(worker,/confirmarPagoDesdeBanco\(pago\.id,hash\)/);
 assert.match(c3,/estatus:'APROBADA',pagado:true/);
 assert.match(routes,/router\.post\('\/publico\/comprobante',limiteComprobante,comprobante\.reportar\)/);
 assert.match(routes,/router\.use\(autenticarToken\)/);
 assert.ok(routes.indexOf("'/publico/comprobante'")<routes.indexOf('router.use(autenticarToken)'));
});
