'use strict';

const recibos = require('../services/recibo-mantenimiento-analisis.service');

function casaIdSolicitada(req) {
    const id = Number(req.params.casaId);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw Object.assign(new Error('Vivienda inválida'), { status: 400 });
    }
    return id;
}

function responderError(res, error) {
    if (!error.status) console.error('[finanzas recibo mantenimiento]', error);
    return res.status(error.status || 503).json({
        ok: false,
        message: error.status ? error.message : 'No fue posible generar el recibo de mantenimiento'
    });
}

async function datosRecibo(req, res) {
    try {
        const { casa, resumen } = await recibos.consultarPago(casaIdSolicitada(req));
        const telefonos = await recibos.consultarTelefonos(casa);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.json({ ok: true, data: { ...resumen, telefonos } });
    } catch (error) {
        return responderError(res, error);
    }
}

async function pdfRecibo(req, res) {
    try {
        const { recibo } = await recibos.consultarPago(casaIdSolicitada(req));
        const { buffer, nombreArchivo } = await recibos.generarPdf(recibo);
        const nombreSeguro = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_');
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${nombreSeguro}"`);
        res.setHeader('Content-Length', buffer.length);
        return res.end(buffer);
    } catch (error) {
        return responderError(res, error);
    }
}

module.exports = { datosRecibo, pdfRecibo };
