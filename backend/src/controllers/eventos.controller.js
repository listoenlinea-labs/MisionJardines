const { Op } = require('sequelize');
const { Evento } = require('../models');

const TIPOS_FRONTEND_A_DB = {
    mantenimiento: 'MANTENIMIENTO',
    asamblea: 'ASAMBLEA',
    basura: 'RECOLECCION',
    seguridad: 'SEGURIDAD',
    evento: 'SOCIAL'
};

const TIPOS_DB_A_FRONTEND = Object.fromEntries(
    Object.entries(TIPOS_FRONTEND_A_DB)
        .map(([frontend, database]) => [database, frontend])
);

function separarFechaHora(fecha) {
    const valor = new Date(fecha);
    const year = valor.getFullYear();
    const month = String(valor.getMonth() + 1).padStart(2, '0');
    const day = String(valor.getDate()).padStart(2, '0');
    const hours = String(valor.getHours()).padStart(2, '0');
    const minutes = String(valor.getMinutes()).padStart(2, '0');

    return {
        date: `${year}-${month}-${day}`,
        time: `${hours}:${minutes}`
    };
}

function construirRango(date, time) {
    const todoElDia = !time;
    const inicio = new Date(`${date}T${time || '00:00'}:00`);
    const fin = new Date(inicio);

    if (todoElDia) {
        fin.setHours(23, 59, 59, 0);
    } else {
        fin.setHours(fin.getHours() + 1);
    }

    return { inicio, fin, todoElDia };
}

function serializarEvento(evento) {
    const { date, time } = separarFechaHora(evento.fechaInicio);

    return {
        id: String(evento.id),
        title: evento.titulo,
        date,
        time: evento.todoElDia ? '' : time,
        type: TIPOS_DB_A_FRONTEND[evento.tipoEvento] || 'evento',
        location: evento.ubicacion || 'Sin ubicación',
        description: evento.descripcion || '',
        status: evento.estatus
    };
}

async function obtenerEventos(req, res) {
    try {
        const where = { activo: true };

        if (req.query.desde && req.query.hasta) {
            where.fechaInicio = {
                [Op.between]: [
                    new Date(`${req.query.desde}T00:00:00`),
                    new Date(`${req.query.hasta}T23:59:59`)
                ]
            };
        }

        const rolesAdministrativos = [
            'SUPER_ADMIN',
            'ADMINISTRADOR',
            'MESA_DIRECTIVA'
        ];

        if (req.usuario.rol === 'SEGURIDAD') {
            where[Op.or] = [
                { visibilidad: 'TODOS' },
                { visibilidad: 'SEGURIDAD' }
            ];
        } else if (!rolesAdministrativos.includes(req.usuario.rol)) {
            where[Op.or] = [
                { visibilidad: 'TODOS' },
                {
                    visibilidad: 'SOLO_CASA',
                    casaId: req.usuario.casaId
                }
            ];
        }

        const eventos = await Evento.findAll({
            where,
            order: [['fechaInicio', 'ASC']]
        });

        return res.json({
            ok: true,
            total: eventos.length,
            data: eventos.map(serializarEvento)
        });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            message: 'No fue posible consultar los eventos'
        });
    }
}

async function crearEvento(req, res) {
    const { title, date, time, type, location, description } = req.body;
    if (!title || !date || !location) {
        return res.status(400).json({
            ok: false,
            message: 'Título, fecha y ubicación son obligatorios'
        });
    }

    try {
        const { inicio, fin, todoElDia } = construirRango(date, time);
        const evento = await Evento.create({
            titulo: title.trim(),
            casaId: null,
            creadoPorUsuarioId: req.usuario.usuarioId,
            descripcion: description?.trim() || null,
            tipoEvento: TIPOS_FRONTEND_A_DB[type] || 'OTRO',
            ubicacion: location?.trim() || null,
            fechaInicio: inicio,
            fechaFin: fin,
            todoElDia,
            visibilidad: 'TODOS',
            estatus: 'PROGRAMADO',
            activo: true
        });

        return res.status(201).json({ ok: true, data: serializarEvento(evento) });
    } catch (error) {
        console.error('Error al crear evento:', error);
        return res.status(500).json({
            ok: false,
            message: 'No fue posible crear el evento',
            error:
                process.env.NODE_ENV === 'development'
                    ? error.message
                    : undefined
        });
    }
}

async function eliminarEvento(req, res) {
    try {
        const [actualizados] = await Evento.update(
            { activo: false },
            { where: { id: req.params.id, activo: true } }
        );

        if (!actualizados) {
            return res.status(404).json({ ok: false, message: 'Evento no encontrado' });
        }

        return res.status(204).send();
    } catch (error) {
        return res.status(500).json({
            ok: false,
            message: 'No fue posible eliminar el evento'
        });
    }
}

module.exports = { obtenerEventos, crearEvento, eliminarEvento };
