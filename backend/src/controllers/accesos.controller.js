const { Op } = require('sequelize');
const { Acceso, Casa, Usuario } = require('../models');

const TIPOS = new Set(['VISITA', 'PAQUETERIA', 'TRANSPORTE']);

const normalizar = (value) => String(value || '').trim();

function incluirRelaciones() {
    return [
        {
            model: Casa,
            as: 'casa',
            attributes: ['id', 'calle', 'numero', 'nombre']
        },
        {
            model: Usuario,
            as: 'registradoPor',
            attributes: ['id', 'nombre', 'apellidoPaterno'],
            required: false
        }
    ];
}

async function obtenerAccesos(req, res) {
    try {
        const where = {};
        const tipo = normalizar(req.query.tipo).toUpperCase();
        const estatus = normalizar(req.query.estatus).toUpperCase();
        const calle = normalizar(req.query.calle);
        const numero = normalizar(req.query.numero);

        if (TIPOS.has(tipo)) where.tipo = tipo;
        if (estatus === 'DENTRO') where.fechaSalida = null;
        if (estatus === 'FINALIZADO') where.fechaSalida = { [Op.ne]: null };

        const include = incluirRelaciones();
        if (calle || numero) {
            include[0].where = {};
            if (calle) include[0].where.calle = calle;
            if (numero) include[0].where.numero = { [Op.like]: `%${numero}%` };
        }

        const accesos = await Acceso.findAll({
            where,
            include,
            order: [['fechaEntrada', 'DESC']],
            limit: 500
        });

        return res.json({ ok: true, total: accesos.length, data: accesos });
    } catch (error) {
        console.error('Error al consultar accesos:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible consultar la bitácora de accesos' });
    }
}

async function crearAcceso(req, res) {
    try {
        const tipo = normalizar(req.body.tipo).toUpperCase();
        const nombre = normalizar(req.body.nombre);
        const casaId = Number(req.body.casaId);

        if (!TIPOS.has(tipo) || !nombre || !Number.isInteger(casaId) || casaId <= 0) {
            return res.status(400).json({
                ok: false,
                message: 'Tipo, nombre, calle y número de casa son obligatorios'
            });
        }

        const casa = await Casa.findByPk(casaId);
        if (!casa) return res.status(404).json({ ok: false, message: 'La vivienda seleccionada no existe' });

        const acceso = await Acceso.create({
            tipo,
            nombre,
            telefono: normalizar(req.body.telefono) || null,
            identificacion: normalizar(req.body.identificacion) || null,
            placas: normalizar(req.body.placas).toUpperCase() || null,
            proveedor: normalizar(req.body.proveedor) || null,
            casaId,
            motivo: normalizar(req.body.motivo) || null,
            observaciones: normalizar(req.body.observaciones) || null,
            fechaEntrada: new Date(),
            registradoPorUsuarioId: req.usuario.usuarioId
        });

        const creado = await Acceso.findByPk(acceso.id, { include: incluirRelaciones() });
        return res.status(201).json({ ok: true, message: 'Entrada registrada', data: creado });
    } catch (error) {
        console.error('Error al registrar entrada:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible registrar la entrada' });
    }
}

async function registrarSalida(req, res) {
    try {
        const acceso = await Acceso.findByPk(req.params.id);
        if (!acceso) return res.status(404).json({ ok: false, message: 'Registro de acceso no encontrado' });
        if (acceso.fechaSalida) {
            return res.status(409).json({ ok: false, message: 'La salida ya fue registrada' });
        }

        await acceso.update({
            fechaSalida: new Date(),
            salidaRegistradaPorUsuarioId: req.usuario.usuarioId
        });
        const actualizado = await Acceso.findByPk(acceso.id, { include: incluirRelaciones() });
        return res.json({ ok: true, message: 'Salida registrada', data: actualizado });
    } catch (error) {
        console.error('Error al registrar salida:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible registrar la salida' });
    }
}

module.exports = { obtenerAccesos, crearAcceso, registrarSalida };
