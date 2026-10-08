function error(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function centavos(value) {
    const raw = String(value ?? '').trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) error('El importe debe ser positivo y tener como máximo dos decimales');
    const [whole, fraction = ''] = raw.split('.');
    const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(result) || result > 999999999999) error('Importe fuera de rango');
    return result;
}
function validarFecha(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-10$/);
    if (!match || Number(match[1]) < 1900 || Number(match[1]) > 9999 || Number(match[2]) < 1 || Number(match[2]) > 12)
        error('La fecha final debe ser un día 10 válido');
    return value;
}
function sumarMeses(fecha, meses) {
    validarFecha(fecha);
    const [year, month] = fecha.split('-').map(Number);
    const index = year * 12 + month - 1 + meses;
    const nextYear = Math.floor(index / 12), nextMonth = index % 12 + 1;
    if (nextYear < 1900 || nextYear > 9999) error('Vigencia fuera de rango');
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-10`;
}
function calcular({ fechaBase, tarifaMensual, principalInicial, principalConfirmado }) {
    const tarifa = centavos(tarifaMensual);
    if (!tarifa) error('La tarifa mensual debe ser mayor que cero');
    const neto = centavos(principalConfirmado) - centavos(principalInicial);
    // Recompute from the fixed baseline: notifications/retries never add months twice.
    const meses = Math.floor(neto / tarifa);
    const saldo = neto - meses * tarifa;
    return { fechaFinal: sumarMeses(fechaBase, meses), meses, saldoParcial: (saldo / 100).toFixed(2) };
}
function fechaMexico(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = key => parts.find(p => p.type === key).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}
function vigente(fechaFinal, now = new Date()) { return validarFecha(fechaFinal) >= fechaMexico(now); }
module.exports = { centavos, validarFecha, sumarMeses, calcular, vigente, fechaMexico };
