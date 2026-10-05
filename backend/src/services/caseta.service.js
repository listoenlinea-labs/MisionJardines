const crypto = require('node:crypto');

const ROLES = new Set(['SUPER_ADMIN', 'ADMINISTRADOR', 'SEGURIDAD']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function validarSolicitud(usuario, body) {
    if (!ROLES.has(usuario?.rol)) fail(403, 'No tienes permiso para operar las plumas');
    if (!UUID.test(body.solicitudId || '')) fail(400, 'solicitudId debe ser un UUID');
    if (!['entrada', 'salida'].includes(body.pluma) || body.accion !== 'ABRIR')
        fail(400, 'Solo se permite ABRIR entrada o salida');
    return { puerta: body.pluma === 'entrada' ? 1 : 2, duracionSegundos: 3 };
}
function autenticarAgente(header, env = process.env) {
    let tokens;
    try { tokens = JSON.parse(env.CASETA_AGENT_TOKENS || '{}'); }
    catch { fail(503, 'Configuración del servicio de caseta inválida'); }
    const supplied = String(header || '').replace(/^Bearer /, '');
    if (supplied.length < 32 || !String(header || '').startsWith('Bearer ')) fail(401, 'Credencial de agente inválida');
    const matches = Object.entries(tokens).filter(([id, token]) => {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || typeof token !== 'string' || token.length < 32) return false;
        return crypto.timingSafeEqual(crypto.createHash('sha256').update(supplied).digest(), crypto.createHash('sha256').update(token).digest());
    });
    if (matches.length !== 1) fail(401, 'Credencial de agente inválida');
    return matches[0][0];
}
function crearServicio({ Orden, Agente, sequelize, Op, now = () => new Date(), agenteId = () => process.env.CASETA_AGENT_ID || 'caseta-principal' }) {
    async function caducar() {
        const time = now();
        await Orden.update({ estado: 'VENCIDA' }, { where: { estado: 'PENDIENTE', venceEn: { [Op.lte]: time } } });
        // A claimed command may already have opened the gate. Never put it back in the queue.
        await Orden.update({ estado: 'DESCONOCIDA', resultado: 'Sin confirmación; no se reintentará automáticamente' },
            { where: { estado: 'ENVIADA', reclamadaEn: { [Op.lte]: new Date(time.getTime() - 20000) } } });
    }
    async function crear(usuario, body) {
        const params = validarSolicitud(usuario, body);
        const existing = await Orden.findOne({ where: { usuarioId: usuario.usuarioId, solicitudId: body.solicitudId } });
        if (existing) {
            if (existing.puerta !== params.puerta) fail(409, 'La solicitud ya pertenece a otra pluma');
            return existing;
        }
        const agent = await Agente.findByPk(agenteId());
        if (!agent || now() - new Date(agent.ultimoContacto) > 15000) fail(503, 'El servicio de caseta está desconectado');
        await caducar();
        const [row] = await Orden.findOrCreate({
            where: { usuarioId: usuario.usuarioId, solicitudId: body.solicitudId },
            defaults: { id: crypto.randomUUID(), agenteId: agenteId(), ...params, estado: 'PENDIENTE', venceEn: new Date(now().getTime() + 15000) }
        });
        if (row.puerta !== params.puerta) fail(409, 'La solicitud ya pertenece a otra pluma');
        return row;
    }
    async function reclamar(id, modo) {
        if (!['SIMULACION', 'FISICO'].includes(modo)) fail(400, 'Modo de agente inválido');
        await Agente.upsert({ id, ultimoContacto: now(), modo });
        await caducar();
        return sequelize.transaction(async transaction => {
            await Agente.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            const inFlight = await Orden.findOne({ where: { agenteId: id, estado: 'ENVIADA' }, transaction });
            if (inFlight) return null;
            const row = await Orden.findOne({ where: { agenteId: id, estado: 'PENDIENTE', venceEn: { [Op.gt]: now() } },
                order: [['createdAt', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
            if (!row) return null;
            if (new Date(row.venceEn) <= now()) {
                await row.update({ estado: 'VENCIDA' }, { transaction });
                return null;
            }
            await row.update({ estado: 'ENVIADA', reclamadaEn: now(), reclamoId: crypto.randomUUID() }, { transaction });
            return row;
        });
    }
    async function confirmar(id, ordenId, body) {
        if (!['EJECUTADA', 'SIMULADA', 'FALLIDA', 'DESCONOCIDA'].includes(body.estado) || !UUID.test(body.reclamoId || '')) fail(400, 'Resultado inválido');
        return sequelize.transaction(async transaction => {
            const row = await Orden.findByPk(ordenId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!row || row.agenteId !== id) fail(404, 'Orden no encontrada');
            if (row.reclamoId !== body.reclamoId) fail(409, 'El reclamo no coincide');
            if (!['ENVIADA', 'DESCONOCIDA'].includes(row.estado)) {
                if (row.estado === body.estado) return row;
                fail(409, 'La orden ya tiene un resultado');
            }
            const agent = await Agente.findByPk(id, { transaction });
            if (agent?.modo === 'SIMULACION' && body.estado === 'EJECUTADA') fail(400, 'Una simulación no confirma una apertura física');
            await row.update({ estado: body.estado, resultado: String(body.resultado || '').slice(0, 500) }, { transaction });
            return row;
        });
    }
    async function consultar(id) { await caducar(); const row = await Orden.findByPk(id); if (!row) fail(404, 'Orden no encontrada'); return row; }
    async function estado() { const agent = await Agente.findByPk(agenteId()); return { conectado: Boolean(agent && now() - new Date(agent.ultimoContacto) <= 15000), modo: agent?.modo || null, ultimoContacto: agent?.ultimoContacto || null }; }
    return { crear, reclamar, confirmar, consultar, estado };
}
module.exports = { crearServicio, autenticarAgente, validarSolicitud };
