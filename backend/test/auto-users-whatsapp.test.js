const test = require('node:test');
const assert = require('node:assert/strict');
const { telefonoWhatsApp, enviarInvitacion, configuracion } = require('../src/services/auto-users-whatsapp.service');
test('WhatsApp normalizes a single Mexican number and rejects ambiguous lists', () => {
  assert.equal(telefonoWhatsApp('(33) 1234-5678'), '523312345678');
  assert.equal(telefonoWhatsApp('+52 33 1234 5678'), '523312345678');
  assert.equal(telefonoWhatsApp('3312345678 / 3398765432'), null); assert.equal(telefonoWhatsApp('333'), null);
});
test('template send uses configured business sender and returns provider message id, with no real messages', async t => {
  const previous = { ...process.env };
  Object.assign(process.env, { AUTO_USERS_FRONTEND_URL: 'https://example.com/portal', WHATSAPP_ACCESS_TOKEN: 'synthetic-token',
    WHATSAPP_PHONE_NUMBER_ID: '123456', WHATSAPP_API_VERSION: 'v26.0', WHATSAPP_INVITACION_TEMPLATE: 'invitar_condomino' });
  let request;
  t.mock.method(global, 'fetch', async (url, options) => { request = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ messages: [{ id: 'synthetic-message' }] }) }; });
  try {
    assert.equal(configuracion().frontend, 'https://example.com/portal');
    const id = await enviarInvitacion({ telefono: '3312345678', nombre: 'Persona Prueba', domicilio: 'Calle Prueba 5', enlace: 'https://example.com/portal/aceptar-cuenta.html#invitacion=synthetic' });
    assert.equal(id, 'synthetic-message'); assert.equal(request.url, 'https://graph.facebook.com/v26.0/123456/messages');
    assert.equal(request.body.to, '523312345678'); assert.equal(request.body.type, 'template');
    assert.equal(request.body.template.components[0].parameters.length, 3);
    delete process.env.WHATSAPP_ACCESS_TOKEN; assert.throws(configuracion, { status: 503 });
  } finally { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); }
});
