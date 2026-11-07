const express = require('express');
const { createHmac, timingSafeEqual } = require('node:crypto');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');

const webhook = express.Router();
const administracion = express.Router();
const tipos = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['application/pdf', 'pdf']
]);
const maxBytes = 2 * 1024 * 1024;

function coincide(a, b) {
    const origen = Buffer.from(a || '');
    const esperado = Buffer.from(b);
    return origen.length === esperado.length && timingSafeEqual(origen, esperado);
}

webhook.use((req, res, next) => {
    if (process.env.WHATSAPP_COMPROBANTES_ENABLED !== 'true') return res.sendStatus(404);
    if (!process.env.WHATSAPP_APP_SECRET || !process.env.WHATSAPP_VERIFY_TOKEN ||
        !process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN ||
        !/^v\d+\.\d+$/.test(process.env.WHATSAPP_GRAPH_VERSION || '')) {
        return res.sendStatus(503);
    }
    next();
});

webhook.get('/', (req, res) => {
    const { 'hub.mode': modo, 'hub.verify_token': token, 'hub.challenge': reto } = req.query;
    if (modo !== 'subscribe' || typeof token !== 'string' ||
        !coincide(token, process.env.WHATSAPP_VERIFY_TOKEN) ||
        typeof reto !== 'string' || !/^\d+$/.test(reto)) return res.sendStatus(403);
    res.type('text/plain').send(reto);
});

async function descargarAdjunto(id) {
    const opciones = {
        headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_ACCESS_TOKEN },
        redirect: 'error',
        signal: AbortSignal.timeout(8000)
    };
    const url = new URL('https://graph.facebook.com/' + process.env.WHATSAPP_GRAPH_VERSION + '/' + id);
    url.searchParams.set('phone_number_id', process.env.WHATSAPP_PHONE_NUMBER_ID);
    const metadata = await fetch(url, opciones);
    if (!metadata.ok) throw new Error('Meta no entregó los metadatos');
    const datos = await metadata.json();
    const mime = datos.mime_type;
    if (!tipos.has(mime) || Number(datos.file_size) > maxBytes) return null;

    const adjunto = new URL(datos.url);
    if (adjunto.origin !== 'https://lookaside.fbsbx.com') throw new Error('Origen de archivo inesperado');
    const descarga = await fetch(adjunto, { ...opciones, signal: AbortSignal.timeout(10000) });
    if (!descarga.ok) throw new Error('Meta no entregó el archivo');
    const partes = [];
    let total = 0;
    for await (const parte of descarga.body) {
        total += parte.length;
        if (total > maxBytes) return null;
        partes.push(parte);
    }
    return total ? { mime, archivo: Buffer.concat(partes) } : null;
}

webhook.post('/', express.raw({ type: 'application/json', limit: '256kb', inflate: false }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) return res.sendStatus(415);
    const firma = 'sha256=' + createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(req.body).digest('hex');
    if (!coincide(req.get('x-hub-signature-256'), firma)) return res.sendStatus(403);

    let evento;
    try {
        evento = JSON.parse(req.body);
    } catch {
        return res.sendStatus(400);
    }
    try {
        if (evento?.object !== 'whatsapp_business_account') return res.sendStatus(200);
        for (const entrada of evento.entry || []) {
            for (const cambio of entrada.changes || []) {
                const valor = cambio.value;
                if (cambio.field !== 'messages' ||
                    valor?.metadata?.phone_number_id !== process.env.WHATSAPP_PHONE_NUMBER_ID) continue;
                for (const mensaje of valor.messages || []) {
                    const id = mensaje[mensaje.type]?.id;
                    if (!['image', 'document'].includes(mensaje.type) ||
                        !/^\d+$/.test(id || '') || !/^\d{5,32}$/.test(mensaje.from || '') ||
                        !/^wamid\.[\w+/=-]{1,249}$/.test(mensaje.id || '')) continue;
                    const [existente] = await sequelize.query(
                        'SELECT id FROM whatsapp_comprobantes WHERE mensaje_id = :mensajeId',
                        { replacements: { mensajeId: mensaje.id }, type: QueryTypes.SELECT }
                    );
                    if (existente) continue;

                    const archivo = await descargarAdjunto(id);
                    if (!archivo) continue;
                    await sequelize.query(
                        `INSERT INTO whatsapp_comprobantes (mensaje_id, remitente, mime, archivo)
                         VALUES (:mensajeId, :remitente, :mime, :archivo)
                         ON DUPLICATE KEY UPDATE id = id`,
                        { replacements: { mensajeId: mensaje.id, remitente: mensaje.from, ...archivo } }
                    );
                }
            }
        }
        return res.sendStatus(200);
    } catch {
        console.error('Error al recibir un comprobante de WhatsApp');
        return res.sendStatus(503);
    }
});

administracion.use(autenticarToken, autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR'));
administracion.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});
administracion.get('/', async (req, res) => {
    const antes = req.query.antes;
    if (antes !== undefined && (typeof antes !== 'string' || !/^\d{1,10}$/.test(antes))) {
        return res.sendStatus(400);
    }
    const comprobantes = await sequelize.query(
        `SELECT id, remitente, mime, recibido_en FROM whatsapp_comprobantes
         WHERE (:antes IS NULL OR id < :antes) ORDER BY id DESC LIMIT 100`,
        { replacements: { antes: antes ?? null }, type: QueryTypes.SELECT }
    );
    res.json({ comprobantes });
});

administracion.get('/:id', async (req, res) => {
    if (!/^\d{1,10}$/.test(req.params.id)) return res.sendStatus(400);
    const [comprobante] = await sequelize.query(
        'SELECT mime, archivo FROM whatsapp_comprobantes WHERE id = :id',
        { replacements: { id: req.params.id }, type: QueryTypes.SELECT }
    );
    if (!comprobante) return res.sendStatus(404);
    res.attachment('comprobante-whatsapp-' + req.params.id + '.' + tipos.get(comprobante.mime));
    res.type('application/octet-stream').send(comprobante.archivo);
});

module.exports = { webhook, administracion };
