const { Op } = require('sequelize');
const sequelize = require('../config/database');
const Casa = require('../models/Casa');
const Tags = require('../models/ZkTarjeta');
const Eventos = require('../models/PagoAccesoC3');
const Aplicaciones = require('../models/PagoAccesoTagC3');
const direct = require('./zkteco-direct.service');
const { incrementar, fechaReal } = require('./pago-acceso-calculo');
const terminales = ['COMPLETADO', 'SIN_TAGS'];
let timer, running = false, draining = false;
const queue = new Set();
function solicitar(casaId) {
    queue.add(casaId);
    if (draining) return;
    draining = true;
    setImmediate(async () => {
        try {
            while (queue.size) {
                const id = queue.values().next().value; queue.delete(id);
                try { await sincronizarCasa(id); }
                catch (e) { console.error(`[C3 pagos] Casa ${id}:`, e.message); }
            }
        } finally { draining = false; }
    });
}
async function bloquear(casaId, transaction) {
    if (!await Casa.findByPk(casaId, { transaction, lock: transaction.LOCK.UPDATE })) throw new Error('Vivienda no encontrada');
}
async function siguiente(casaId, transaction) {
    return Eventos.findOne({ where: { casaId, estado: { [Op.notIn]: terminales } },
        order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
}
async function comprobarVinculo(tag, evento, transaction) {
    const local = await Tags.findByPk(tag.tarjetaId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!local || Number(local.casaId) !== Number(evento.casaId) || String(local.numeroTarjeta) !== String(tag.numeroTarjeta))
        throw Object.assign(new Error('El TAG fue eliminado, reemplazado o cambió de vivienda; revisa la aplicación del pago'), { status: 409 });
    return local;
}
async function preparar(casaId, now, dryRun) {
    // Read only C3 here. Commit the whole intent before any physical write.
    return sequelize.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
        await bloquear(casaId, transaction);
        const event = await siguiente(casaId, transaction);
        if (!event || event.estado === 'CONFLICTO' || (event.proximoIntento && new Date(event.proximoIntento) > now)) return null;
        if (dryRun) {
            await event.update({ estado: 'SIMULACION', proximoIntento: new Date(now.getTime() + 60000) }, { transaction });
            return null;
        }
        const tags = await Aplicaciones.findAll({ where: { pagoAccesoId: event.id }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
        if (!tags.length) throw new Error('El pago no tiene TAGs destinatarios registrados');
        const snapshots = [];
        try {
        for (const tag of tags) {
            if (tag.fechaAntes) continue;
            await comprobarVinculo(tag, event, transaction);
            const actual = await direct.readUserValidity(tag.numeroTarjeta);
            snapshots.push({ tag, pin: actual.pin, autorizaciones: actual.autorizaciones, fechaAntes: fechaReal(actual.fechaFinal),
                fechaDespues: incrementar(actual.fechaFinal, Number(event.meses)) });
        }
        } catch (error) { error.eventId = event.id; throw error; }
        for (const { tag, ...values } of snapshots) await tag.update({ ...values, estado: 'PREPARADO', error: null }, { transaction });
        await event.update({ estado: 'PREPARADO', error: null }, { transaction });
        return { id: event.id, tags: tags.map(t => t.id) };
    });
}
async function aplicar(casaId, eventId, tagId) {
    // House lock serializes other payments/processes. C3 itself has no SQL transaction.
    return sequelize.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
        await bloquear(casaId, transaction);
        const event = await siguiente(casaId, transaction);
        if (!event || String(event.id) !== String(eventId)) return;
        const tag = await Aplicaciones.findByPk(tagId, { transaction, lock: transaction.LOCK.UPDATE });
        if (tag.estado === 'COMPLETADO') return;
        const local = await comprobarVinculo(tag, event, transaction);
        const actual = await direct.readUserValidity(tag.numeroTarjeta);
        if (String(actual.pin) !== String(tag.pin)) throw Object.assign(new Error('Cambió el Pin físico del TAG; no se sobrescribió el C3'), { status: 409 });
        if (actual.autorizaciones !== tag.autorizaciones) throw Object.assign(new Error('Cambiaron las autorizaciones físicas del TAG; revisa el pago'), { status: 409 });
        if (actual.fechaFinal !== tag.fechaDespues) {
            if (actual.fechaFinal !== tag.fechaAntes)
                throw Object.assign(new Error(`La fecha del C3 cambió después de preparar el pago (TAG ${tag.numeroTarjeta}); no se sobrescribió`), { status: 409 });
            await direct.writeUserValidity(tag.numeroTarjeta, null, tag.fechaDespues, {
                mode: 'DIRECT', expectedEnd: tag.fechaAntes, expectedPin: tag.pin
            });
        }
        // If TCP succeeded but SQL failed, the retry sees fechaDespues and only records it.
        await local.update({ fechaFin: tag.fechaDespues,
            ...(local.fechaFinOriginal ? { fechaFinOriginal: tag.fechaDespues } : {}),
            enControlador: true, ultimaLectura: new Date() }, { transaction });
        await tag.update({ estado: 'COMPLETADO', error: null }, { transaction });
    });
}
async function registrarError(casaId, error, now, eventId) {
    return sequelize.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
        await bloquear(casaId, transaction);
        const event = await siguiente(casaId, transaction);
        if (!event || !eventId || String(event.id) !== String(eventId)) return;
        const intentos = Number(event.intentos || 0) + 1;
        await event.update({ estado: error.status === 409 ? 'CONFLICTO' : 'ERROR', intentos,
            error: String(error.message).slice(0, 1000),
            proximoIntento: error.status === 409 ? null : new Date(now.getTime() + Math.min(900000, 30000 * 2 ** Math.min(intentos - 1, 5))) }, { transaction });
    });
}
async function sincronizarCasa(casaId, { now = new Date(), dryRun = process.env.ZKTECO_DRY_RUN === 'true' } = {}) {
    for (let count = 0; count < 20; count++) {
        let intent;
        try {
            intent = await preparar(casaId, now, dryRun);
            if (!intent) return;
            for (const id of intent.tags) await aplicar(casaId, intent.id, id);
            await sequelize.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
                await bloquear(casaId, transaction);
                const event = await siguiente(casaId, transaction);
                if (!event || String(event.id) !== String(intent.id)) return;
                const tags = await Aplicaciones.findAll({ where: { pagoAccesoId: event.id }, transaction });
                if (tags.every(t => t.estado === 'COMPLETADO')) await event.update({ estado: 'COMPLETADO', error: null, proximoIntento: null }, { transaction });
            });
        } catch (error) { await registrarError(casaId, error, now, intent?.id || error.eventId); return { error: error.message }; }
    }
}
// Retired compatibility hook: inventory/reassignment must never copy SQL dates to C3.
async function marcarPendiente() { return { sincronizacion: 'REFERENCIA_C3' }; }
async function run() {
    if (running) return;
    running = true;
    try {
        const events = await Eventos.findAll({ where: { estado: { [Op.in]: ['PENDIENTE', 'PREPARADO', 'ERROR', 'SIMULACION'] },
            [Op.or]: [{ proximoIntento: null }, { proximoIntento: { [Op.lte]: new Date() } }] }, order: [['id', 'ASC']], limit: 50 });
        for (const casaId of new Set(events.map(e => e.casaId))) await sincronizarCasa(casaId);
    } catch (e) { console.error('[C3 pagos] Reintento pendiente:', e.message); }
    finally { running = false; }
}
function start() {
    if (timer) return;
    timer = setInterval(run, Math.max(60000, Number(process.env.ZKTECO_VIGENCIAS_MS) || 300000));
    timer.unref(); void run();
}
module.exports = { start, run, solicitar, marcarPendiente, sincronizarCasa };
