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
const tx = { LOCK: { UPDATE: 'UPDATE' } };
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
test('confirmed 1500 payment minus 50 fee advances two 500 months from the old cutoff, then synchronizes', async t => {
    const models = require('../src/models');
    const payments = require('../src/services/vigencia-mantenimiento.service');
    const tag = row({ numeroTarjeta: '123', fechaFin: '2026-08-10' });
    const validity = setup(t, [tag], { fechaBase: '2026-08-10', fechaFinal: '2026-08-10',
        tarifaMensual: '500.00', principalInicial: '0.00' });
    t.mock.method(models.Casa, 'findByPk', async () => ({ id: 7 }));
    t.mock.method(models.Cuota, 'findAll', async () => []);
    t.mock.method(models.PagoReportado, 'findAll', async () => [{ monto: '1500.00', recargo: '50.00', folioOperacion: 'bank1' }]);
    const writes = [];
    t.mock.method(direct, 'writeUserValidity', async (...args) => writes.push(args));
    const result = await payments.actualizar(7, 2, tx);
    assert.equal(result.fechaFinal, '2026-10-10');
    assert.equal(result.saldoParcial, '450.00');
    assert.equal(result.sincronizacion, 'PENDIENTE');
    assert.equal(writes.length, 0, 'payment transaction must not perform TCP writes');
    await worker.sincronizarCasa(7, { now, dryRun: false });
    assert.deepEqual(writes, [['123', null, '2026-10-10', { mode: 'DIRECT' }]]);
    assert.equal(tag.fechaFin, '2026-10-10');
});
test('payment writer changes only EndTime and verifies it even when global mode is PULLSDK', async t => {
    const panel = { Pin: '42', CardNo: '123', Password: 'secret', Group: '2', StartTime: '20200101', EndTime: '20261010' };
    t.mock.method(C3Client.prototype, 'connect', async () => {});
    t.mock.method(C3Client.prototype, 'disconnect', async () => {});
    t.mock.method(C3Client.prototype, 'getData', async table => { assert.equal(table, 'user'); return [panel]; });
    t.mock.method(C3Client.prototype, 'putRecord', async (table, values) => {
        assert.equal(table, 'user');
        assert.deepEqual(values, { Pin: '42', EndTime: 20261210 });
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
    t.mock.method(C3Client.prototype, 'getData', async () => [panel]);
    t.mock.method(C3Client.prototype, 'putRecord', async () => {});
    const originalMode = process.env.ZKTECO_WRITE_MODE;
    t.after(() => { if (originalMode === undefined) delete process.env.ZKTECO_WRITE_MODE; else process.env.ZKTECO_WRITE_MODE = originalMode; });
    process.env.ZKTECO_WRITE_MODE = 'AUTO';
    await assert.rejects(direct.writeUserValidity('123', null, '2026-12-10', { mode: 'DIRECT' }), /no confirmó/);
});
