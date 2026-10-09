const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'unused', JWT_SECRET: 'resident-test' });
const db = require('../src/config/database');
const models = require('../src/models');
const service = require('../src/services/residentes.service');
const actor = { usuarioId: 99, rol: 'ADMINISTRADOR' };
const input = { modo: 'ALTA', nombreCompleto: 'Nueva Persona', telefono: '3312345678', correo: 'nueva@example.com',
    enRenta: true, actualizarContacto: true, observaciones: 'Contacto actualizado' };
function setup(t) {
    const tx = { LOCK: { UPDATE: 'UPDATE' } };
    const updates = [], history = [], invites = [];
    const record = values => ({ ...values, async update(data, options) {
        assert.equal(options.transaction, tx); updates.push({ record: this, data }); Object.assign(this, data); return this;
    } });
    const casa = record({ id: 5, nombre: 'Anterior', calle: 'Gardenias', numero: '5', controles: '5112343', pago: 'MENSUAL' });
    const anterior = record({ id: 7, direccionId: 5, activo: true, nombreCompleto: 'Anterior Persona', correo: 'old@example.com' });
    const link = record({ usuarioId: 8, casaId: 5, activo: true, tipo: 'RESPONSABLE' });
    const user = record({ id: 8, casaId: 5, rol: { nombre: 'CONDOMINO' }, estatus: 'ACTIVO' });
    let created;
    t.mock.method(db, 'transaction', async (options, callback) => callback(tx));
    t.mock.method(models.Casa, 'findByPk', async (id, options) => { assert.equal(options.transaction, tx); return Number(id) === 5 ? casa : null; });
    t.mock.method(models.Condomino, 'findOne', async options => options.where.id === 7 ? anterior : null);
    t.mock.method(models.Condomino, 'create', async (values, options) => { assert.equal(options.transaction, tx); created = record({ id: 10, ...values }); return created; });
    t.mock.method(models.UsuarioCasa, 'findOne', async options => options.where.casaId === 5 ? link : { casaId: 20 });
    t.mock.method(models.Usuario, 'findByPk', async () => user);
    t.mock.method(models.HistorialVinculo, 'create', async (values, options) => { assert.equal(options.transaction, tx); history.push(values); });
    t.mock.method(models.InvitacionCasa, 'update', async (values, options) => invites.push(options.where));
    for (const model of [models.Cuota, models.PagoReportado, models.ZkTarjeta, require('../src/models/VigenciaMantenimiento')]) {
        t.mock.method(model, 'update', async () => assert.fail('no financial/controller data changes'));
        t.mock.method(model, 'destroy', async () => assert.fail('no historical data deletion'));
    }
    return { casa, anterior, link, user, updates, history, invites, get created() { return created; } };
}
test('administrative registration creates a registry resident and updates house contact without creating a login', async t => {
    const data = setup(t);
    t.mock.method(models.Usuario, 'create', async () => assert.fail('registry entry is not a login account'));
    const result = await service.guardar(actor, 5, input);
    assert.equal(result.residente.direccionId, 5);
    assert.equal(data.casa.nombre, input.nombreCompleto);
    assert.equal(data.casa.controles, '5112343');
    assert.equal(data.anterior.activo, true);
    assert.equal(data.history.length, 0);
});
test('editing preserves resident identity and does not remove household accounts', async t => {
    const data = setup(t);
    await service.guardar(actor, 5, { ...input, modo: 'EDITAR', residenteId: 7, actualizarContacto: false });
    assert.equal(data.anterior.id, 7);
    assert.equal(data.anterior.nombreCompleto, input.nombreCompleto);
    assert.equal(data.casa.nombre, 'Anterior');
    assert.equal(data.created, undefined);
    assert.equal(data.link.activo, true);
});
test('tenant replacement retains old registry and payments, removes only selected house membership and pending invitations', async t => {
    const data = setup(t);
    await service.guardar(actor, 5, { ...input, modo: 'CAMBIO', residenteId: 7, confirmarCambio: true, desvincularUsuarioIds: [8] });
    assert.equal(data.anterior.activo, false);
    assert.equal(data.anterior.nombreCompleto, 'Anterior Persona');
    assert.equal(data.created.activo, true);
    assert.equal(data.link.activo, false);
    assert.equal(data.user.casaId, 20);
    assert.equal(data.user.estatus, 'ACTIVO');
    assert.deepEqual(data.history[0], { usuarioId: 8, casaId: 5, actorId: 99, tipo: 'RESPONSABLE', accion: 'DESVINCULAR' });
    assert.ok(data.invites.every(where => where.casaId === 5 && where.aceptadoEn === null && where.revocadoEn === null));
});
test('other household accounts are retained unless explicitly selected', async t => {
    const data = setup(t);
    await service.guardar(actor, 5, { ...input, modo: 'CAMBIO', residenteId: 7, confirmarCambio: true });
    assert.equal(data.link.activo, true);
    assert.equal(data.user.casaId, 5);
});
test('replacement cannot remove an administrator or a member of another house', async t => {
    const data = setup(t); data.user.rol.nombre = 'ADMINISTRADOR';
    await assert.rejects(service.guardar(actor, 5, { ...input, modo: 'CAMBIO', residenteId: 7, confirmarCambio: true, desvincularUsuarioIds: [8] }), { status: 409 });
    assert.equal(data.updates.length, 0);
    t.mock.method(models.UsuarioCasa, 'findOne', async () => null);
    await assert.rejects(service.guardar(actor, 5, { ...input, modo: 'CAMBIO', residenteId: 7, confirmarCambio: true, desvincularUsuarioIds: [8] }), { status: 409 });
});
test('missing/stale outgoing resident and duplicate registration are rejected', async t => {
    setup(t);
    await assert.rejects(service.guardar(actor, 5, { ...input, modo: 'CAMBIO', residenteId: 100, confirmarCambio: true }), { status: 409 });
    t.mock.method(models.Condomino, 'findOne', async () => ({ id: 10 }));
    await assert.rejects(service.guardar(actor, 5, input), { status: 409 });
});
test('invalid fields and missing confirmation are rejected before database writes', async t => {
    t.mock.method(db, 'transaction', async () => assert.fail('validation precedes writes'));
    for (const extra of [{ nombreCompleto: '' }, { correo: 'bad' }, { telefono: '1'.repeat(26) },
        { enRenta: 'true' }, { modo: 'CAMBIO', residenteId: 7 }, { desvincularUsuarioIds: [8] }, { observaciones: 'x'.repeat(3001) }]) {
        await assert.rejects(service.guardar(actor, 5, { ...input, ...extra }), { status: 400 });
    }
});
test('security, residents and mesa directiva cannot mutate or obtain account details', async () => {
    for (const rol of ['SEGURIDAD', 'CONDOMINO', 'MESA_DIRECTIVA']) {
        await assert.rejects(service.guardar({ ...actor, rol }, 5, input), { status: 403 });
        await assert.rejects(service.detalle({ ...actor, rol }, 5), { status: 403 });
    }
});
test('routes require authenticated administration for both detail and save', async t => {
    const express = require('express'), jwt = require('jsonwebtoken');
    const router = require('../src/routes/casas.routes');
    let role = 'SEGURIDAD', mutations = 0;
    t.mock.method(models.Usuario, 'findByPk', async () => ({ id: 99, estatus: 'ACTIVO', rol: { nombre: role, activo: true } }));
    t.mock.method(models.UsuarioCasa, 'findOne', async () => ({ casaId: 5 }));
    t.mock.method(db, 'transaction', async () => { mutations++; throw new Error('must not reach'); });
    const app = express(); app.use(express.json()); app.use('/api/casas', router);
    const server = app.listen(0); t.after(() => new Promise(resolve => server.close(resolve)));
    const url = `http://localhost:${server.address().port}/api/casas/5/residentes`;
    assert.equal((await fetch(url)).status, 401);
    for (role of ['SEGURIDAD', 'CONDOMINO', 'MESA_DIRECTIVA']) {
        const headers = { Authorization: 'Bearer ' + jwt.sign({ usuarioId: 99 }, process.env.JWT_SECRET), 'Content-Type': 'application/json' };
        assert.equal((await fetch(url, { headers })).status, 403);
        assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify(input) })).status, 403);
    }
    assert.equal(mutations, 0);
});
