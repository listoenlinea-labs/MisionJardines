const { Op } = require('sequelize');
const { Cuota, PagoReportado, Casa } = require('../models');
const Vigencia = require('../models/VigenciaMantenimiento');
const { centavos, validarFecha, calcular, vigente } = require('./vigencia-calculo');
const mensualidades = require('./mensualidades-mantenimiento');

function enviarTrasCommit(casaId, transaction) {
    // Never hold a payment transaction open while communicating with hardware.
    transaction.afterCommit(() => {
        require('./zkteco-vigencias.service').solicitar(casaId);
    });
}

async function principalConfirmado(casaId, transaction, { desde = null } = {}) {
    const cuotas = await Cuota.findAll({ where: { casaId, estatusPago: { [Op.in]: ['PAGADO', 'PAGO_PARCIAL'] } }, transaction });
    const pagos = await PagoReportado.findAll({ where: { casaId, tipoPago: 'MANTENIMIENTO', estatus: 'VALIDADO' }, transaction });
    // A bank movement reflected in both screens must not extend access twice.
    // En el período automático no trasladamos pagos anteriores a octubre de 2026.
    // Las fechas se evalúan solo para ese período, preservando las vigencias
    // históricas configuradas manualmente.
    const enPeriodo = value => !desde || (value && String(value instanceof Date ? value.toISOString().slice(0,10) : value).slice(0,10) >= desde);
    const pagosPeriodo = pagos.filter(p => enPeriodo(p.fechaOperacion));
    const cuotasPeriodo = cuotas.filter(c => enPeriodo(c.fechaPago));
    const foliosReportados = new Set(pagosPeriodo.map(p => String(p.folioOperacion).trim()));
    const sum = cuotasPeriodo.filter(c => String(c.tipoPago || '').trim().toUpperCase() !== 'EXTRAORDINARIO').filter(c => !foliosReportados.has(String(c.referencia || '').trim())).reduce((total, c) =>
        total + Math.max(0, centavos(c.montoPagado) - centavos(c.recargo || 0)), 0)
        + pagosPeriodo.reduce((total, p) => total + Math.max(0, centavos(p.monto) - centavos(p.recargo || 0)), 0);
    return (sum / 100).toFixed(2);
}
async function bloquearCasa(casaId, transaction) {
    const casa = await Casa.findByPk(casaId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!casa) throw Object.assign(new Error('Vivienda no encontrada'), { status: 404 });
}
async function inicializar(casaId, fechaBase, tarifa, usuarioId, transaction) {
    validarFecha(fechaBase);
    if (centavos(tarifa) <= 0) throw Object.assign(new Error('La tarifa debe ser mayor que cero'), { status: 400 });
    await bloquearCasa(casaId, transaction);
    if (await Vigencia.findByPk(casaId, { transaction })) throw Object.assign(new Error('La vigencia inicial ya fue registrada'), { status: 409 });
    const principal = await principalConfirmado(casaId, transaction);
    const row = await Vigencia.create({ casaId, fechaBase, fechaFinal: fechaBase, tarifaMensual: tarifa,
        principalInicial: principal, principalConfirmado: principal, saldoParcial: 0, actualizadoPorUsuarioId: usuarioId,
        sincronizacion: 'PENDIENTE', intentos: 0 }, { transaction });
    enviarTrasCommit(casaId, transaction);
    return row;
}
async function actualizar(casaId, usuarioId, transaction) {
    await bloquearCasa(casaId, transaction);
    const row = await Vigencia.findByPk(casaId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!row) {
        // Cada vivienda empieza debiendo OCTUBRE 2026. El primer pago completo
        // compra octubre y deja el corte del C3 en NOVIEMBRE 10, nunca
        // toma la fecha de carga como inicio de una nueva vigencia.
        const principal = await principalConfirmado(casaId, transaction, { desde: mensualidades.INICIO });
        const result = calcular({fechaBase: mensualidades.CORTE_INICIAL,
            tarifaMensual: mensualidades.BASE, principalInicial:'0.00',
            principalConfirmado: principal });
        const created = await Vigencia.create({
            casaId, fechaBase: mensualidades.CORTE_INICIAL,
            fechaFinal: result.fechaFinal, tarifaMensual: mensualidades.BASE,
            principalInicial: '0.00', principalConfirmado: principal,
            saldoParcial: result.saldoParcial, actualizadoPorUsuarioId: usuarioId,
            sincronizacion: 'PENDIENTE', intentos: 0
        }, { transaction });
        enviarTrasCommit(casaId, transaction);
        return resumen(created);
    }
    // No alterar la línea base de vigencias antiguas configuradas manualmente
    // con capital ya reconocido. El inicio automático tiene capital inicial 0.
    const inicioAutomatico = row.fechaBase === mensualidades.CORTE_INICIAL &&
        centavos(row.principalInicial || 0) === 0;
    const principal = await principalConfirmado(casaId, transaction,
        { desde: inicioAutomatico ? mensualidades.INICIO : null });
    const result = calcular({ fechaBase: row.fechaBase, tarifaMensual: row.tarifaMensual,
        principalInicial: row.principalInicial, principalConfirmado: principal });
    await row.update({ fechaFinal: result.fechaFinal, principalConfirmado: principal,
        saldoParcial: result.saldoParcial, actualizadoPorUsuarioId: usuarioId,
        sincronizacion: 'PENDIENTE', proximoIntento: null, intentos: 0, errorSincronizacion: null }, { transaction });
    enviarTrasCommit(casaId, transaction);
    return resumen(row);
}
function resumen(row) {
    if (!row) return { pendienteConfiguracion: true, fechaFinal: null, sincronizacion: 'SIN_CONFIGURAR' };
    return { pendienteConfiguracion: false, fechaFinal: row.fechaFinal, tarifaMensual: row.tarifaMensual,
        saldoParcial: row.saldoParcial, vigenteSegunFecha: vigente(row.fechaFinal),
        actualizadoEn: row.updatedAt, sincronizacion: row.sincronizacion || 'PENDIENTE',
        sincronizadoEn: row.sincronizadoEn || null, proximoIntento: row.proximoIntento || null };
}
module.exports = { inicializar, actualizar, resumen, principalConfirmado, Vigencia };
