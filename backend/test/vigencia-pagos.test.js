const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'unused', JWT_SECRET: 'test-secret' });
const { calcular, centavos, vigente, validarFecha } = require('../src/services/vigencia-calculo');
const models = require('../src/models');
const service = require('../src/services/vigencia-mantenimiento.service');
const controller = require('../src/controllers/pagos.controller');
const sequelize = require('../src/config/database');
const tx = { LOCK: { UPDATE: 'UPDATE' }, afterCommit() {} };
const args = { fechaBase: '2026-08-10', tarifaMensual: '300.00', principalInicial: '900.00' };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} });
const row = values => ({ ...values, toJSON() { return { ...this }; }, async update(changes) { Object.assign(this, changes); return this; } });

test('two overdue months advance from the old cutoff, never from payment day', () => {
    assert.equal(calcular({ ...args, principalConfirmado: '1500.00' }).fechaFinal, '2026-10-10');
    assert.equal(vigente('2026-10-10', new Date('2026-11-05T18:00:00Z')), false);
});
test('annual prepayment crosses the year and grants twelve monthly cutoffs', () => {
    assert.equal(calcular({ ...args, principalConfirmado: '4500.00' }).fechaFinal, '2027-08-10');
});
test('partial payments accumulate in cents until a full monthly fee is covered', () => {
    assert.deepEqual(calcular({ ...args, principalConfirmado: '1099.99' }), { fechaFinal: '2026-08-10', meses: 0, saldoParcial: '199.99' });
    assert.deepEqual(calcular({ ...args, principalConfirmado: '1200.00' }), { fechaFinal: '2026-09-10', meses: 1, saldoParcial: '0.00' });
});
test('day 10 is inclusive through midnight in Mexico City, day 11 expires', () => {
    assert.equal(vigente('2026-10-10', new Date('2026-10-11T05:59:59Z')), true);
    assert.equal(vigente('2026-10-10', new Date('2026-10-11T06:00:00Z')), false);
});
test('baseline does not grant a grace period or replay existing paid months', () => {
    assert.equal(calcular({ ...args, principalConfirmado: args.principalInicial }).fechaFinal, args.fechaBase);
});
test('invalid dates, negative amounts and fractional cents are rejected', () => {
    for (const date of ['2026-10-11', '2026-13-10', '2026-00-10', '2026-10-09']) assert.throws(() => validarFecha(date));
    for (const amount of ['-1', '1.001', 'Infinity', '1e3']) assert.throws(() => centavos(amount));
    assert.equal(centavos('0.01'), 1);
});
test('admin corrections recompute rather than permanently retaining removed payments', () => {
    assert.equal(calcular({ ...args, principalConfirmado: '1200.00' }).fechaFinal, '2026-09-10');
    assert.equal(calcular({ ...args, principalConfirmado: '900.00' }).fechaFinal, '2026-08-10');
});
function mockPrincipal(t, cuotas = [], pagos = []) {
    t.mock.method(models.Cuota, 'findAll', async options => {
        assert.deepEqual(Object.values(options.where.estatusPago)[0] || Object.getOwnPropertySymbols(options.where.estatusPago).map(k => options.where.estatusPago[k])[0], ['PAGADO', 'PAGO_PARCIAL']);
        assert.equal(options.where.casaId, 7); return cuotas;
    });
    t.mock.method(models.PagoReportado, 'findAll', async options => {
        assert.equal(options.where.casaId, 7); assert.equal(options.where.estatus, 'VALIDADO'); assert.equal(options.where.tipoPago, 'MANTENIMIENTO'); return pagos;
    });
}
test('fees and extraordinary collections do not buy maintenance access', async t => {
    mockPrincipal(t, [{ montoPagado: '350.00', recargo: '50.00' }, { montoPagado: '900.00', tipoPago: 'EXTRAORDINARIO' }], [{ monto: '650.00', recargo: '50.00', folioOperacion: 'bank1' }]);
    assert.equal(await service.principalConfirmado(7, tx), '900.00');
});
test('a bank movement in both modules is counted once', async t => {
    mockPrincipal(t, [{ montoPagado: '600.00', recargo: 0, referencia: ' bank1 ' }], [{ monto: '600.00', recargo: 0, folioOperacion: 'bank1' }]);
    assert.equal(await service.principalConfirmado(7, tx), '600.00');
});
test('initial setup snapshots historical payments and cannot overwrite the cutoff', async t => {
    mockPrincipal(t, [{ montoPagado: '900.00', recargo: 0 }]);
    t.mock.method(models.Casa, 'findByPk', async () => ({ id: 7 }));
    t.mock.method(service.Vigencia, 'findByPk', async () => null);
    t.mock.method(service.Vigencia, 'create', async values => row(values));
    const created = await service.inicializar(7, '2026-08-10', 300, 2, tx);
    assert.equal(created.principalInicial, '900.00'); assert.equal(created.fechaFinal, '2026-08-10');
    service.Vigencia.findByPk = async () => created;
    await assert.rejects(service.inicializar(7, '2026-09-10', 300, 2, tx), e => e.status === 409);
});
test('recalculation is idempotent and stores desired date without claiming hardware synchronization', async t => {
    mockPrincipal(t, [], [{ monto: '600.00', recargo: 0, folioOperacion: 'bank2' }]);
    const validity = row({ casaId: 7, fechaBase: '2026-08-10', tarifaMensual: 300, principalInicial: 0 });
    t.mock.method(models.Casa, 'findByPk', async (id, options) => { assert.equal(id, 7); assert.equal(options.lock, 'UPDATE'); return { id }; });
    t.mock.method(service.Vigencia, 'findByPk', async () => validity);
    for (let i = 0; i < 2; i++) {
        const result = await service.actualizar(7, 2, tx);
        assert.equal(result.fechaFinal, '2026-10-10'); assert.equal(result.sincronizacion, 'PENDIENTE');
    }
});
test('first confirmed 300 from October starts in October and expires November 10', async t => {
    t.mock.method(models.Casa, 'findByPk', async () => ({ id: 7 }));
    t.mock.method(service.Vigencia, 'findByPk', async () => null);
    t.mock.method(models.Cuota, 'findAll', async () => []);
    t.mock.method(models.PagoReportado, 'findAll', async () =>
      [{ monto:'300.00', recargo:'0.00', folioOperacion:'oct1', fechaOperacion:'2026-10-08' }]);
    let stored;
    t.mock.method(service.Vigencia, 'create', async values => {
      stored = row(values); return stored;
    });
    const result=await service.actualizar(7,2,tx);
    assert.equal(result.pendienteConfiguracion,false);
    assert.equal(result.fechaFinal,'2026-11-10');
    assert.equal(stored.fechaBase,'2026-10-10');
    assert.equal(stored.principalInicial,'0.00');
    assert.equal(stored.sincronizacion,'PENDIENTE');
});
test('a transfer in November covers October first, without resetting the cutoff', async t => {
    t.mock.method(models.Casa,'findByPk',async()=>({id:7}));
    t.mock.method(service.Vigencia,'findByPk',async()=>null);
    t.mock.method(models.Cuota,'findAll',async()=>[]);
    t.mock.method(models.PagoReportado,'findAll',async()=>[
        {monto:'300.00',recargo:0,folioOperacion:'nov1',fechaOperacion:'2026-11-08'}
    ]);
    t.mock.method(service.Vigencia,'create',async data=>row(data));
    assert.equal((await service.actualizar(7,2,tx)).fechaFinal,'2026-11-10');
});
function mockReview(t, payment) {
    t.mock.method(models.PagoReportado, 'findByPk', async () => payment);
    t.mock.method(sequelize, 'transaction', async (options, fn) => {
        assert.equal(options.isolationLevel, 'READ COMMITTED');
        const snapshot = { ...payment };
        try { return await fn(tx); } catch (e) { Object.assign(payment, snapshot); throw e; }
    });
    t.mock.method(service.Vigencia, 'findByPk', async () => null);
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
