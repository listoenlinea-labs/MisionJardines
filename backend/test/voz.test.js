const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');

Object.assign(process.env, {
  DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: 'voice_test', DB_USER: 'test', DB_PASSWORD: 'unused',
  JWT_SECRET: 'voice-test-secret', APP_BASE_URL: 'https://api.test',
  TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'test-auth-token',
  TWILIO_API_KEY: `SK${'b'.repeat(32)}`, TWILIO_API_SECRET: 'test-api-secret',
  TWILIO_TWIML_APP_SID: `AP${'c'.repeat(32)}`, TWILIO_CALLER_ID: '+523312345678'
});

const { Condomino, Usuario } = require('../src/models');
const router = require('../src/routes/voz.routes');
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use('/api/voz', router);

async function request(path, options = {}) {
  const server = app.listen(0);
  try {
    return await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
  } finally { await new Promise(resolve => server.close(resolve)); }
}
const token = rol => jwt.sign({ usuarioId: 7, rol }, process.env.JWT_SECRET);

test('sólo personal activo recibe un token de voz de corta duración', async t => {
  const old = Usuario.findByPk;
  t.after(() => { Usuario.findByPk = old; });
  Usuario.findByPk = async () => ({ id: 7, estado: 'ACTIVO' });
  assert.equal((await request('/api/voz/token', { headers: { Authorization: `Bearer ${token('CONDOMINO')}` } })).status, 403);
  const response = await request('/api/voz/token', { headers: { Authorization: `Bearer ${token('SEGURIDAD')}` } });
  assert.equal(response.status, 200);
  const access = jwt.decode((await response.json()).token);
  assert.equal(access.grants.identity, 'guard-7');
  assert.equal(access.exp - access.iat, 600);
  Usuario.findByPk = async () => ({ id: 7, estado: 'SUSPENDIDO' });
  assert.equal((await request('/api/voz/token', { headers: { Authorization: `Bearer ${token('SEGURIDAD')}` } })).status, 403);
});

test('el webhook verifica firma y marca exclusivamente al residente activo de MySQL', async t => {
  const oldUser = Usuario.findByPk, oldResident = Condomino.findOne;
  t.after(() => { Usuario.findByPk = oldUser; Condomino.findOne = oldResident; });
  Usuario.findByPk = async () => ({ estado: 'ACTIVO', rol: { nombre: 'SEGURIDAD' } });
  let selected;
  Condomino.findOne = async options => { selected = options.where; return { telefono: '33 1234 5678' }; };
  const params = { From: 'client:guard-7', ResidentId: '19', To: '+19999999999' };
  const body = new URLSearchParams(params);
  const url = 'https://api.test/api/voz/salida';
  assert.equal((await request('/api/voz/salida', { method: 'POST', body, headers: { 'X-Twilio-Signature': 'false' } })).status, 403);
  const signature = twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN, url, params);
  const response = await request('/api/voz/salida', { method: 'POST', body, headers: { 'X-Twilio-Signature': signature } });
  assert.equal(response.status, 200);
  assert.deepEqual(selected, { id: '19', activo: true });
  const xml = await response.text();
  assert.match(xml, /\+523312345678/);
  assert.doesNotMatch(xml, /\+19999999999/);
  Condomino.findOne = async () => ({ telefono: '18009999999' });
  assert.equal((await request('/api/voz/salida', { method: 'POST', body, headers: { 'X-Twilio-Signature': signature } })).status, 404);
});
