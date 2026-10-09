const { Op } = require('sequelize');
const Casa = require('../models/Casa');
const Tags = require('../models/ZkTarjeta');
const Pago = require('../models/PagoReportado');
const Eventos = require('../models/PagoAccesoC3');
const Recargos = require('../models/RecargoMantenimiento');
const direct = require('./zkteco-direct.service');
const pricing = require('./mensualidades-mantenimiento');
const error = (message, status = 409) => Object.assign(new Error(message), { status });
async function contexto(casaId, fechaOperacion, transaction) {
  pricing.validarOperacion(fechaOperacion);
  if (!await Casa.findByPk(casaId, { transaction, lock: transaction.LOCK.UPDATE })) throw error('Vivienda inexistente',404);
  if (await Pago.findOne({ where: { casaId, tipoPago: 'MANTENIMIENTO', estatus: 'PENDIENTE_VALIDACION' }, transaction }))
    throw error('Hay un comprobante de mantenimiento pendiente; espera su revisión antes de reportar otro');
  if (await Eventos.findOne({ where: { casaId, estado: { [Op.notIn]: ['COMPLETADO', 'SIN_TAGS'] } }, transaction }))
    throw error('Hay un incremento pendiente en el C3; espera su aplicación antes de cotizar otro pago');
  const tags = await Tags.findAll({ where: { casaId }, transaction, lock: transaction.LOCK.UPDATE });
  if (!tags.length) throw error('La vivienda no tiene TAGs asociados; Administración debe configurar su acceso');
  const fechas = new Set();
  for (const tag of tags) fechas.add((await direct.readUserValidity(tag.numeroTarjeta)).fechaFinal);
  if (fechas.size !== 1) throw error('Los TAGs de la vivienda tienen fechas distintas; Administración debe conciliarlas antes de calcular recargos');
  const fechaFinal = [...fechas][0];
  // Invalid/missing C3 dates must never silently waive or invent fees.
  pricing.cortesVencidos(fechaFinal,fechaOperacion);
  const rows = await Recargos.findAll({ where: { casaId }, transaction });
  const ultimo = await Eventos.findOne({ where: { casaId }, order: [['id','DESC']], transaction });
  const cortesPagados = rows.map(r => r.corte);
  const cortes = pricing.cortesVencidos(fechaFinal,fechaOperacion).filter(c => !cortesPagados.includes(c));
  const saldoParcial = Number(ultimo?.saldoDespues || 0) / 100;
  return { fechaFinal, cortesPagados, saldoParcial, cortesRecargo: cortes,
    recargo: cortes.length * pricing.RECARGO, fechaFinalC3: fechaFinal,
    minimo: Math.max(0.01, pricing.BASE - saldoParcial) + cortes.length * pricing.RECARGO };
}
async function cotizar(casaId,fecha,monto,transaction) {
  return pricing.cotizar(fecha,monto,await contexto(casaId,fecha,transaction));
}
async function confirmar(pago, transaction) {
  const cortes = pago.cortesRecargo;
  if (!Array.isArray(cortes) || !cortes.length) return; // Historical receipts are not reinterpreted.
  if (new Set(cortes).size !== cortes.length || Number(pago.recargo) !== cortes.length * pricing.RECARGO)
    throw error('Los cortes del comprobante no coinciden con su recargo; requiere revisión');
  for (const corte of cortes) if (!/^\d{4}-\d{2}-10$/.test(corte) || corte >= String(pago.fechaOperacion))
    throw error('El comprobante contiene un corte de recargo inválido');
  await Casa.findByPk(pago.casaId, { transaction, lock: transaction.LOCK.UPDATE });
  for (const corte of cortes) {
    // Composite key lookup explicitly uses both fields.
    const row = await Recargos.findOne({ where: { casaId: pago.casaId, corte }, transaction });
    if (row && String(row.pagoId) !== String(pago.id)) throw error('Este corte ya tiene el recargo pagado; revisa el comprobante');
    if (!row) await Recargos.create({ casaId: pago.casaId, corte, pagoId: pago.id, monto: pricing.RECARGO }, { transaction });
  }
}
module.exports = { contexto, cotizar, confirmar };
