const { Op, fn, col, where } = require('sequelize');
function normalizarTelefono(value) {
    const text = String(value || '').trim();
    if (!/^[+\d\s().-]+$/.test(text)) return null;
    let digits = text.replace(/\D/g, '');
    if (digits.length === 10) digits = '52' + digits;
    if (digits.length === 13 && digits.startsWith('521')) digits = '52' + digits.slice(3);
    return /^[1-9]\d{10,14}$/.test(digits) ? digits : null;
}
function filtroTelefono(value, alias = 'Usuario') {
    const phone = normalizarTelefono(value);
    if (!phone) throw Object.assign(new Error('Escribe un solo número de teléfono válido, con lada.'), { status: 400 });
    const variants = [phone];
    if (phone.startsWith('52') && phone.length === 12) variants.push(phone.slice(2), '521' + phone.slice(2));
    let expression = col(alias + '.telefono');
    for (const character of [' ', '+', '(', ')', '-', '.', '\t', '\n', '\r']) expression = fn('REPLACE', expression, character, '');
    return where(expression, { [Op.in]: variants });
}
async function buscarUsuariosPorTelefono(model, phone, options = {}) {
    return model.findAll({ ...options, where: filtroTelefono(phone, model.name || 'Usuario'), limit: 2 });
}
module.exports = { normalizarTelefono, filtroTelefono, buscarUsuariosPorTelefono };
