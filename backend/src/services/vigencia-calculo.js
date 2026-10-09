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
function fechaMexico(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = key => parts.find(p => p.type === key).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}
function vigente(fechaFinal, now = new Date()) { return validarFecha(fechaFinal) >= fechaMexico(now); }
module.exports = { centavos, validarFecha, vigente, fechaMexico };
