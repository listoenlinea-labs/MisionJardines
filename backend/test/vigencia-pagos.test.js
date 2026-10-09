const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'unused', JWT_SECRET: 'test-secret' });
const { centavos, vigente, validarFecha } = require('../src/services/vigencia-calculo');
const models = require('../src/models');
const service = require('../src/services/vigencia-mantenimiento.service');
const controller = require('../src/controllers/pagos.controller');
const sequelize = require('../src/config/database');
const tx = { LOCK: { UPDATE: 'UPDATE' }, afterCommit() {} };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} });
const row = values => ({ ...values, toJSON() { return { ...this }; }, async update(changes) { Object.assign(this, changes); return this; } });

test('day 10 is inclusive through midnight in Mexico City, day 11 expires', () => {
    assert.equal(vigente('2026-10-10', new Date('2026-10-11T05:59:59Z')), true);
    assert.equal(vigente('2026-10-10', new Date('2026-10-11T06:00:00Z')), false);
});
test('invalid dates, negative amounts and fractional cents are rejected', () => {
    for (const date of ['2026-10-11', '2026-13-10', '2026-00-10', '2026-10-09']) assert.throws(() => validarFecha(date));
    for (const amount of ['-1', '1.001', 'Infinity', '1e3']) assert.throws(() => centavos(amount));
    assert.equal(centavos('0.01'), 1);
});
function mockReview(t, payment) {
    t.mock.method(models.PagoReportado, 'findByPk', async () => payment);
    t.mock.method(sequelize, 'transaction', async (options, fn) => {
        assert.equal(options.isolationLevel, 'READ COMMITTED');
        const snapshot = { ...payment };
        try { return await fn(tx); } catch (e) { Object.assign(payment, snapshot); throw e; }
    });
    t.mock.method(service, 'estadoCasa', async () => ({ fuente: 'C3' }));
}
test('only a confirmed maintenance deposit updates access; retry does not apply it twice', async t => {
    const payment = row({ id: 1, casaId: 7, monto: '650.00', recargo: '50.00', tipoPago: 'MANTENIMIENTO', estatus: 'PENDIENTE_VALIDACION' });
    mockReview(t, payment); let count = 0;
    t.mock.method(service, 'actualizar', async () => { count++; return { fechaFinal: '2026-10-10' }; });
    const req = { params: { id: 1 }, usuario: { usuarioId: 2 }, body: { estatus: 'VALIDADO' }, headers: { host: 'test' }, protocol: 'https', get() { return 'test'; } };
    for (let i = 0; i < 2; i++) { const res = response(); await controller.revisarPago(req, res); assert.equal(res.code, 200); }
    assert.equal(count, 1); assert.equal(payment.validadoPorUsuarioId, 2);
});
test('rejected proof and extraordinary payment leave maintenance date untouched', async t => {
    const payment = row({ id: 1, casaId: 7, monto: '300.00', recargo: 0, tipoPago: 'MANTENIMIENTO', estatus: 'PENDIENTE_VALIDACION' });
    mockReview(t, payment);
    t.mock.method(service, 'actualizar', async () => assert.fail('must not update access'));
    for (const [type, status] of [['MANTENIMIENTO', 'RECHAZADO'], ['EXTRAORDINARIO', 'VALIDADO']]) {
        Object.assign(payment, { tipoPago: type, estatus: 'PENDIENTE_VALIDACION' });
        const res = response(); await controller.revisarPago({ params: { id: 1 }, usuario: { usuarioId: 2 }, body: { estatus: status }, headers: { host: 'test' }, protocol: 'https', get() { return 'test'; } }, res); assert.equal(res.code, 200);
    }
});
test('date update failure rolls back deposit validation', async t => {
    const payment = row({ id: 1, casaId: 7, monto: '300.00', recargo: 0, tipoPago: 'MANTENIMIENTO', estatus: 'PENDIENTE_VALIDACION' });
    mockReview(t, payment); t.mock.method(service, 'actualizar', async () => { throw Error('storage failed'); });
    const res = response(); await controller.revisarPago({ params: { id: 1 }, usuario: { usuarioId: 2 }, body: { estatus: 'VALIDADO' } }, res);
    assert.equal(res.code, 503); assert.equal(payment.estatus, 'PENDIENTE_VALIDACION');
});
test('residents and security cannot configure cutoffs, review payments or view bank proofs', () => {
    const router = require('../src/routes/pagos.routes');
    for (const path of ['/vigencia/:casaId', '/:id/revision', '/:id/comprobante', '/pendientes']) {
        const route = router.stack.find(layer => layer.route?.path === path).route;
        for (const rol of ['CONDOMINO', 'SEGURIDAD', 'MESA_DIRECTIVA']) {
            const res = response(); let allowed = false;
            route.stack[0].handle({ usuario: { rol } }, res, () => { allowed = true; });
            assert.equal(allowed, false); assert.equal(res.code, 403);
        }
    }
});
