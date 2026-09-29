const { ConfiguracionConexion } = require('../models');
const { encryptSecret } = require('../services/connection-secrets.service');

const TIPOS = new Set(['PLUMAS', 'CAMARAS', 'TELEFONIA']);

const text = (value, max = 255) => {
    const result = String(value ?? '').trim();
    return result ? result.slice(0, max) : null;
};

const parseConfig = value => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch (_) { return {}; }
};

const safeRow = row => ({
    id: row.id,
    tipo: row.tipo,
    nombre: row.nombre,
    activo: Boolean(row.activo),
    host: row.host || '',
    puerto: row.puerto || '',
    usuario: row.usuario || '',
    tieneSecreto: Boolean(row.secreto),
    configuracion: parseConfig(row.configuracionJson),
    updatedAt: row.updated_at || row.updatedAt || null
});

async function obtenerConfiguraciones(req, res) {
    try {
        const rows = await ConfiguracionConexion.findAll({
            order: [['tipo', 'ASC'], ['nombre', 'ASC']]
        });
        return res.json({ ok: true, data: rows.map(safeRow) });
    } catch (error) {
        console.error('Error al consultar configuraciones de conexión:', error);
        return res.status(500).json({
            ok: false,
            message: 'No fue posible consultar las configuraciones de conexión'
        });
    }
}

async function obtenerEstadoIntegraciones(req, res) {
    try {
        const rows = await ConfiguracionConexion.findAll({
            where: { activo: true },
            attributes: ['tipo', 'nombre', 'host', 'puerto', 'configuracionJson', 'updated_at']
        });

        return res.json({
            ok: true,
            data: rows.map(row => ({
                tipo: row.tipo,
                nombre: row.nombre,
                configurado: Boolean(row.host || row.configuracionJson),
                host: row.host || '',
                puerto: row.puerto || '',
                configuracion: parseConfig(row.configuracionJson),
                updatedAt: row.updated_at || null
            }))
        });
    } catch (error) {
        console.error('Error al consultar estado de integraciones:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible consultar el estado de integraciones' });
    }
}

async function eliminarConfiguracion(req, res) {
    try {
        const tipo = String(req.params.tipo || '').trim().toUpperCase();
        const nombre = String(req.params.nombre || '').trim();

        if (!TIPOS.has(tipo) || !nombre) {
            return res.status(400).json({ ok: false, message: 'Configuración no válida' });
        }

        const row = await ConfiguracionConexion.findOne({ where: { tipo, nombre } });
        if (!row) {
            return res.status(404).json({ ok: false, message: 'Configuración no encontrada' });
        }

        await row.destroy();
        return res.json({ ok: true, message: 'Configuración eliminada correctamente' });
    } catch (error) {
        console.error('Error al eliminar configuración de conexión:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible eliminar la configuración' });
    }
}

async function guardarConfiguracion(req, res) {
    try {
        const tipo = String(req.params.tipo || '').trim().toUpperCase();
        if (!TIPOS.has(tipo)) {
            return res.status(400).json({ ok: false, message: 'Tipo de integración no válido' });
        }

        const nombre = text(req.body.nombre, 80) || 'principal';
        const puerto = req.body.puerto === '' || req.body.puerto == null
            ? null
            : Number(req.body.puerto);

        if (puerto !== null && (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535)) {
            return res.status(400).json({ ok: false, message: 'El puerto debe estar entre 1 y 65535' });
        }

        const [row, created] = await ConfiguracionConexion.findOrCreate({
            where: { tipo, nombre },
            defaults: {
                tipo,
                nombre,
                creadoPorUsuarioId: req.usuario.usuarioId || null
            }
        });

        const updates = {
            activo: req.body.activo !== false,
            host: text(req.body.host, 255),
            puerto,
            usuario: text(req.body.usuario, 190),
            configuracionJson: JSON.stringify(
                req.body.configuracion && typeof req.body.configuracion === 'object'
                    ? req.body.configuracion
                    : {}
            ),
            actualizadoPorUsuarioId: req.usuario.usuarioId || null
        };

        const secret = String(req.body.secreto ?? '').trim();
        if (secret) updates.secreto = encryptSecret(secret);

        await row.update(updates);

        return res.status(created ? 201 : 200).json({
            ok: true,
            message: 'Configuración guardada correctamente',
            data: safeRow(row)
        });
    } catch (error) {
        console.error('Error al guardar configuración de conexión:', error);
        const configurationError = String(error.message || '').includes('CONNECTIONS_ENCRYPTION_KEY');
        return res.status(configurationError ? 503 : 500).json({
            ok: false,
            message: configurationError
                ? 'El servidor aún no tiene configurada la llave para cifrar credenciales'
                : 'No fue posible guardar la configuración'
        });
    }
}

module.exports = {
    obtenerConfiguraciones,
    obtenerEstadoIntegraciones,
    guardarConfiguracion,
    eliminarConfiguracion
};
