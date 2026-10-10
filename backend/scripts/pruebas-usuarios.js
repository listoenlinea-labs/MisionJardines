const fs = require('node:fs');
const path = require('node:path');
const roles = ['CONDOMINO', 'SEGURIDAD', 'ADMINISTRADOR'];

function configurar(env) {
    const url = new URL(env.PRUEBAS_API_URL || '');
    if (url.username || url.password || url.search || url.hash ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
        throw new Error('PRUEBAS_API_URL debe ser HTTPS (HTTP solo para localhost), sin credenciales ni parámetros');
    }
    const cuentas = roles.map(rol => {
        const correo = env[`PRUEBAS_${rol}_CORREO`];
        const contrasena = env[`PRUEBAS_${rol}_CLAVE`];
        if (!correo || !contrasena) throw new Error(`Faltan credenciales de prueba para ${rol}`);
        return { rol, correo, contrasena };
    });
    if (new Set(cuentas.map(c => c.correo.trim().toLowerCase())).size !== 3) throw new Error('Usa tres cuentas de prueba distintas');
    if (!/^[1-9]\d*$/.test(env.PRUEBAS_CASA_ID || '')) throw new Error('Falta PRUEBAS_CASA_ID: vivienda de prueba vinculada al condómino');
    return { base: url.href.replace(/\/$/, ''), cuentas, casaId: env.PRUEBAS_CASA_ID };
}

async function ejecutar(config, fetchImpl = fetch) {
    const resultados = [];
    async function peticion(ruta, { token, casaId, body } = {}) {
        const respuesta = await fetchImpl(`${config.base}${ruta}`, {
            method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(casaId ? { 'X-Casa-Id': casaId } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        let datos = null;
        try { datos = await respuesta.json(); } catch { /* La comprobación de contrato rechazará HTML. */ }
        return { status: respuesta.status, datos };
    }
    function comprobar(nombre, actual, esperado, contrato = true) {
        resultados.push({ nombre, ok: actual === esperado && contrato, status: actual, esperado });
    }
    const anonima = await peticion('/auth/perfil');
    comprobar('Sin sesión: perfil protegido', anonima.status, 401, anonima.datos?.ok === false);
    for (const cuenta of config.cuentas) {
        const login = await peticion('/auth/login', { body: { correo: cuenta.correo, contrasena: cuenta.contrasena } });
        const identidad = login.datos?.usuario;
        const valido = login.status === 200 && login.datos?.ok === true &&
            typeof login.datos.token === 'string' && login.datos.token.length > 0 && identidad?.rol?.nombre === cuenta.rol && identidad?.estatus === 'ACTIVO';
        comprobar(`${cuenta.rol}: inicio de sesión y rol`, login.status, 200, valido);
        if (!valido) continue;
        const token = login.datos.token;
        const viviendas = await peticion('/viviendas/mias', { token });
        const lista = viviendas.datos?.viviendas;
        const vinculada = Array.isArray(lista) && lista.some(v => String(v.casaId ?? v.casa?.id) === config.casaId);
        comprobar(`${cuenta.rol}: mis viviendas`, viviendas.status, 200,
            viviendas.datos?.ok === true && Array.isArray(lista) && (cuenta.rol !== 'CONDOMINO' || vinculada));
        if (cuenta.rol === 'CONDOMINO' && !vinculada) continue;
        const opciones = { token, ...(cuenta.rol === 'CONDOMINO' ? { casaId: config.casaId } : {}) };
        const perfil = await peticion('/auth/perfil', opciones);
        comprobar(`${cuenta.rol}: perfil`, perfil.status, 200, perfil.datos?.ok === true);
        for (const [ruta, nombre, permitido] of [
            ['/pagos/config', 'acceso a pagos', cuenta.rol !== 'SEGURIDAD'],
            ['/zkteco/calles', 'calles ZKTeco', cuenta.rol !== 'CONDOMINO'],
            ['/viviendas/administracion/casas', 'administración de viviendas', cuenta.rol === 'ADMINISTRADOR']
        ]) {
            const respuesta = await peticion(ruta, opciones);
            comprobar(`${cuenta.rol}: ${nombre}`, respuesta.status, permitido ? 200 : 403,
                respuesta.datos?.ok === permitido);
        }
    }
    return { generadoEn: new Date().toISOString(), ok: resultados.every(r => r.ok), resultados };
}

async function main() {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env.pruebas'), quiet: true });
    const config = configurar(process.env); // Validar todo antes de iniciar sesiones.
    const informe = await ejecutar(config);
    for (const r of informe.resultados) console.log(`${r.ok ? 'OK' : 'FALLO'} ${r.nombre} [${r.status}; esperado ${r.esperado}]`);
    const destino = path.resolve(__dirname, '../reports/pruebas-usuarios.json');
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, JSON.stringify(informe, null, 2));
    console.log(`Informe: ${destino}`);
    if (!informe.ok) process.exitCode = 1;
}
if (require.main === module) main().catch(() => {
    // Nunca imprimir respuestas del servidor, tokens, contraseñas ni errores de transporte que incluyan URLs.
    console.error('No se completaron las pruebas. Revisa la configuración, las cuentas y la disponibilidad de la API.');
    process.exitCode = 1;
});
module.exports = { configurar, ejecutar };
