const { Op } = require('sequelize');
const { Evento } = require('../models');

function serializarEvento(evento) {
    return {
        id: String(evento.id),
        title: evento.titulo,
        date: evento.fecha,
        time: evento.hora ? String(evento.hora).slice(0, 5) : '',
        type: evento.tipo,
        location: evento.ubicacion,
        description: evento.descripcion || ''
    };
}

async function obtenerEventos(req, res) {
    try {
        const where = {};
        if (req.query.desde && req.query.hasta) {
            where.fecha = { [Op.between]: [req.query.desde, req.query.hasta] };
        }

        const eventos = await Evento.findAll({
            where,
            order: [['fecha', 'ASC'], ['hora', 'ASC']]
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
        const evento = await Evento.create({
            titulo: title.trim(),
            fecha: date,
            hora: time || null,
            tipo: type || 'evento',
            ubicacion: location.trim(),
            descripcion: description?.trim() || null,
            creadoPorUsuarioId: req.usuario?.id || null
        });

        return res.status(201).json({ ok: true, data: serializarEvento(evento) });
    } catch (error) {
        return res.status(500).json({
            ok: false,
            message: 'No fue posible crear el evento'
        });
    }
}

async function eliminarEvento(req, res) {
    try {
        const eliminados = await Evento.destroy({ where: { id: req.params.id } });
        if (!eliminados) {
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
