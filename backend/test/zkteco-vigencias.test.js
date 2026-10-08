const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'unused', ZKTECO_DIRECT_HOST: 'localhost' });
const sequelize = require('../src/config/database');
const Vigencia = require('../src/models/VigenciaMantenimiento');
const Tags = require('../src/models/ZkTarjeta');
const direct = require('../src/services/zkteco-direct.service');
const worker = require('../src/services/zkteco-vigencias.service');
const { C3Client } = require('../src/services/zkteco-c3-client.service');
const now = new Date('2026-10-08T18:00:00Z');
const tx = { LOCK: { UPDATE: 'UPDATE' }, afterCommit() {} };

for (const reassigned of [false, true]) {
    test(reassigned ? 'editing a house association still queues its maintenance cutoff' :
        'manual date edit persists without queueing the old maintenance cutoff', async t => {
        const Casa = require('../src/models/Casa');
        const panel = { Pin: '99158458', CardNo: '5112343', StartTime: '20200101', EndTime: '20260910' };
        const tag = { id: 1, casaId: 5, numeroTarjeta: '5112343', fechaInicio: '2020-01-01',
            fechaFin: '2026-09-10', enControlador: true,
            async update(values) { Object.assign(this, values); },
            async reload() { return this; }, toJSON() { return { ...this }; } };
        const houses = [5, 6].map(id => ({ id, calle: 'Gardenias', numero: String(id), controles: '5112343',
            async update(values) { Object.assign(this, values); } }));
        t.mock.method(Casa, 'findByPk', async id => houses.find(h => h.id === Number(id)));
        t.mock.method(Casa, 'findAll', async options => houses.filter(h => h.numero === options.where.numero));
        t.mock.method(Tags, 'findByPk', async () => tag);
        t.mock.method(Tags, 'findAll', async () => [tag]);
        t.mock.method(Tags, 'findOne', async () => null);
        t.mock.method(C3Client.prototype, 'connect', async () => {});
        t.mock.method(C3Client.prototype, 'disconnect', async () => {});
        t.mock.method(C3Client.prototype, 'getData', async table => table === 'user' ? [{ ...panel }] :
            [{ Pin: panel.Pin, AuthorizeDoorId: '3', AuthorizeTimezoneId: '1' }]);
        t.mock.method(C3Client.prototype, 'putRecord', async (table, values) => {
            assert.equal(table, 'user'); Object.assign(panel, values);
        });
        const oldMode = process.env.ZKTECO_WRITE_MODE;
        process.env.ZKTECO_WRITE_MODE = 'DIRECT';
        t.after(() => { if (oldMode === undefined) delete process.env.ZKTECO_WRITE_MODE;
            else process.env.ZKTECO_WRITE_MODE = oldMode; });
        const queued = [];
        t.mock.method(worker, 'marcarPendiente', async id => queued.push(id));
        const result = await direct.editTag(1, { fechaFin: '2026-11-10',
            ...(reassigned ? { calle: 'Gardenias', numero: '6' } : {}) });
        assert.equal(String(panel.EndTime), '20261110');
        assert.equal(result.fechaFin, '2026-11-10');
        assert.deepEqual(queued, reassigned ? [6] : []);
    });
}
const row = data => ({ ...data, async update(values, options) {
    assert.equal(options.transaction, tx); Object.assign(this, values); return this;
} });

function setup(t, tags, extra = {}) {
    const validity = row({ casaId: 7, fechaFinal: '2026-12-10', sincronizacion: 'PENDIENTE', intentos: 0, ...extra });
    t.mock.method(sequelize, 'transaction', async (options, callback) => callback(tx));
    t.mock.method(Vigencia, 'findByPk', async (id, options) => {
        assert.equal(id, 7); assert.equal(options.lock, 'UPDATE'); return validity;
    });
    t.mock.method(Tags, 'findAll', async options => {
        assert.deepEqual(options.where, { casaId: 7, enControlador: true }); return tags;
    });
    return validity;
}
test('all house TAGs receive the exact cutoff via DIRECT; manual blocking is preserved', async t => {
    const tags = [row({ numeroTarjeta: '123', fechaInicio: '2020-01-01', bloqueado: false }),
        row({ numeroTarjeta: '456', bloqueado: true, fechaFinOriginal: '2026-09-10' })];
    const validity = setup(t, tags); const writes = [];
    t.mock.method(direct, 'writeUserValidity', async (...args) => writes.push(args));
    await worker.sincronizarCasa(7, { now, dryRun: false });
    assert.deepEqual(writes, tags.map(tag => [tag.numeroTarjeta, null, '2026-12-10', { mode: 'DIRECT' }]));
    assert.equal(validity.sincronizacion, 'COMPLETADO');
    assert.equal(tags[1].bloqueado, true);
    assert.equal(tags[1].fechaFinOriginal, '2026-12-10');
    assert.equal(tags[0].fechaInicio, '2020-01-01');
});
test('partial controller failure persists retry; repeating uses absolute dates, not extra months', async t => {
    const tags = [row({ numeroTarjeta: '123' }), row({ numeroTarjeta: '456' })];
    const validity = setup(t, tags); let fail = true; let count = 0;
    t.mock.method(direct, 'writeUserValidity', async card => {
        count++; if (card === '456' && fail) throw Error('connection refused');
    });
    await worker.sincronizarCasa(7, { now, dryRun: false });
    assert.equal(validity.sincronizacion, 'ERROR');
    assert.match(validity.errorSincronizacion, /456.*connection refused/);
    assert.equal(tags[0].fechaFin, '2026-12-10');
    assert.equal(tags[1].fechaFin, undefined);
    await worker.sincronizarCasa(7, { now, dryRun: false });
    assert.equal(count, 2);
    fail = false;
    await worker.sincronizarCasa(7, { now: new Date(now.getTime() + 31000), dryRun: false });
    assert.equal(validity.sincronizacion, 'COMPLETADO');
    assert.equal(tags[1].fechaFin, '2026-12-10');
});
test('missing TAGs and dry run never claim controller confirmation', async t => {
    const tags = []; const validity = setup(t, tags);
    t.mock.method(direct, 'writeUserValidity', async () => assert.fail('must not write'));
    await worker.sincronizarCasa(7, { now, dryRun: false });
    assert.equal(validity.sincronizacion, 'SIN_TAGS');
    tags.push(row({ numeroTarjeta: '123' })); validity.proximoIntento = null;
    await worker.sincronizarCasa(7, { now, dryRun: true });
    assert.equal(validity.sincronizacion, 'SIMULACION');
});
test('newly linked TAG inherits completed house cutoff without another payment', async t => {
    const tags = [row({ numeroTarjeta: '123', fechaFin: '2026-12-10' }), row({ numeroTarjeta: '456', fechaFin: '2099-12-31' })];
    setup(t, tags, { sincronizacion: 'COMPLETADO' }); const writes = [];
    t.mock.method(direct, 'writeUserValidity', async card => writes.push(card));
    await worker.sincronizarCasa(7, { now, dryRun: false });
    assert.deepEqual(writes, ['456']);
});
test('confirmed 1500 payment minus 50 fee advances four 300 months from the old cutoff, then synchronizes', async t => {
    const models = require('../src/models');
    const payments = require('../src/services/vigencia-mantenimiento.service');
    const tag = row({ numeroTarjeta: '123', fechaFin: '2026-08-10' });
    const validity = setup(t, [tag], { fechaBase: '2026-08-10', fechaFinal: '2026-08-10',
        tarifaMensual: '300.00', principalInicial: '0.00' });
    t.mock.method(models.Casa, 'findByPk', async () => ({ id: 7 }));
    t.mock.method(models.Cuota, 'findAll', async () => []);
    t.mock.method(models.PagoReportado, 'findAll', async () => [{ monto: '1500.00', recargo: '50.00', folioOperacion: 'bank1' }]);
    const writes = [];
    t.mock.method(direct, 'writeUserValidity', async (...args) => writes.push(args));
    const result = await payments.actualizar(7, 2, tx);
    assert.equal(result.fechaFinal, '2026-12-10');
    assert.equal(result.saldoParcial, '250.00');
    assert.equal(result.sincronizacion, 'PENDIENTE');
    assert.equal(writes.length, 0, 'payment transaction must not perform TCP writes');
    await worker.sincronizarCasa(7, { now, dryRun: false });
    assert.deepEqual(writes, [['123', null, '2026-12-10', { mode: 'DIRECT' }]]);
    assert.equal(tag.fechaFin, '2026-12-10');
});
test('payment writer changes only EndTime and verifies it even when global mode is PULLSDK', async t => {
    const panel = { Pin: '42', CardNo: '123', Password: 'secret', Group: '2', StartTime: '20200101', EndTime: '20261010' };
    t.mock.method(C3Client.prototype, 'connect', async () => {});
    t.mock.method(C3Client.prototype, 'disconnect', async () => {});
    t.mock.method(C3Client.prototype, 'getData', async table => table === 'user' ? [panel] : []);
    t.mock.method(C3Client.prototype, 'putRecord', async (table, values) => {
        assert.equal(table, 'user');
        assert.deepEqual(values, { ...panel, EndTime: 20261210 });
        Object.assign(panel, values);
    });
    const originalMode = process.env.ZKTECO_WRITE_MODE;
    t.after(() => { if (originalMode === undefined) delete process.env.ZKTECO_WRITE_MODE; else process.env.ZKTECO_WRITE_MODE = originalMode; });
    process.env.ZKTECO_WRITE_MODE = 'PULLSDK';
    const result = await direct.writeUserValidity('123', null, '2026-12-10', { mode: 'DIRECT' });
    assert.equal(result.writeMode, 'DIRECT');
    assert.equal(panel.Password, 'secret'); assert.equal(panel.StartTime, '20200101'); assert.equal(panel.Group, '2');
});
test('an unconfirmed TCP write fails rather than falling back to the bridge', async t => {
    const panel = { Pin: '42', CardNo: '123', EndTime: '20261010' };
    t.mock.method(C3Client.prototype, 'connect', async () => {});
    t.mock.method(C3Client.prototype, 'disconnect', async () => {});
    t.mock.method(C3Client.prototype, 'getData', async table => table === 'user' ? [panel] : []);
    t.mock.method(C3Client.prototype, 'putRecord', async () => {});
    const originalMode = process.env.ZKTECO_WRITE_MODE;
    t.after(() => { if (originalMode === undefined) delete process.env.ZKTECO_WRITE_MODE; else process.env.ZKTECO_WRITE_MODE = originalMode; });
    process.env.ZKTECO_WRITE_MODE = 'AUTO';
    await assert.rejects(direct.writeUserValidity('123', null, '2026-12-10', { mode: 'DIRECT' }), /no confirmó/);
});

test('recovery queries only pending and failed houses, never completed inventory', async t => {
    let queries = 0;
    t.mock.method(Vigencia, 'findAll', async options => {
        queries++;
        const { Op } = require('sequelize');
        assert.deepEqual(options.where.sincronizacion[Op.in], ['PENDIENTE', 'ERROR']);
        assert.equal(options.limit, 10);
        return [];
    });
    t.mock.method(Tags, 'findAll', async () => assert.fail('no full inventory scan'));
    await worker.run();
    assert.equal(queries, 1);
});

test('payment queues delivery only after commit, not before or on rollback', async t => {
    const models = require('../src/models');
    const payments = require('../src/services/vigencia-mantenimiento.service');
    const validity = setup(t, [] , { fechaBase: '2026-08-10', tarifaMensual: '300.00', principalInicial: '0.00' });
    t.mock.method(models.Casa, 'findByPk', async () => ({ id: 7 }));
    t.mock.method(models.Cuota, 'findAll', async () => []);
    t.mock.method(models.PagoReportado, 'findAll', async () => []);
    let committed; const queued = [];
    t.mock.method(tx, 'afterCommit', callback => { committed = callback; });
    t.mock.method(worker, 'solicitar', id => queued.push(id));
    await payments.actualizar(7, 2, tx);
    assert.deepEqual(queued, []);
    assert.equal(validity.sincronizacion, 'PENDIENTE');
    committed();
    assert.deepEqual(queued, [7]);
});

test('association event resets failed or completed delivery before enqueueing', async t => {
    const queued = [];
    t.mock.method(Vigencia, 'update', async (values, options) => {
        assert.equal(values.sincronizacion, 'PENDIENTE');
        assert.equal(values.proximoIntento, null);
        assert.deepEqual(options.where, { casaId: 7 });
        queued.push('persisted');
    });
    // Real queue runs asynchronously; stub the transaction to verify it follows persistence.
    t.mock.method(sequelize, 'transaction', async () => { queued.push('delivered'); });
    await worker.marcarPendiente(7);
    assert.deepEqual(queued, ['persisted']);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(queued, ['persisted', 'delivered']);
});

test('replacement-style C3 writes retain CardNo, password, name, group, UID and manual door permissions', async t => {
    let user = { UID: 42, Pin: '42', CardNo: '5112343', Password: 'secret', Name: 'Gardenias 5', Group: 2,
        StartTime: 20200101, EndTime: 20261010 };
    const auth = [{ Pin: '42', AuthorizeDoorId: 3, AuthorizeTimezoneId: 2 }];
    t.mock.method(C3Client.prototype, 'connect', async () => {});
    t.mock.method(C3Client.prototype, 'disconnect', async () => {});
    t.mock.method(C3Client.prototype, 'getData', async table => table === 'user' ? [user] : auth);
    t.mock.method(C3Client.prototype, 'putRecord', async (table, values) => {
        assert.equal(table, 'user', 'never write userauthorize');
        assert.equal(values.UID, undefined, 'internal UID is not sent');
        // Firmware replaces the writable row, resetting any omitted field.
        user = { UID: user.UID, ...values };
    });
    await direct.writeUserValidity('05112343', null, '2026-09-10', { mode: 'DIRECT' });
    assert.deepEqual(user, { UID: 42, Pin: '42', CardNo: '5112343', Password: 'secret', Name: 'Gardenias 5',
        Group: 2, StartTime: 20200101, EndTime: 20260910 });
    assert.deepEqual(auth, [{ Pin: '42', AuthorizeDoorId: 3, AuthorizeTimezoneId: 2 }]);
});

test('manual blocked authorization stays absent and controller field spelling is preserved', async t => {
    let user = { PIN: 42, CARD_NO: 5112343, START_TIME: 20200101, END_TIME: 20261010, PASSWORD: '' };
    t.mock.method(C3Client.prototype, 'connect', async () => {});
    t.mock.method(C3Client.prototype, 'disconnect', async () => {});
    t.mock.method(C3Client.prototype, 'getData', async table => table === 'user' ? [user] : []);
    t.mock.method(C3Client.prototype, 'putRecord', async (table, values) => {
        assert.equal(table, 'user'); assert.equal(values.EndTime, undefined);
        user = { ...values };
    });
    await direct.writeUserValidity('05112343', null, '2026-09-10', { mode: 'DIRECT' });
    assert.equal(user.END_TIME, 20260910);
    assert.equal(user.START_TIME, 20200101);
});

test('a successful date write is rejected if CardNo disappears afterward', async t => {
    let user = { Pin: '42', CardNo: '5112343', StartTime: 20200101, EndTime: 20261010 };
    t.mock.method(C3Client.prototype, 'connect', async () => {});
    t.mock.method(C3Client.prototype, 'disconnect', async () => {});
    t.mock.method(C3Client.prototype, 'getData', async table => table === 'user' ? [user] : []);
    t.mock.method(C3Client.prototype, 'putRecord', async (_, values) => { user = { ...values, CardNo: 0 }; });
    await assert.rejects(direct.writeUserValidity('05112343', null, '2026-09-10', { mode: 'DIRECT' }), /ausente tras actualizar/);
});

test('authorization drift is an error even when the requested date was written', async t => {
    let user = { Pin: '42', CardNo: '5112343', StartTime: 20200101, EndTime: 20261010 };
    let auth = [{ Pin: '42', AuthorizeDoorId: 3 }];
    t.mock.method(C3Client.prototype, 'connect', async () => {});
    t.mock.method(C3Client.prototype, 'disconnect', async () => {});
    t.mock.method(C3Client.prototype, 'getData', async table => table === 'user' ? [user] : auth);
    t.mock.method(C3Client.prototype, 'putRecord', async (_, values) => { user = { ...values }; auth = []; });
    await assert.rejects(direct.writeUserValidity('5112343', null, '2026-09-10', { mode: 'DIRECT' }), /cambiaron las autorizaciones/);
});

test('an omitted EndTime cancels the write instead of synthesizing an incomplete user row', async t => {
    t.mock.method(C3Client.prototype, 'connect', async () => {});
    t.mock.method(C3Client.prototype, 'disconnect', async () => {});
    t.mock.method(C3Client.prototype, 'getData', async table => table === 'user' ? [{ Pin: '42', CardNo: '5112343' }] : []);
    t.mock.method(C3Client.prototype, 'putRecord', async () => assert.fail('must not write'));
    await assert.rejects(direct.writeUserValidity('5112343', null, '2026-09-10', { mode: 'DIRECT' }), /cancela la escritura/);
});
