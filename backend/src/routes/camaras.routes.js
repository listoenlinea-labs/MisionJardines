'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');
const camera = require('../services/camaras-hls.service');

const router = express.Router();
const access = [autenticarToken, autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR', 'SEGURIDAD')];
const security = (_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  res.set('Referrer-Policy', 'no-referrer');
  // El frontend de GitHub Pages y la API usan orígenes diferentes. CORS
  // mantiene la lista permitida de app.js; CORP debe admitir media HLS.
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
};

router.get('/', ...access, security, (req, res) => {
  const configured = camera.enabled();
  const list = camera.channels();
  return res.json({
    ok: true,
    configured,
    channels: list.map(item => ({
      id: item.id,
      name: item.name,
      playbackPath: configured
        ? camera.mediaPath(item.id, 'index.m3u8', camera.issueTicket(item.id))
        : null
    })),
    message: configured ? null :
      'Falta configurar el puente privado RTSP→HLS y sus llaves en el servidor.'
  });
});

// Los videos solo se solicitan a la puerta de enlace fija en el entorno del
// servidor. La URL solicitada por el navegador nunca determina el host destino.
// Ticket firmado: acceso temporal para video/segmentos, compatible con <video>
// nativo y hls.js sin colocar el JWT de login ni la contraseña Dahua en URLs.
const streamLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas solicitudes de video' }
});

router.get('/stream/:channel/:asset', streamLimiter, security, async (req, res) => {
  const { channel, asset } = req.params;
  const ticket = req.query.ticket;
  if (!camera.safeAsset(asset) || !camera.checkTicket(channel, ticket)) {
    return res.status(403).json({ ok: false, message: 'Enlace de cámara no autorizado o vencido' });
  }
  const entry = camera.channels().find(item => item.id === channel);
  const url = camera.sourceUrl(entry, asset);
  if (!url) return res.status(503).json({ ok: false, message: 'Puente de video no configurado' });

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      headers: {
        ...(process.env.CAMERAS_UPSTREAM_BEARER_TOKEN
          ? { Authorization: 'Bearer ' + process.env.CAMERAS_UPSTREAM_BEARER_TOKEN }
          : {})
      }
    });
    if (!upstream.ok) return res.status(502).json({
      ok: false, message: 'El puente Dahua/HLS no entregó video'
    });

    const isPlaylist = asset.endsWith('.m3u8');
    const maxBytes = isPlaylist ? 1024 * 1024 : 12 * 1024 * 1024;
    const reported = Number(upstream.headers.get('content-length') || 0);
    if (reported > maxBytes) return res.status(502).end();
    const content = Buffer.from(await upstream.arrayBuffer());
    if (content.length > maxBytes) return res.status(502).end();

    if (isPlaylist) {
      const playlist = camera.rewriteHls(content.toString('utf8'), channel, ticket);
      res.type('application/vnd.apple.mpegurl; charset=utf-8');
      return res.send(playlist);
    }
    const type = asset.endsWith('.ts') ? 'video/mp2t'
      : asset.endsWith('.m4s') || asset.endsWith('.mp4') ? 'video/mp4'
      : asset.endsWith('.aac') ? 'audio/aac'
      : 'application/octet-stream';
    res.type(type);
    return res.send(content);
  } catch (error) {
    // No devolver la URL del gateway, secretos, ni mensajes del upstream.
    console.error('Error HLS canal', channel, error?.name || 'upstream');
    return res.status(502).json({ ok: false, message: 'No fue posible reproducir el canal' });
  }
});

module.exports = router;
