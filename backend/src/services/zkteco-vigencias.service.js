const { Op } = require('sequelize');
const sequelize = require('../config/database');
const Vigencia = require('../models/VigenciaMantenimiento');
const ZkTarjeta = require('../models/ZkTarjeta');
const direct = require('./zkteco-direct.service');

let timer;
let running = false;
const queue = new Set();
let draining = false;

// Events enqueue only after their database changes have committed. The durable
// pending row survives process restarts; this queue only accelerates delivery.
function solicitar(casaId) {
    queue.add(casaId);
    if (draining) return;
    draining = true;
    setImmediate(async () => {
        try {
            while (queue.size) {
                const id = queue.values().next().value;
                queue.delete(id);
                try { await sincronizarCasa(id); }
                catch (error) { console.error(`[ZKTeco vigencias] Casa ${id}:`, error.message); }
            }
        } finally { draining = false; }
    });
}

async function marcarPendiente(casaId) {
    if (!casaId) return { sincronizacion: 'SIN_CONFIGURAR' };
    const [actualizadas] = await Vigencia.update({ sincronizacion: 'PENDIENTE', proximoIntento: null,
        intentos: 0, errorSincronizacion: null }, { where: { casaId } });
    // Zero rows means this house has no confirmed maintenance cutoff.
    // Do not enqueue a silent no-op or invent a financial entitlement.
    if (!actualizadas) return { casaId, sincronizacion: 'SIN_CONFIGURAR' };
    solicitar(casaId);
    return { casaId, sincronizacion: 'PENDIENTE' };
}
const necesitaFecha = (tag, fecha) => tag.fechaFin !== fecha ||
    (tag.fechaFinOriginal && tag.fechaFinOriginal !== fecha);

async function sincronizarCasa(casaId, { now = new Date(), dryRun = process.env.ZKTECO_DRY_RUN === 'true' } = {}) {
    // The same row is locked by payment recalculation. Concurrent workers and
    // newer payments cannot let an older EndTime overwrite the latest cutoff.
    // This transaction belongs to the worker, never to payment confirmation.
    return sequelize.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
        const row = await Vigencia.findByPk(casaId, { transaction, lock: transaction.LOCK.UPDATE });
        if (!row || (row.proximoIntento && new Date(row.proximoIntento) > now)) return;
        const tags = await ZkTarjeta.findAll({ where: { casaId, enControlador: true }, transaction, lock: transaction.LOCK.UPDATE });
        const pending = row.sincronizacion !== 'COMPLETADO';
        const targets = pending ? tags : tags.filter(tag => necesitaFecha(tag, row.fechaFinal));
        if (!pending && !targets.length && tags.length) return;

        if (!tags.length || dryRun) {
            await row.update({ sincronizacion: !tags.length ? 'SIN_TAGS' : 'SIMULACION',
                proximoIntento: new Date(now.getTime() + 60000), errorSincronizacion: null }, { transaction });
            return;
        }

        const errors = [];
        for (const tag of targets) {
            try {
                // Null preserves the controller's actual StartTime. Never grant
                // door authorization here, including for manually blocked TAGs.
                await direct.writeUserValidity(tag.numeroTarjeta, null, row.fechaFinal, { mode: 'DIRECT' });
                await tag.update({ fechaFin: row.fechaFinal,
                    ...(tag.fechaFinOriginal ? { fechaFinOriginal: row.fechaFinal } : {}),
                    ultimaLectura: now }, { transaction });
            } catch (error) {
                errors.push(`TAG ${tag.numeroTarjeta}: ${error.message}`);
            }
        }
        const intentos = (row.intentos || 0) + 1;
        const delay = Math.min(15 * 60 * 1000, 30000 * 2 ** Math.min(intentos - 1, 5));
        await row.update(errors.length ? {
            sincronizacion: 'ERROR', intentos,
            errorSincronizacion: errors.join(' | ').slice(0, 1000),
            proximoIntento: new Date(now.getTime() + delay)
        } : {
            sincronizacion: 'COMPLETADO', intentos: 0,
            sincronizadoEn: now, proximoIntento: null, errorSincronizacion: null
        }, { transaction });
        return { casaId, fechaFinal: row.fechaFinal, sincronizacion: row.sincronizacion };
    });
}

async function run() {
    if (running) return;
    running = true;
    try {
        // Recover pending deliveries only; completed houses are never scanned.
        const pending = await Vigencia.findAll({ attributes: ['casaId'], where: {
            sincronizacion: { [Op.in]: ['PENDIENTE', 'ERROR'] },
            [Op.or]: [{ proximoIntento: null }, { proximoIntento: { [Op.lte]: new Date() } }]
        }, order: [['updatedAt', 'ASC']], limit: 10 });
        for (const row of pending) {
            try { await sincronizarCasa(row.casaId); }
            catch (error) { console.error(`[ZKTeco vigencias] Casa ${row.casaId}:`, error.message); }
        }
    } catch (error) {
        console.error('[ZKTeco vigencias]', error.message);
    } finally { running = false; }
}

function start() {
    if (timer) return;
    const interval = Math.max(60000, Number(process.env.ZKTECO_VIGENCIAS_MS) || 300000);
    timer = setInterval(run, interval);
    timer.unref();
    void run();
}

module.exports = { start, run, sincronizarCasa, solicitar, marcarPendiente };
