// Regresión del error SMTP_CONFIG_INCOMPLETA: el registro ya no usa correo.
const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, {
  DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',
  DB_PASSWORD:'unused',JWT_SECRET:'test-secret'
});
const db = require('../src/config/database');
const { Usuario, Rol, SolicitudCuenta, VerificacionCuenta } = require('../src/models');
const mail = require('../src/services/email.service');
const bcrypt = require('bcryptjs');
const { solicitarRegistro } = require('../src/controllers/auth.controller');
test('sin SMTP configurado se guarda la solicitud y no se envía correo', async t => {
  t.mock.method(db,'transaction',async cb=>cb({}));
  t.mock.method(bcrypt,'hash',async ()=>'hash');
  t.mock.method(Usuario,'findOne',async()=>null);
  t.mock.method(Rol,'findOne',async()=>({id:3}));
  t.mock.method(Usuario,'create',async data=>{assert.equal(data.estatus,'PENDIENTE');return {id:11};});
  let saved=null;
  t.mock.method(SolicitudCuenta,'create',async data=>{saved=data;return {id:12};});
  t.mock.method(mail,'validarConfiguracionSmtp',()=>assert.fail('SMTP no debe validarse'));
  t.mock.method(mail,'enviarCodigoVerificacion',async()=>assert.fail('No debe enviarse correo'));
  t.mock.method(VerificacionCuenta,'create',async()=>assert.fail('No debe crearse un código'));
  const res={statusCode:200,status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}};
  await solicitarRegistro({body:{
    nombre:'Ana',apellidoPaterno:'Prueba',correo:'ana@example.com',
    contrasena:'Prueba1234',tipoCuenta:'CONDOMINO',calle:'Gardenias',numeroCasa:'5'
  }},res);
  assert.equal(res.statusCode,201);
  assert.equal(res.data.pendienteAprobacion,true);
  assert.equal(saved.estatus,'PENDIENTE');
});
