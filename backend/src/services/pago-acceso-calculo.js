const { centavos } = require('./vigencia-calculo');

function fechaReal(value) {
    const text = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('El C3 no devolvió una fecha final válida');
    const date = new Date(text + 'T12:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text || Number(text.slice(0, 4)) < 1900)
        throw new Error('El C3 no devolvió una fecha final válida');
    return text;
}
function incrementar(fechaC3, meses) {
    fechaReal(fechaC3);
    if (!Number.isSafeInteger(meses) || meses < 1) throw new Error('Incremento de meses inválido');
    const [year, month] = fechaC3.split('-').map(Number);
    const index = year * 12 + month - 1 + meses;
    if (Math.floor(index / 12) > 9999) throw new Error('Fecha final fuera de rango');
    return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}-10`;
}
function neto(registro, origen) {
    if (!registro || String(registro.tipoPago || '').toUpperCase() === 'EXTRAORDINARIO') return 0;
    const confirmado = origen === 'PAGO' ? registro.estatus === 'VALIDADO' : ['PAGADO', 'PAGO_PARCIAL'].includes(registro.estatusPago);
    if (!confirmado) return 0;
    return Math.max(0, centavos(origen === 'PAGO' ? registro.monto : registro.montoPagado) - centavos(registro.recargo || 0));
}
module.exports = { fechaReal, incrementar, neto };
