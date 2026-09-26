const express = require('express');
const rateLimit = require('express-rate-limit');
const twilio = require('twilio');
const { Condomino, Usuario, Rol } = require('../models');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');

const router = express.Router();
const staff = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'SEGURIDAD'];
const configured = () => [
  'TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET',
  'TWILIO_TWIML_APP_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_CALLER_ID', 'APP_BASE_URL'
].every(key => Boolean(process.env[key]));

// Only registered Mexican numbers can be reached. No arbitrary destination is accepted from the browser.
const mexicanNumber = value => {
  const digits = String(value || '').replace(/[^\d+]/g, '');
  if (/^\d{10}$/.test(digits)) return `+52${digits}`;
  if (/^\+52\d{10}$/.test(digits)) return digits;
  return null;
};

router.get('/token', autenticarToken, autorizarRoles(...staff), rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false
}), async (req, res) => {
  if (!configured()) return res.status(503).json({ ok: false, message: 'Las llamadas internas aún no están configuradas.' });
  try {
    const user = await Usuario.findByPk(req.usuario.usuarioId);
    if (!user || user.estado !== 'ACTIVO') return res.status(403).json({ ok: false, message: 'Usuario no autorizado.' });
    const AccessToken = twilio.jwt.AccessToken;
    const token = new AccessToken(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_API_KEY, process.env.TWILIO_API_SECRET, {
      identity: `guard-${user.id}`, ttl: 600
    });
    token.addGrant(new AccessToken.VoiceGrant({ outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID }));
    return res.json({ ok: true, token: token.toJwt() });
  } catch (error) {
    console.error('No fue posible habilitar la llamada:', error);
    return res.status(500).json({ ok: false, message: 'No fue posible habilitar la llamada.' });
  }
});

// The TwiML App's Voice URL points here. Twilio signs this request; the resident's phone
// is looked up server-side so a caller cannot submit an arbitrary paid destination.
router.post('/salida', async (req, res) => {
  if (!configured()) return res.sendStatus(503);
  const url = `${process.env.APP_BASE_URL.replace(/\/$/, '')}${req.originalUrl}`;
  if (!twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, req.get('X-Twilio-Signature') || '', url, req.body)) {
    return res.sendStatus(403);
  }
  const userId = /^client:guard-(\d+)$/.exec(String(req.body.From || ''))?.[1];
  const residentId = String(req.body.ResidentId || '');
  if (!userId || !/^[1-9]\d{0,15}$/.test(residentId)) return res.sendStatus(403);
  try {
    const user = await Usuario.findByPk(userId, { include: [{ model: Rol, as: 'rol', attributes: ['nombre'] }] });
    if (user?.estado !== 'ACTIVO' || !staff.includes(user.rol?.nombre)) return res.sendStatus(403);
    const resident = await Condomino.findOne({ where: { id: residentId, activo: true }, attributes: ['telefono'] });
    const number = mexicanNumber(resident?.telefono);
    if (!number) return res.sendStatus(404);
    const response = new twilio.twiml.VoiceResponse();
    response.dial({ callerId: process.env.TWILIO_CALLER_ID, answerOnBridge: true }, number);
    res.type('text/xml').send(response.toString());
  } catch (error) {
    console.error('No fue posible conectar la llamada:', error);
    res.sendStatus(500);
  }
});

module.exports = router;
