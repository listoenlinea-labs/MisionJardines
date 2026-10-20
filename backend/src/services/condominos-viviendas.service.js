const { Op } = require('sequelize');
const fail = (message) => Object.assign(new Error(message), { status: 409 });
function viviendaIds(values) {
    if (!Array.isArray(values) || !values.length || values.length > 250 || values.some(id => !/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id)))) {
        throw Object.assign(new Error('Selecciona al menos una vivienda válida (máximo 250).'), { status: 400 });
    }
    return [...new Set(values.map(Number))];
}
function crearRelaciones({ CondominoVivienda, Casa }) {
    async function viviendas(condominoId, transaction) {
        const links = await CondominoVivienda.findAll({ where: { condominoId, activo: true },
            order: [['viviendaId', 'ASC']], transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
        const casas = [];
        for (const link of links) {
            const casa = await Casa.findByPk(link.viviendaId, { transaction });
            if (!casa) throw fail('Una vivienda vinculada ya no existe. Revisa el padrón.');
            casas.push(casa);
        }
        return casas;
    }
    async function reemplazar(condominoId, ids, transaction) {
        // Caller locks the condominium before replacing its complete association set.
        await CondominoVivienda.update({ activo: false, actualizadoEn: new Date() }, {
            where: { condominoId, viviendaId: { [Op.notIn]: ids } }, transaction });
        for (const viviendaId of ids) {
            const [link] = await CondominoVivienda.findOrCreate({ where: { condominoId, viviendaId }, defaults: { activo: true }, transaction });
            await link.update({ activo: true, actualizadoEn: new Date() }, { transaction });
        }
    }
    return { viviendas, reemplazar };
}
module.exports = { crearRelaciones, viviendaIds };
