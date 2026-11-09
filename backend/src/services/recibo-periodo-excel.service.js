'use strict';

const { datosDeMovimiento } = require('./recibo-mantenimiento-analisis.service');

/**
 * Folio del recibo que acredita el MES SELECCIONADO del análisis.
 *
 * Nunca utilizar 'ultimoPago': puede corresponder a octubre o a una mensualidad
 * posterior. Se reutiliza datosDeMovimiento, la misma fuente que genera el PDF
 * del historial, descargas y visualización, para obtener su folio exacto.
 *
 * Conservamos el movimiento original si el pago de noviembre fue anticipado
 * en octubre: el folio describe ese movimiento, no inventa un nuevo recibo.
 */
function reciboDelPeriodo({ casa, cuotas = [], comprobantes = [], estado, saldoPendiente, anio, mes }) {
    if (String(estado || '').toUpperCase() !== 'PAGADO' || !Number.isFinite(Number(saldoPendiente)) ||
        Number(saldoPendiente) > 0 || !Number.isInteger(anio) || !Number.isInteger(mes) ||
        mes < 1 || mes > 12) return null;

    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
    try {
        const { resumen } = datosDeMovimiento(casa, cuotas, comprobantes, new Date(), periodo);
        const folio = String(resumen.folio || '').trim();
        const referencia = String(resumen.referencia || '').trim();
        if (!/^MJ-(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)-\d{4}-[A-F0-9]{10}-[A-Z][A-Z0-9]+-M$/.test(folio) ||
            !referencia || !Number.isFinite(Number(resumen.monto)) || Number(resumen.monto) <= 0) return null;
        return { folio, referencia, periodoSeleccionado: periodo };
    } catch (error) {
        // Un período no confirmado o sin referencia verificable no tiene recibo.
        // Esto NO altera el estado de pago ni bloquea todo el tablero.
        if ([400, 404, 409].includes(Number(error.status))) return null;
        throw error;
    }
}

module.exports = { reciboDelPeriodo };
