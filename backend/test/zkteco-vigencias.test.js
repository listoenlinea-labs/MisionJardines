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
    test(reassigned ? 'editing a house association never queues an old SQL cutoff' :
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
        assert.deepEqual(queued, []);
    });
}
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
