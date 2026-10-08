const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
Object.assign(process.env, { DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'unused', JWT_SECRET: 'test-secret' });
const db = require('../src/config/database');
const models = require('../src/models');
const auth = require('../src/controllers/auth.controller');
const cuentas = require('../src/controllers/cuentas.controller');
const email = require('../src/services/email.service');
const tx = { LOCK: { UPDATE: 'UPDATE' }, async commit() { this.finished = true; }, async rollback() { this.finished = true; } };
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} });
const row = data => ({ ...data, async update(values) { Object.assign(this, values); return this; } });

async function signup(t, body = {}) {
    let verification, sent;
    t.mock.method(models.Usuario, 'findOne', async () => null);
    t.mock.method(models.VerificacionCuenta, 'findOne', async () => null);
    t.mock.method(models.VerificacionCuenta, 'destroy', async () => {});
    t.mock.method(models.VerificacionCuenta, 'create', async values => { verification = row(values); return verification; });
    t.mock.method(email, 'enviarCodigoVerificacion', async values => { sent = values; });
    const res = response();
    await auth.solicitarRegistro({ body: { nombre: 'Ana', apellidoPaterno: 'Prueba', correo: 'ana@example.com', contrasena: 'Prueba1234', calle: 'Calle Prueba', numeroCasa: '1', ...body } }, res);
    return { res, verification, sent };
}
test('public resident verifies email, receives pending account and no membership or elevated role', async t => {
    const { res, verification, sent } = await signup(t, { rolId: 1, rol: 'SUPER_ADMIN', casaId: 999 });
    assert.equal(res.code, 202); assert.equal(verification.casaId, null);
    const data = JSON.parse(verification.datosJson);
    assert.equal(data.calle, 'Calle Prueba'); assert.equal(data.contrasena, undefined);
    assert.equal(await bcrypt.compare('Prueba1234', data.contrasenaHash), true);
    let userData, requested;
    t.mock.method(db, 'transaction', async () => ({ ...tx }));
    models.VerificacionCuenta.findOne = async () => verification;
    t.mock.method(models.Rol, 'findOne', async options => { assert.equal(options.where.nombre, 'CONDOMINO'); return { id: 3 }; });
    t.mock.method(models.Usuario, 'create', async values => { userData = values; return { id: 21 }; });
    t.mock.method(models.SolicitudCuenta, 'create', async values => { requested = values; });
    t.mock.method(models.UsuarioCasa, 'findOrCreate', async () => assert.fail('must not grant housing access'));
    const verified = response();
    await auth.verificarRegistro({ body: { correo: res.body.correo, codigo: sent.codigo } }, verified);
    assert.equal(verified.code, 201); assert.equal(verified.body.pendienteAprobacion, true);
    assert.equal(userData.estatus, 'PENDIENTE'); assert.equal(userData.rolId, 3); assert.equal(userData.casaId, null);
    assert.equal(requested.tipoCuenta, 'CONDOMINO'); assert.equal(verification.datosJson, null);
});
test('security signup needs no address and only requests security without assigning it', async t => {
    const { res, verification } = await signup(t, { tipoCuenta: 'SEGURIDAD', calle: '', numeroCasa: '' });
    assert.equal(res.code, 202);
    assert.equal(verification.casaId, null);
    const data = JSON.parse(verification.datosJson);
    assert.equal(data.tipoCuenta, 'SEGURIDAD'); assert.equal(data.calle, null); assert.equal(data.numeroCasa, null);
});
test('database connection failure during email verification returns a controlled error and creates no account', async t => {
    t.mock.method(db, 'transaction', async () => { throw Error('database unavailable'); });
    t.mock.method(models.Usuario, 'create', async () => assert.fail('must not create account'));
    const res = response();
    await auth.verificarRegistro({ body: { correo: 'ana@example.com', codigo: '123456' } }, res);
    assert.equal(res.code, 500); assert.equal(res.body.ok, false);
});
test('registration rejects elevated account types and incomplete residential addresses', async t => {
    for (const body of [{ tipoCuenta: 'ADMINISTRADOR' }, { tipoCuenta: 'SUPER_ADMIN' }, { calle: '' }, { numeroCasa: '' }]) {
        const { res } = await signup(t, body); assert.equal(res.code, 400);
    }
});
function setupReview(t, overrides = {}) {
    const solicitud = row({ id: 8, usuarioId: 21, tipoCuenta: 'SEGURIDAD', estatus: 'PENDIENTE', ...overrides.solicitud });
    const user = row({ id: 21, estatus: 'PENDIENTE', casaId: null, rolId: 3 });
    const reviewer = row({ id: 9, estatus: 'ACTIVO', rol: { nombre: 'ADMINISTRADOR', activo: true }, ...overrides.reviewer });
    t.mock.method(db, 'transaction', async (options, fn) => {
        const previous = { ...user }, before = { ...solicitud };
        try { return await fn(tx); } catch (error) { Object.assign(user, previous); Object.assign(solicitud, before); throw error; }
    });
    t.mock.method(models.Usuario, 'findByPk', async (id, options) => {
        assert.equal(options.lock, 'UPDATE'); return String(id) === '9' ? reviewer : user;
    });
    t.mock.method(models.SolicitudCuenta, 'findByPk', async () => solicitud);
    t.mock.method(models.Rol, 'findOne', async () => ({ id: 4 }));
    t.mock.method(models.Casa, 'findByPk', async id => id === '7' ? { id: 7 } : null);
    t.mock.method(models.UsuarioCasa, 'findOrCreate', async () => [{ tipo: 'MIEMBRO' }, true]);
    t.mock.method(models.HistorialVinculo, 'create', async () => ({}));
    return { solicitud, user, reviewer };
}
const request = body => ({ usuario: { usuarioId: 9 }, params: { id: 8 }, body: { accion: 'APROBAR', rol: 'SEGURIDAD', identidadVerificada: true, ...body } });
test('administrator approves security without assigning a fictitious house', async t => {
    const { user, solicitud } = setupReview(t);
    t.mock.method(models.UsuarioCasa, 'findOrCreate', async () => assert.fail('security must not get membership'));
    const res = response(); await cuentas.revisar(request({ casaId: '999' }), res);
    assert.equal(res.code, 200); assert.equal(user.estatus, 'ACTIVO'); assert.equal(user.casaId, null);
    assert.equal(solicitud.rolAsignado, 'SEGURIDAD'); assert.equal(solicitud.revisadoPorUsuarioId, 9);
});
test('residential approval requires an existing house and grants a member link atomically', async t => {
    const { user, solicitud } = setupReview(t);
    const missing = response(); await cuentas.revisar(request({ rol: 'CONDOMINO' }), missing);
    assert.equal(missing.code, 400); assert.equal(user.estatus, 'PENDIENTE');
    const nonexistent = response(); await cuentas.revisar(request({ rol: 'CONDOMINO', casaId: '999' }), nonexistent);
    assert.equal(nonexistent.code, 400);
    const approved = response(); await cuentas.revisar(request({ rol: 'CONDOMINO', casaId: '7' }), approved);
    assert.equal(approved.code, 200); assert.equal(user.casaId, 7); assert.equal(solicitud.estatus, 'APROBADA');
    const duplicate = response(); await cuentas.revisar(request({ rol: 'CONDOMINO', casaId: '7' }), duplicate);
    assert.equal(duplicate.code, 409);
});
test('membership failure rolls back role assignment, account activation and review', async t => {
    const { user, solicitud } = setupReview(t);
    t.mock.method(models.HistorialVinculo, 'create', async () => { throw Error('storage unavailable'); });
    const res = response(); await cuentas.revisar(request({ rol: 'CONDOMINO', casaId: '7' }), res);
    assert.equal(res.code, 503); assert.equal(user.estatus, 'PENDIENTE'); assert.equal(solicitud.estatus, 'PENDIENTE');
});
test('elevated roles require an active administrator, identity confirmation and cannot grant SUPER_ADMIN', async t => {
    const { reviewer } = setupReview(t);
    for (const body of [{ rol: 'SUPER_ADMIN' }, { identidadVerificada: false }]) {
        const res = response(); await cuentas.revisar(request(body), res); assert.equal(res.code, 400);
    }
    for (const nombre of ['CONDOMINO', 'SEGURIDAD']) {
        reviewer.rol.nombre = nombre; const res = response(); await cuentas.revisar(request({ rol: 'ADMINISTRADOR' }), res); assert.equal(res.code, 403);
    }
    reviewer.rol.nombre = 'ADMINISTRADOR'; const res = response();
    await cuentas.revisar(request({ rol: 'ADMINISTRADOR' }), res); assert.equal(res.code, 200);
});
test('rejection requires a reason, is audited and never grants access', async t => {
    const { user, solicitud } = setupReview(t);
    const empty = response(); await cuentas.revisar(request({ accion: 'RECHAZAR' }), empty); assert.equal(empty.code, 400);
    const rejected = response(); await cuentas.revisar(request({ accion: 'RECHAZAR', comentario: 'No pertenece al equipo' }), rejected);
    assert.equal(rejected.code, 200); assert.equal(user.estatus, 'BLOQUEADO'); assert.equal(solicitud.estatus, 'RECHAZADA');
    assert.equal(solicitud.comentarioRevision, 'No pertenece al equipo');
});
test('pending account cannot obtain a login token, even with the correct password', async t => {
    const user = row({ estatus: 'PENDIENTE', contrasenaHash: await bcrypt.hash('Prueba1234', 4) });
    t.mock.method(models.Usuario, 'scope', () => ({ findOne: async () => user }));
    const res = response(); await auth.iniciarSesion({ body: { correo: 'ana@example.com', contrasena: 'Prueba1234' } }, res);
    assert.equal(res.code, 403); assert.equal(res.body.token, undefined); assert.match(res.body.message, /pendiente/);
    const invalid = response(); await auth.iniciarSesion({ body: { correo: 'ana@example.com', contrasena: 'incorrecta' } }, invalid);
    assert.equal(invalid.code, 401);
});
test('verification routes and page are restricted to administrators', () => {
    const routes = require('../src/routes/auth.routes');
    for (const path of ['/cuentas', '/cuentas/viviendas', '/cuentas/:id']) {
        const route = routes.stack.find(layer => layer.route?.path === path).route;
        for (const rol of ['CONDOMINO', 'SEGURIDAD', 'MESA_DIRECTIVA', 'MANTENIMIENTO']) {
            const res = response(); route.stack[1].handle({ usuario: { rol } }, res, () => assert.fail('must deny'));
            assert.equal(res.code, 403);
        }
    }
    const front = require('../../docs/assets/js/permissions');
    const back = require('../src/config/permissions');
    for (const policy of [front, back]) {
        assert.equal(policy.canAccess('ADMINISTRADOR', 'verificacion-cuentas.html'), true);
        assert.equal(policy.canAccess('SEGURIDAD', 'verificacion-cuentas.html'), false);
        assert.equal(policy.canAccess('CONDOMINO', 'verificacion-cuentas.html'), false);
    }
});
