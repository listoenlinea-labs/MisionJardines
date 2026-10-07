// Único interruptor de telefonía. Cambiar a true DESPUÉS de configurar el PBX y el FXO.
const TELEFONIA_HABILITADA = false;

function obtenerConfiguracion(env = process.env, habilitada = TELEFONIA_HABILITADA) {
    if (!habilitada) return { ok: true, habilitada: false, modo: 'WHATSAPP' };
    const required = ['TELEFONIA_WSS_URL', 'TELEFONIA_SIP_DOMAIN', 'TELEFONIA_SIP_USER', 'TELEFONIA_SIP_PASSWORD'];
    if (required.some(key => !env[key])) throw new Error('Falta configurar la conexión de telefonía en el servidor.');
    const url = new URL(env.TELEFONIA_WSS_URL);
    if (url.protocol !== 'wss:' || url.username || url.password ||
        !/^[a-zA-Z0-9.-]+(?::\d+)?$/.test(env.TELEFONIA_SIP_DOMAIN) ||
        !/^[a-zA-Z0-9_-]+$/.test(env.TELEFONIA_SIP_USER)) {
        throw new Error('La configuración SIP/WSS no es válida.');
    }
    const iceServers = [];
    if (env.TELEFONIA_STUN_URL) {
        if (!/^stuns?:[^\s]+$/.test(env.TELEFONIA_STUN_URL)) throw new Error('Servidor STUN no válido.');
        iceServers.push({ urls: env.TELEFONIA_STUN_URL });
    }
    if (env.TELEFONIA_TURN_URL) {
        if (!/^turns?:[^\s]+$/.test(env.TELEFONIA_TURN_URL) || !env.TELEFONIA_TURN_USER || !env.TELEFONIA_TURN_PASSWORD) {
            throw new Error('Falta configurar el servidor TURN.');
        }
        iceServers.push({ urls: env.TELEFONIA_TURN_URL, username: env.TELEFONIA_TURN_USER, credential: env.TELEFONIA_TURN_PASSWORD });
    }
    return {
        ok: true, habilitada: true, modo: 'TELEFONIA',
        sip: { websocket: url.href, domain: env.TELEFONIA_SIP_DOMAIN, user: env.TELEFONIA_SIP_USER,
            password: env.TELEFONIA_SIP_PASSWORD, iceServers }
    };
}

module.exports = { TELEFONIA_HABILITADA, obtenerConfiguracion };
