const { createHash } = require('crypto');
const { Op } = require('sequelize');
const { Cuota, PagoReportado, Casa, ZkTarjeta } = require('../models');
const Vigencia = require('../models/VigenciaMantenimiento');
const PagoAcceso = require('../models/PagoAccesoC3');
const AplicacionTag = require('../models/PagoAccesoTagC3');
const sequelize = require('../config/database');
const { fechaReal, neto } = require('./pago-acceso-calculo');
const { BASE } = require('./mensualidades-mantenimiento');

async function bloquearCasa(casaId, transaction) {
    const casa = await Casa.findByPk(casaId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!casa) throw Object.assign(new Error('Vivienda no encontrada'), { status: 404 });
}
function capturarCuota(c) {
    return { id: c.id, casaId: c.casaId, tipoPago: c.tipoPago, estatusPago: c.estatusPago,
        montoPagado: c.montoPagado, recargo: c.recargo, referencia: c.referencia };
}
function principalMovimiento(cuotas, pagos) {
    // One bank movement represented in both modules buys months once.
    const cuota = cuotas.reduce((sum, r) => sum + neto(r, 'CUOTA'), 0);
    const reporte = pagos.reduce((max, r) => Math.max(max, neto(r, 'PAGO')), 0);
    return Math.max(cuota, reporte);
}
async function actualizar(casaId, usuarioId, transaction, { origen, registro, anterior = null } = {}) {
    if (!['CUOTA', 'PAGO'].includes(origen) || !registro?.id)
        throw Object.assign(new Error('Se necesita un pago concreto para incrementar el acceso'), { status: 400 });
    if (Number(registro.casaId) !== Number(casaId)) throw Object.assign(new Error('El pago no pertenece a esta vivienda'), { status: 400 });
    await bloquearCasa(casaId, transaction);
    const referencia = String(origen === 'PAGO' ? registro.folioOperacion || '' : registro.referencia || '').trim();
    const identity = referencia ? 'BANCO:' + referencia.toLowerCase() : origen + ':' + registro.id;
    const claveMovimiento = casaId + ':' + createHash('sha256').update(identity).digest('hex');
    let antes, despues;
    if (referencia) {
        // Only this movement, never the lifetime total or a fixed date baseline.
        const cuotas = await Cuota.findAll({ where: { casaId, referencia }, transaction });
        const pagos = await PagoReportado.findAll({ where: { casaId, folioOperacion: referencia, tipoPago: 'MANTENIMIENTO' }, transaction });
        const otherCuotas = cuotas.filter(r => !(origen === 'CUOTA' && String(r.id) === String(registro.id)));
        const otherPagos = pagos.filter(r => !(origen === 'PAGO' && String(r.id) === String(registro.id)));
        antes = principalMovimiento([...otherCuotas, ...(origen === 'CUOTA' && anterior ? [anterior] : [])],
            [...otherPagos, ...(origen === 'PAGO' && anterior ? [anterior] : [])]);
        despues = principalMovimiento([...otherCuotas, ...(origen === 'CUOTA' ? [registro] : [])],
            [...otherPagos, ...(origen === 'PAGO' ? [registro] : [])]);
    } else {
        antes = neto(anterior, origen); despues = neto(registro, origen);
    }
    const reconocido = await PagoAcceso.findOne({ where: { claveMovimiento },
        order: [['principalMovimiento', 'DESC']], transaction, lock: transaction.LOCK.UPDATE });
    // High-water mark prevents an edit/reapproval from buying the same months again.
    const previo = Math.max(antes, Number(reconocido?.principalMovimiento || 0));
    const delta = despues - previo;
    if (delta <= 0) return { fuente: 'C3', sincronizacion: 'SIN_INCREMENTO', meses: 0 };
    const ultimo = await PagoAcceso.findOne({ where: { casaId }, order: [['id', 'DESC']], transaction });
    const saldoAntes = Number(ultimo?.saldoDespues || 0);
    const disponible = saldoAntes + delta, tarifa = BASE * 100;
    const meses = Math.floor(disponible / tarifa), saldoDespues = disponible % tarifa;
    const tags = meses ? await ZkTarjeta.findAll({ where: { casaId }, order: [['id', 'ASC']], transaction }) : [];
    const estado = !meses ? 'COMPLETADO' : tags.length ? 'PENDIENTE' : 'SIN_TAGS';
    const event = await PagoAcceso.create({ casaId, claveMovimiento, origen, origenId: registro.id,
        referencia: referencia || null, montoOrigen: origen === 'PAGO' ? registro.monto : registro.montoPagado,
        recargoOrigen: registro.recargo || 0, principalMovimiento: despues, principalAplicado: delta,
        meses, saldoAntes, saldoDespues, usuarioId, estado }, { transaction });
    for (const tag of tags) await AplicacionTag.create({ pagoAccesoId: event.id, tarjetaId: tag.id,
        numeroTarjeta: tag.numeroTarjeta }, { transaction });
    if (estado === 'PENDIENTE') transaction.afterCommit(() => require('./zkteco-vigencias.service').solicitar(casaId));
    return { fuente: 'C3', sincronizacion: estado, pagoAccesoId: event.id, meses,
        saldoParcial: (saldoDespues / 100).toFixed(2), pendienteConfiguracion: estado === 'SIN_TAGS' };
}
async function estadoCasa(casaId, transaction) {
    const tags = await ZkTarjeta.findAll({ where: { casaId }, transaction });
    const ultimo = await PagoAcceso.findOne({ where: { casaId }, order: [['id', 'DESC']], transaction });
    const pendiente = await PagoAcceso.findOne({ where: { casaId, estado: { [Op.notIn]: ['COMPLETADO', 'SIN_TAGS'] } },
        order: [['id', 'ASC']], transaction });
    const fechas = [...new Set(tags.map(t => t.fechaFin).filter(Boolean))];
    return { fuente: 'C3', soloReferencia: true, pendienteConfiguracion: !tags.length,
        fechaFinal: fechas.length === 1 ? fechas[0] : null,
        fechasTags: tags.map(t => ({ numeroTarjeta: t.numeroTarjeta, fechaFinal: t.fechaFin })),
        tarifaMensual: BASE, saldoParcial: (Number(ultimo?.saldoDespues || 0) / 100).toFixed(2),
        sincronizacion: pendiente?.estado || ultimo?.estado || 'REFERENCIA_C3',
        errorSincronizacion: pendiente?.error || null, pagoAccesoId: pendiente?.id || ultimo?.id || null };
}
// Legacy setup now records a reference only. It never sends a date to the C3.
async function inicializar(casaId, fechaFinal, tarifa, usuarioId, transaction) {
    fechaReal(fechaFinal);
    await bloquearCasa(casaId, transaction);
    if (await Vigencia.findByPk(casaId, { transaction })) throw Object.assign(new Error('Ya existe una referencia de vigencia'), { status: 409 });
    return Vigencia.create({ casaId, fechaBase: fechaFinal, fechaFinal, tarifaMensual: tarifa,
        principalInicial: 0, principalConfirmado: 0, saldoParcial: 0, actualizadoPorUsuarioId: usuarioId,
        sincronizacion: 'REFERENCIA_C3', intentos: 0 }, { transaction });
}
async function asegurarVigenciaParaAlta(casaId, fechaFinal, usuarioId = null) {
    return sequelize.transaction(async transaction => {
        await bloquearCasa(casaId, transaction);
        const existente = await Vigencia.findByPk(casaId, { transaction });
        if (existente) return { creada: false, casaId, fechaFinal: existente.fechaFinal };
        const row = await inicializar(casaId, fechaFinal, BASE, usuarioId, transaction);
        return { creada: true, casaId, fechaFinal: row.fechaFinal };
    });
}
function resumen(row) {
    if (!row) return { pendienteConfiguracion: true, fechaFinal: null, sincronizacion: 'SIN_CONFIGURAR', soloReferencia: true };
    return { pendienteConfiguracion: false, fechaFinal: row.fechaFinal, tarifaMensual: row.tarifaMensual,
        saldoParcial: row.saldoParcial, soloReferencia: true, sincronizacion: row.sincronizacion,
        actualizadoEn: row.updatedAt, sincronizadoEn: row.sincronizadoEn || null };
}
module.exports = { inicializar, actualizar, capturarCuota, asegurarVigenciaParaAlta, estadoCasa, resumen, Vigencia };
