const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { crearServicio, autenticarAgente, validarSolicitud } = require('../src/services/caseta.service');
const user = { usuarioId: 4, rol: 'SEGURIDAD' };
const request = () => ({ solicitudId: crypto.randomUUID(), accion: 'ABRIR', pluma: 'entrada' });
function fixture() {
    const Op = { lte: Symbol('lte'), gt: Symbol('gt') };
    let time = new Date('2026-10-05T22:00:00Z');
    const rows = [];
    const agents = new Map();
    function matches(row, where) {
        return Reflect.ownKeys(where).every(key => {
            const value = where[key];
            if (value && typeof value === 'object') return value[Op.lte] ? row[key] <= value[Op.lte] : row[key] > value[Op.gt];
            return row[key] === value;
        });
    }
    function makeRow(values) { return Object.assign(values, { async update(change) { Object.assign(this, change); return this; } }); }
    const Orden = {
        async findOne({ where }) { return rows.find(row => matches(row, where)) || null; },
        async findByPk(id) { return rows.find(row => row.id === id) || null; },
        async findOrCreate({ where, defaults }) {
            let row = await this.findOne({ where });
            if (row) return [row, false];
            row = makeRow({ ...defaults, ...where, createdAt: time }); rows.push(row); return [row, true];
        },
        async update(values, { where }) { rows.filter(row => matches(row, where)).forEach(row => Object.assign(row, values)); }
    };
    const Agente = { async findByPk(id) { return agents.get(id); }, async upsert(values) { agents.set(values.id, values); } };
    let chain = Promise.resolve();
    const sequelize = { transaction(fn) { const run = chain.then(() => fn({ LOCK: { UPDATE: 'UPDATE' } })); chain = run.catch(() => {}); return run; } };
    return { service: crearServicio({ Orden, Agente, sequelize, Op, now: () => time, agenteId: () => 'caseta' }),
        tick(seconds) { time = new Date(time.getTime() + seconds * 1000); }, rows };
}
test('agent credentials are isolated from user login and fail closed', () => {
    const token = 'a'.repeat(64);
    assert.equal(autenticarAgente('Bearer ' + token, { CASETA_AGENT_TOKENS: JSON.stringify({ caseta: token }) }), 'caseta');
    for (const header of ['Bearer wrong', token, 'Bearer ' + 'b'.repeat(64)]) assert.throws(() => autenticarAgente(header, { CASETA_AGENT_TOKENS: JSON.stringify({ caseta: token }) }), { status: 401 });
    assert.throws(() => autenticarAgente('Bearer ' + token, { CASETA_AGENT_TOKENS: '{' }), { status: 503 });
    assert.throws(() => autenticarAgente('Bearer ' + token, { CASETA_AGENT_TOKENS: JSON.stringify({ a: token, b: token }) }), { status: 401 });
});
test('residents and arbitrary actions are denied; fixed door mapping and duration', () => {
    assert.throws(() => validarSolicitud({ ...user, rol: 'CONDOMINO' }, request()), { status: 403 });
    assert.throws(() => validarSolicitud(user, { ...request(), accion: 'CERRAR' }), { status: 400 });
    assert.throws(() => validarSolicitud(user, { ...request(), pluma: 'otra' }), { status: 400 });
    assert.deepEqual(validarSolicitud(user, { ...request(), pluma: 'salida', puerta: 999, duracionSegundos: 255 }), { puerta: 2, duracionSegundos: 3 });
});
test('offline agents cannot receive new opening orders', async () => {
    const f = fixture(); await assert.rejects(f.service.crear(user, request()), { status: 503 });
    await f.service.reclamar('caseta', 'SIMULACION'); f.tick(16);
    await assert.rejects(f.service.crear(user, request()), { status: 503 });
});
test('idempotent requests do not enqueue duplicate openings', async () => {
    const f = fixture(); await f.service.reclamar('caseta', 'FISICO'); const body = request();
    const a = await f.service.crear(user, body); const b = await f.service.crear(user, body);
    assert.equal(a.id, b.id); assert.equal(f.rows.length, 1);
    await assert.rejects(f.service.crear(user, { ...body, pluma: 'salida' }), { status: 409 });
});
test('expired orders are never delivered after reconnection', async () => {
    const f = fixture(); await f.service.reclamar('caseta', 'FISICO'); const order = await f.service.crear(user, request()); f.tick(16);
    assert.equal(await f.service.reclamar('caseta', 'FISICO'), null); assert.equal(order.estado, 'VENCIDA');
});
test('concurrent polls only claim one order; claim is bound to its agent', async () => {
    const f = fixture(); await f.service.reclamar('caseta', 'FISICO'); await f.service.crear(user, request()); await f.service.crear(user, request());
    const results = await Promise.all([f.service.reclamar('caseta', 'FISICO'), f.service.reclamar('caseta', 'FISICO')]);
    assert.equal(results.filter(Boolean).length, 1); const order = results.find(Boolean);
    await assert.rejects(f.service.confirmar('otra', order.id, { estado: 'EJECUTADA', reclamoId: order.reclamoId }), { status: 404 });
    await assert.rejects(f.service.confirmar('caseta', order.id, { estado: 'EJECUTADA', reclamoId: crypto.randomUUID() }), { status: 409 });
});
test('unacknowledged physical commands become unknown and are not replayed', async () => {
    const f = fixture(); await f.service.reclamar('caseta', 'FISICO'); const order = await f.service.crear(user, request());
    await f.service.reclamar('caseta', 'FISICO'); f.tick(21);
    assert.equal(await f.service.reclamar('caseta', 'FISICO'), null); assert.equal(order.estado, 'DESCONOCIDA');
    const body = { estado: 'EJECUTADA', reclamoId: order.reclamoId };
    await f.service.confirmar('caseta', order.id, body); await f.service.confirmar('caseta', order.id, body);
    assert.equal(order.estado, 'EJECUTADA');
});
test('simulation never confirms a physical opening', async () => {
    const f = fixture(); await f.service.reclamar('caseta', 'SIMULACION'); const order = await f.service.crear(user, request());
    await f.service.reclamar('caseta', 'SIMULACION');
    await assert.rejects(f.service.confirmar('caseta', order.id, { estado: 'EJECUTADA', reclamoId: order.reclamoId }), { status: 400 });
    await f.service.confirmar('caseta', order.id, { estado: 'SIMULADA', reclamoId: order.reclamoId }); assert.equal(order.estado, 'SIMULADA');
});
