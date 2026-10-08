const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'unused' });
// Capture deterministic receipt/folio providers before the controller imports them.
require('../src/services/folios.service').generarSiguienteFolio = async () => 'MJ-2026-TEST';
require('../src/services/pago-reportado-pdf.service').generarReciboPagoReportado = async () => ({ buffer: Buffer.from('pdf'), fileName: 'test.pdf', mimeType: 'application/pdf' });
const controller = require('../src/controllers/pagos.controller');
const models = require('../src/models');
const sequelize = require('../src/config/database');
const vigencias = require('../src/services/vigencia-mantenimiento.service');
const config = require('../src/config/pagos-pruebas');

function setup(t, { enabled = true, type = 'MANTENIMIENTO', date = '2026-10-08', amount = '300.00' } = {}) {
    const old = config.VALIDAR_PAGOS_SIN_ADMIN;
    config.VALIDAR_PAGOS_SIN_ADMIN = enabled;
    t.after(() => { config.VALIDAR_PAGOS_SIN_ADMIN = old; });
    const events = [];
    const tx = { async commit() { events.push('commit'); this.finished = 'commit'; },
        async rollback() { events.push('rollback'); this.finished = 'rollback'; } };
    let payment;
    t.mock.method(sequelize, 'transaction', async () => tx);
    t.mock.method(models.PagoReportado, 'findOne', async () => null);
    t.mock.method(models.Casa, 'findByPk', async () => ({ id: 5, calle: 'Gardenias', numero: '5' }));
    t.mock.method(models.Usuario, 'findByPk', async () => ({ id: 9, nombre: 'Prueba' }));
    t.mock.method(models.CuotaExtraordinaria, 'findOne', async () => ({ id: 1, monto: 300, concepto: 'Prueba' }));
    t.mock.method(models.PagoReportado, 'create', async (values, options) => {
        assert.equal(options.transaction, tx);
        events.push('create');
        payment = { id: 1, ...values, async update(changes) { Object.assign(this, changes); } };
        return payment;
    });
    t.mock.method(models.PagoReportado, 'findByPk', async () => payment);
    t.mock.method(vigencias, 'actualizar', async (id, userId, transaction) => {
        assert.equal(id, 5); assert.equal(userId, 9); assert.equal(transaction, tx);
        assert.equal(payment.estatus, 'VALIDADO');
        events.push('vigencia');
        return { fechaFinal: '2026-10-10', sincronizacion: 'PENDIENTE' };
    });
    const req = { usuario: { casaId: 5, usuarioId: 9 }, headers: {}, protocol: 'https', get: () => 'test.local',
        body: { tipoPago: type, cuotaExtraordinariaId: 1, folioOperacion: 'TEST-1', fechaOperacion: date,
            horaOperacion: '12:00', monto: amount, comprobanteData: 'data:image/png;base64,YQ==' } };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    return { req, res, events, get payment() { return payment; } };
}

test('new maintenance upload is validated and recalculated before commit without an administrator', async t => {
    const ctx = setup(t);
    await controller.reportarPago(ctx.req, ctx.res);
    assert.equal(ctx.res.code, 201);
    assert.equal(ctx.res.body.data.estatus, 'VALIDADO');
    assert.equal(ctx.payment.validadoPorUsuarioId, null);
    assert.ok(ctx.payment.fechaValidacion instanceof Date);
    assert.match(ctx.payment.observacionesRevision, /pruebas/);
    assert.deepEqual(ctx.events, ['create', 'vigencia', 'commit']);
    assert.equal(ctx.res.body.vigencia.fechaFinal, '2026-10-10');
});
test('disabling the temporary flag restores administrative review and makes no access change', async t => {
    const ctx = setup(t, { enabled: false });
    await controller.reportarPago(ctx.req, ctx.res);
    assert.equal(ctx.res.code, 201);
    assert.equal(ctx.payment.estatus, 'PENDIENTE_VALIDACION');
    assert.equal(ctx.payment.fechaValidacion, undefined);
    assert.deepEqual(ctx.events, ['create', 'commit']);
});
test('extraordinary uploads are validated but never change maintenance access', async t => {
    const ctx = setup(t, { type: 'EXTRAORDINARIO' });
    await controller.reportarPago(ctx.req, ctx.res);
    assert.equal(ctx.res.body.data.estatus, 'VALIDADO');
    assert.equal(ctx.res.body.vigencia, null);
    assert.deepEqual(ctx.events, ['create', 'commit']);
});
test('automatic validation retains duplicate protection and never adds another month for the same folio', async t => {
    const ctx = setup(t);
    models.PagoReportado.findOne = async () => ({ id: 1 });
    await controller.reportarPago(ctx.req, ctx.res);
    assert.equal(ctx.res.code, 409);
    assert.deepEqual(ctx.events, []);
});
test('automatic validation retains the late fee in the paid record', async t => {
    const ctx = setup(t, { date: '2026-10-12', amount: '350.00' });
    await controller.reportarPago(ctx.req, ctx.res);
    assert.equal(ctx.payment.recargo, 50);
    assert.equal(ctx.payment.monto, 350);
});
test('failed access recalculation rolls back the automatically validated payment', async t => {
    const ctx = setup(t);
    t.mock.method(vigencias, 'actualizar', async () => { throw Error('database failure'); });
    t.mock.method(console, 'error', () => {});
    await controller.reportarPago(ctx.req, ctx.res);
    assert.equal(ctx.res.code, 500);
    assert.deepEqual(ctx.events, ['create', 'rollback']);
});
