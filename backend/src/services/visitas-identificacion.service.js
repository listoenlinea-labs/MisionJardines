'use strict';
const crypto = require('crypto');
const Foto = require('../models/VisitaIdentificacionFoto');

const MAX_BYTES = 650 * 1024;
const MAX_ENCODED_LENGTH = Math.ceil(MAX_BYTES / 3) * 4 + 48;
const fail = (status, message) => Object.assign(new Error(message), { status });

function encryptionKey() {
  // Se puede configurar una clave exclusiva. Si falta, se deriva del JWT_SECRET
  // ya establecido en la instalación; rotarlo obliga a conservar la clave anterior.
  const secret = process.env.VISITAS_IDENTIFICACION_KEY || process.env.JWT_SECRET;
  if (!secret || String(secret).length < 16) throw fail(503, 'No está configurado el cifrado de identificaciones');
  return crypto.createHash('sha256').update('mision-jardines-identificacion-v1:').update(secret).digest();
}

function validatePhoto(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > MAX_ENCODED_LENGTH) throw fail(413, 'La fotografía es demasiado grande');
  const matched = /^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value);
  if (!matched) throw fail(400, 'Solo se admiten fotos JPG, PNG o WebP');
  const data = Buffer.from(matched[2], 'base64');
  if (data.length < 32 || data.length > MAX_BYTES) throw fail(413, 'La fotografía debe pesar menos de 650 KB');
  const kind = matched[1];
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp = data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
  if (!(kind === 'jpeg' && jpeg || kind === 'png' && png || kind === 'webp' && webp)) throw fail(400, 'Formato de foto inválido');
  return { bytes: data, mime: 'image/' + kind };
}

function encryptPhoto(photo) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  const datosCifrados = Buffer.concat([cipher.update(photo.bytes), cipher.final()]);
  return { datosCifrados, nonce, etiqueta: cipher.getAuthTag(), mime: photo.mime };
}

async function save(visitId, encrypted, options = {}) {
  return Foto.create({ visitaId: visitId, ...encrypted }, options);
}
async function findForAdmin(visitId) {
  const row = await Foto.findByPk(visitId);
  if (!row) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), row.nonce);
  decipher.setAuthTag(row.etiqueta);
  return { mime: row.mime, bytes: Buffer.concat([decipher.update(row.datosCifrados), decipher.final()]) };
}
module.exports = { MAX_BYTES, validatePhoto, encryptPhoto, save, findForAdmin };
