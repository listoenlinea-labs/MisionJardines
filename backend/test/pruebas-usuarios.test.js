const test = require('node:test');
const assert = require('node:assert/strict');
const { configurar, ejecutar } = require('../scripts/pruebas-usuarios');
const env = { PRUEBAS_API_URL: 'http://localhost:3000/api', PRUEBAS_CASA_ID: '42' };
for (const rol of ['CONDOMINO', 'SEGURIDAD', 'ADMINISTRADOR']) {
    env[`PRUEBAS_${rol}_CORREO`] = `${rol}@prueba.invalid`;
    env[`PRUEBAS_${rol}_CLAVE`] = 'secreto-de-prueba';
}
function servidor({ inseguro = false, casa = '42', incorrecto = false, html = false } = {}) {
    const llamadas = [];
    const responder = async (url, opciones) => {
        llamadas.push({ url, opciones });
        assert.equal(opciones.redirect, 'error');
        const ruta = new URL(url).pathname.replace('/api', '');
        let status = 200, datos = { ok: true };
        if (ruta === '/auth/login') {
            const rol = JSON.parse(opciones.body).correo.split('@')[0];
            datos = { ok: true, token: rol, usuario: { rol: { nombre: incorrecto ? 'OTRO' : rol }, estatus: 'ACTIVO' } };
        } else {
            const rol = opciones.headers.Authorization?.replace('Bearer ', '');
            if (!rol) { status = 401; datos = { ok: false }; }
            else if (ruta === '/viviendas/mias') datos.viviendas = [{ casaId: casa }];
            else if ((ruta === '/viviendas/administracion/casas' && rol !== 'ADMINISTRADOR') ||
                     (ruta === '/pagos/config' && rol === 'SEGURIDAD') ||
                     (ruta === '/zkteco/calles' && rol === 'CONDOMINO')) {
                status = inseguro ? 200 : 403; datos.ok = inseguro;
            }
        }
        return { status, async json() { if (html) throw Error('HTML'); return datos; } };
    };
    return { llamadas, responder };
}
test('configuración completa, HTTPS y tres cuentas distintas', () => {
    assert.equal(configurar(env).cuentas.length, 3);
    for (const datos of [{}, { ...env, PRUEBAS_API_URL: 'http://sitio.example/api' },
        { ...env, PRUEBAS_API_URL: 'https://u:p@sitio.example/api' }, { ...env, PRUEBAS_CASA_ID: '0' },
        { ...env, PRUEBAS_SEGURIDAD_CLAVE: '' },
        { ...env, PRUEBAS_SEGURIDAD_CORREO: env.PRUEBAS_CONDOMINO_CORREO }]) assert.throws(() => configurar(datos));
});
test('tres roles, permisos y resultados sin credenciales ni escrituras de negocio', async () => {
    const s = servidor(); const informe = await ejecutar(configurar(env), s.responder);
    assert.equal(informe.ok, true); assert.equal(informe.resultados.length, 19);
    for (const { url, opciones } of s.llamadas) assert.equal(opciones.method, url.endsWith('/auth/login') ? 'POST' : 'GET');
    const json = JSON.stringify(informe);
    for (const secreto of ['secreto-de-prueba', '@prueba.invalid', 'token']) assert.ok(!json.includes(secreto));
});
test('detecta permisos indebidos, rol incorrecto y HTML en vez de JSON', async () => {
    for (const opciones of [{ inseguro: true }, { incorrecto: true }, { html: true }]) {
        assert.equal((await ejecutar(configurar(env), servidor(opciones).responder)).ok, false);
    }
});
test('sin vínculo a vivienda ficticia no continúa a pagos del condómino', async () => {
    const s = servidor({ casa: '99' });
    assert.equal((await ejecutar(configurar(env), s.responder)).ok, false);
    assert.ok(!s.llamadas.some(c => c.url.endsWith('/pagos/config') && c.opciones.headers.Authorization === 'Bearer CONDOMINO'));
});
test('interrumpe ante fallas de conexión', async () => {
    await assert.rejects(ejecutar(configurar(env), async () => { throw Error('sin conexión'); }));
});
