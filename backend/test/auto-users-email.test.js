const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const mail = require('../src/services/email.service');
const sender = require('../src/services/auto-users-email.service');
test('invitación usa SMTP con enlace privado, escapes HTML y sin llamar a Meta; verifica aceptación del destinatario', async t => {
  const previous = { ...process.env };
  let message, reject = false;
  Object.assign(process.env, { SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_USER: 'sender@example.com', SMTP_PASSWORD: 'synthetic', SMTP_FROM_EMAIL: 'sender@example.com', AUTO_USERS_FRONTEND_URL: 'https://example.com/portal' });
  t.mock.method(nodemailer, 'createTransport', () => ({ async sendMail(options) { message = options; return { accepted: reject ? [] : [options.to], messageId: 'synthetic-smtp-id' }; } }));
  t.mock.method(global, 'fetch', () => { throw Error('No external HTTP or WhatsApp expected'); });
  try {
    const result = await sender.enviarInvitacion({ correo: 'resident@example.com', nombre: '<script>Prueba</script>', domicilio: 'Prueba 5', enlace: 'https://example.com/portal/aceptar-cuenta.html#invitacion=' + 'a'.repeat(64) });
    assert.equal(result, 'synthetic-smtp-id'); assert.equal(message.to, 'resident@example.com');
    assert.match(message.text, /#invitacion=/); assert.match(message.html, /&lt;script&gt;/); assert.doesNotMatch(message.html, /<script>/);
    assert.equal(message.attachments, undefined);
    reject = true;
    await assert.rejects(sender.enviarInvitacion({ correo: 'resident@example.com', nombre: 'Prueba', domicilio: 'Prueba 5', enlace: 'https://example.com' }), /no aceptó/);
    await assert.rejects(sender.enviarInvitacion({ correo: 'a@example.com,b@example.com' }), { status: 400 });
    delete process.env.SMTP_PASSWORD; assert.throws(sender.configuracion, { status: 503 });
  } finally { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); }
});
