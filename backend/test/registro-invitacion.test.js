const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, {
  DB_HOST:'localhost', DB_PORT:'3306', DB_NAME:'test', DB_USER:'test',
  DB_PASSWORD:'unused', JWT_SECRET:'test-secret'
});
const db = require('../src/config/database');
const m = require('../src/models');
const bcrypt = require('bcryptjs');
const mail = require('../src/services/email.service');
const { solicitarRegistro, verificarRegistro } = require('../src/controllers/auth.controller');

function respuesta() {
  return { statusCode:200, payload:null,
    status(code){this.statusCode=code;return this;},
    json(payload){this.payload=payload;return this;}
  };
}
function peticion(tipoCuenta='CONDOMINO') {
  return {body:{
    correo:'nuevo@example.com', nombre:'Prueba', apellidoPaterno:'Residente',
    contrasena:'ClaveSegura2026', tipoCuenta, calle:'Gardenias', numeroCasa:'5'
  }};
}
function preparar(t) {
  t.mock.method(db,'transaction', async cb => cb({ LOCK:{UPDATE:'UPDATE'} }));
  t.mock.method(bcrypt,'hash', async () => 'hash-seguro');
  t.mock.method(m.Usuario,'findOne', async () => null);
  t.mock.method(m.Rol,'findOne', async () => ({id:2}));
  let usuarioCreado=null, solicitudCreada=null;
  t.mock.method(m.Usuario,'create', async payload => {
    usuarioCreado=payload; return {id:8};
  });
  t.mock.method(m.SolicitudCuenta,'create', async payload => {
    solicitudCreada=payload; return {id:15};
  });
  // Si se intenta enviar correo, esta prueba debe fallar.
  t.mock.method(mail,'enviarCodigoVerificacion', async () => {
    throw Error('El registro no debe enviar correo');
  });
  return { get user(){return usuarioCreado;}, get request(){return solicitudCreada;} };
}

test('condómino solicita cuenta sin correo; queda bloqueado hasta revisión', async t => {
  const saved=preparar(t);
  const res=respuesta();
  await solicitarRegistro(peticion(),res);
  assert.equal(res.statusCode,201);
  assert.equal(res.payload.pendienteAprobacion,true);
  assert.equal(saved.user.estatus,'PENDIENTE');
  assert.equal(saved.user.casaId,null);
  assert.equal(saved.user.rolId,2);
  assert.equal(saved.request.tipoCuenta,'CONDOMINO');
  assert.equal(saved.request.calle,'Gardenias');
  assert.equal(saved.request.numeroCasa,'5');
  assert.equal(saved.request.estatus,'PENDIENTE');
});
test('seguridad no requiere vivienda ni obtiene permisos automáticamente', async t => {
  const saved=preparar(t);
  const res=respuesta();
  await solicitarRegistro(peticion('SEGURIDAD'),res);
  assert.equal(res.statusCode,201);
  assert.equal(saved.user.casaId,null);
  assert.equal(saved.user.estatus,'PENDIENTE');
  assert.equal(saved.request.tipoCuenta,'SEGURIDAD');
  assert.equal(saved.request.calle,null);
  assert.equal(saved.request.numeroCasa,null);
});
test('correo duplicado no produce cuentas ni solicitudes', async t => {
  // El duplicado se verifica dentro de la transacción, antes de insertar.
  t.mock.method(db,'transaction',async cb=>cb({}));
  t.mock.method(bcrypt,'hash',async()=> 'hash');
  t.mock.method(m.Usuario,'findOne',async()=>({id:3}));
  const res=respuesta();
  await solicitarRegistro(peticion(),res);
  assert.equal(res.statusCode,409);
});
test('registro invitado conserva vivienda sugerida sin dar acceso automático', async t => {
  const saved=preparar(t);
  let invitationConsumed=false;
  t.mock.method(m.InvitacionCasa,'findOne', async ()=>({
    id: 10, correo:'nuevo@example.com', casaId:20, tipo:'RESPONSABLE',
    expiraEn:new Date(Date.now()+60_000), aceptadoEn:null, revocadoEn:null,
    async update(){ invitationConsumed=true; }
  }));
  t.mock.method(m.Casa,'findByPk',async()=>({id:20,calle:'Gardenias',numero:'5'}));
  const req=peticion();req.body.invitacion='a'.repeat(64);
  const res=respuesta();
  await solicitarRegistro(req,res);
  assert.equal(res.statusCode,201);
  assert.equal(saved.request.casaSugeridaId,20);
  assert.equal(saved.request.tipoVinculo,'RESPONSABLE');
  assert.equal(saved.user.casaId,null);
  assert.equal(invitationConsumed,true);
});
test('antigua ruta de verificación por código queda inhabilitada', async () => {
  const res=respuesta();
  await verificarRegistro({body:{correo:'nuevo@example.com',codigo:'123456'}},res);
  assert.equal(res.statusCode,410);
});
