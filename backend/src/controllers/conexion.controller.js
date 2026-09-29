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

function sanitizeConfig(tipo, config) {
    const clean = config && typeof config === 'object' ? JSON.parse(JSON.stringify(config)) : {};
    if (tipo === 'PLUMAS' && Array.isArray(clean.plumas)) {
        clean.plumas = clean.plumas.map(gate => {
            const copy = { ...gate };
            copy.tieneSecreto = Boolean(copy.secreto);
            delete copy.secreto;
            return copy;
        });
    }
    return clean;
}

function prepareGateConfig(nextConfig, previousConfig) {
    const next = nextConfig && typeof nextConfig === 'object' ? nextConfig : {};
    const previousGates = Array.isArray(previousConfig?.plumas) ? previousConfig.plumas : [];
    const previousById = new Map(previousGates.map(gate => [String(gate.id || ''), gate]));

    const gates = Array.isArray(next.plumas) ? next.plumas.slice(0, 16) : [];
    return {
        ...next,
        plumas: gates.map((gate, index) => {
            const id = text(gate.id, 80) || `pluma-${index + 1}`;
            const previous = previousById.get(id);
            const plainSecret = String(gate.secreto ?? '').trim();

            return {
                id,
                nombre: text(gate.nombre, 120) || `Pluma ${index + 1}`,
                host: text(gate.host, 255),
                puerto: gate.puerto === '' || gate.puerto == null ? null : Number(gate.puerto),
                rele: gate.rele === '' || gate.rele == null ? null : Number(gate.rele),
                pulsoMs: gate.pulsoMs === '' || gate.pulsoMs == null ? 1000 : Number(gate.pulsoMs),
                notas: text(gate.notas, 500),
                secreto: plainSecret ? encryptSecret(plainSecret) : (previous?.secreto || null)
            };
        })
    };
}

const safeRow = row => {
    const config = parseConfig(row.configuracionJson);
    return {
        id: row.id,
        tipo: row.tipo,
        nombre: row.nombre,
        activo: Boolean(row.activo),
        host: row.host || '',
        puerto: row.puerto || '',
        usuario: row.usuario || '',
        tieneSecreto: Boolean(row.secreto),
        configuracion: sanitizeConfig(row.tipo, config),
        updatedAt: row.updated_at || row.updatedAt || null
    };
};

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
                configuracion: sanitizeConfig(row.tipo, parseConfig(row.configuracionJson)),
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

        const incomingConfig = req.body.configuracion && typeof req.body.configuracion === 'object'
            ? req.body.configuracion
            : {};
        const previousConfig = parseConfig(row.configuracionJson);
        const storedConfig = tipo === 'PLUMAS'
            ? prepareGateConfig(incomingConfig, previousConfig)
            : incomingConfig;

        if (tipo === 'PLUMAS') {
            for (const gate of storedConfig.plumas || []) {
                if (gate.puerto !== null && (!Number.isInteger(gate.puerto) || gate.puerto < 1 || gate.puerto > 65535)) {
                    return res.status(400).json({ ok: false, message: 'Cada puerto de pluma debe estar entre 1 y 65535' });
                }
                if (gate.rele !== null && (!Number.isInteger(gate.rele) || gate.rele < 1 || gate.rele > 8)) {
                    return res.status(400).json({ ok: false, message: 'Cada relé de pluma debe estar entre 1 y 8' });
                }
                if (!Number.isInteger(gate.pulsoMs) || gate.pulsoMs < 200 || gate.pulsoMs > 10000) {
                    return res.status(400).json({ ok: false, message: 'El pulso de cada pluma debe estar entre 200 y 10000 ms' });
                }
            }
        }

        const updates = {
            activo: req.body.activo !== false,
            host: text(req.body.host, 255),
            puerto,
            usuario: text(req.body.usuario, 190),
            configuracionJson: JSON.stringify(storedConfig),
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
