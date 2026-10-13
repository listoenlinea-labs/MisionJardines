'use strict';
const crypto = require('node:crypto');

// Configuración solo del servidor. Nunca guardar contraseñas Dahua, rutas RTSP
// ni credenciales del puente de video en el HTML o en la respuesta de la API.
const ID = /^[a-z0-9][a-z0-9_-]{0,59}$/i;
const ASSET = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/;
const TTL_SECONDS = 15 * 60;

function channels(env = process.env) {
  let parsed;
  try {
    parsed = JSON.parse(env.CAMERAS_CHANNELS_JSON || '[]');
  } catch (_) {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set();
  return parsed.slice(0, 16).filter(row => {
    const id = String(row?.id || '');
    const path = String(row?.path || '');
    if (!ID.test(id) || !ID.test(path) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map(row => ({
    id: String(row.id),
    name: String(row.name || row.id).slice(0, 80),
    path: String(row.path)
  }));
}

function gateway(env = process.env) {
  const raw = String(env.CAMERAS_HLS_GATEWAY_URL || '').trim();
  const key = String(env.CAMERAS_STREAM_SIGNING_KEY || '');
  if (!raw || key.length < 32) return null;
  try {
    const url = new URL(raw.endsWith('/') ? raw : raw + '/');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
        url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch (_) { return null; }
}

function enabled(env = process.env) {
  return Boolean(gateway(env) && channels(env).length);
}

function issueTicket(id, env = process.env, now = Date.now()) {
  if (!enabled(env) || !channels(env).some(channel => channel.id === id)) return null;
  const expiry = Math.floor(now / 1000) + TTL_SECONDS;
  const payload = id + '.' + expiry;
  const sig = crypto.createHmac('sha256', env.CAMERAS_STREAM_SIGNING_KEY)
    .update(payload).digest('base64url');
  return expiry + '.' + sig;
}

function checkTicket(id, ticket, env = process.env, now = Date.now()) {
  if (!enabled(env)) return false;
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(String(ticket || ''));
  if (!match || !channels(env).some(channel => channel.id === id)) return false;
  const exp = Number(match[1]);
  const t = Math.floor(now / 1000);
  if (exp < t || exp > t + TTL_SECONDS) return false;
  const signature = crypto.createHmac('sha256', env.CAMERAS_STREAM_SIGNING_KEY)
    .update(id + '.' + match[1]).digest('base64url');
  return crypto.timingSafeEqual(Buffer.from(match[2]), Buffer.from(signature));
}

function safeAsset(asset) {
  const value = String(asset || '');
  return ASSET.test(value) && value !== '.' && !value.includes('..') && !value.startsWith('.');
}

function mediaPath(id, asset, ticket) {
  return '/api/camaras/stream/' + encodeURIComponent(id) + '/' +
    encodeURIComponent(asset) + '?ticket=' + encodeURIComponent(ticket);
}

function rewriteHls(manifest, id, ticket) {
  function translate(original) {
    const raw = String(original || '');
    // Nunca pedir dominios o caminos aportados por la playlist. El upstream
    // debe entregar segmentos relativos simples, como MediaMTX.
    if (/^[a-z]+:/i.test(raw) || raw.startsWith('/') || raw.startsWith('//')) {
      throw new Error('La lista HLS contiene una URL no permitida');
    }
    const asset = raw.split('?')[0].split('#')[0];
    if (!safeAsset(asset)) throw new Error('Recurso HLS no permitido');
    return mediaPath(id, asset, ticket);
  }
  return String(manifest).split(/\r?\n/).map(line => {
    if (line.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_whole, name) =>
        'URI="' + translate(name) + '"');
    }
    return line.trim() ? translate(line.trim()) : line;
  }).join('\n');
}

function sourceUrl(channel, asset, env = process.env) {
  const base = gateway(env);
  if (!base || !channel || !safeAsset(asset)) return null;
  return new URL(encodeURIComponent(channel.path) + '/' + encodeURIComponent(asset), base).toString();
}

module.exports = {
  channels, gateway, enabled, issueTicket, checkTicket, safeAsset,
  mediaPath, rewriteHls, sourceUrl, TTL_SECONDS
};
