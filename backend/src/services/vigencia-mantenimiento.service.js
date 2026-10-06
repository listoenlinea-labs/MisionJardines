const { Op } = require('sequelize');
const { Cuota, PagoReportado, Casa } = require('../models');
const Vigencia = require('../models/VigenciaMantenimiento');
const { centavos, validarFecha, calcular, vigente } = require('./vigencia-calculo');

async function principalConfirmado(casaId, transaction) {
    const cuotas = await Cuota.findAll({ where: { casaId, estatusPago: { [Op.in]: ['PAGADO', 'PAGO_PARCIAL'] } }, transaction });
    const pagos = await PagoReportado.findAll({ where: { casaId, tipoPago: 'MANTENIMIENTO', estatus: 'VALIDADO' }, transaction });
    // A bank movement reflected in both screens must not extend access twice.
    const foliosReportados = new Set(pagos.map(p => String(p.folioOperacion).trim()));
    const sum = cuotas.filter(c => String(c.tipoPago || '').trim().toUpperCase() !== 'EXTRAORDINARIO').filter(c => !foliosReportados.has(String(c.referencia || '').trim())).reduce((total, c) =>
        total + Math.max(0, centavos(c.montoPagado) - centavos(c.recargo || 0)), 0)
        + pagos.reduce((total, p) => total + Math.max(0, centavos(p.monto) - centavos(p.recargo || 0)), 0);
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
    return Vigencia.create({ casaId, fechaBase, fechaFinal: fechaBase, tarifaMensual: tarifa,
        principalInicial: principal, principalConfirmado: principal, saldoParcial: 0, actualizadoPorUsuarioId: usuarioId }, { transaction });
}
async function actualizar(casaId, usuarioId, transaction) {
    await bloquearCasa(casaId, transaction);
    const row = await Vigencia.findByPk(casaId, { transaction, lock: transaction.LOCK.UPDATE });
    // Existing collections keep working until the real manual cutoff is entered.
    // Never invent a cutoff or grant a grace month.
    if (!row) return { pendienteConfiguracion: true, fechaFinal: null };
    const principal = await principalConfirmado(casaId, transaction);
    const result = calcular({ fechaBase: row.fechaBase, tarifaMensual: row.tarifaMensual,
        principalInicial: row.principalInicial, principalConfirmado: principal });
    await row.update({ fechaFinal: result.fechaFinal, principalConfirmado: principal,
        saldoParcial: result.saldoParcial, actualizadoPorUsuarioId: usuarioId }, { transaction });
    return resumen(row);
}
function resumen(row) {
    if (!row) return { pendienteConfiguracion: true, fechaFinal: null, sincronizacion: 'NO_IMPLEMENTADA' };
    return { pendienteConfiguracion: false, fechaFinal: row.fechaFinal, tarifaMensual: row.tarifaMensual,
        saldoParcial: row.saldoParcial, vigenteSegunFecha: vigente(row.fechaFinal),
        actualizadoEn: row.updatedAt, sincronizacion: 'NO_IMPLEMENTADA' };
}
module.exports = { inicializar, actualizar, resumen, principalConfirmado, Vigencia };
