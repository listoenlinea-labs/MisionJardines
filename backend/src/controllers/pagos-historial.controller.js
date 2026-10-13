const { Op } = require('sequelize');

function periodoActual(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now).map(p => [p.type, p.value]));
    const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1 - (Number(parts.day) < 11 ? 1 : 0), 11));
    return date.toISOString().slice(0, 7);
}

function rangoPeriodo(value) {
    if (typeof value !== 'string' || !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(value)) {
        throw Object.assign(new Error('Selecciona un periodo válido (AAAA-MM).'), { status: 400 });
    }
    const [year, month] = value.split('-').map(Number);
    return { periodo: value, desde: value + '-11', hastaExclusiva: new Date(Date.UTC(year, month, 11)).toISOString().slice(0, 10) };
}

function crearHistorialController({ PagoReportado, PagoAccesoC3, PagoAccesoTagC3, ZkTarjeta }) {
    return async function listarHistorial(req, res) {
        if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(req.usuario?.rol)) {
            return res.status(403).json({ ok: false, message: 'Solo Administración puede consultar este historial.' });
        }
        try {
            const periodo = rangoPeriodo(req.query.periodo || periodoActual());
            const pagina = Number(req.query.pagina || 1), limite = 50;
            if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 100000) {
                return res.status(400).json({ ok: false, message: 'Página no válida.' });
            }
            const { count, rows } = await PagoReportado.findAndCountAll({
                where: { fechaOperacion: { [Op.gte]: periodo.desde, [Op.lt]: periodo.hastaExclusiva } },
                attributes: ['id', 'casaId', 'folioReporte', 'folioOperacion', 'fechaOperacion', 'horaOperacion',
                    'creadoEn', 'monto', 'recargo', 'nombreReportante', 'calleSnapshot', 'numeroCasaSnapshot', 'tipoPago', 'estatus'],
                order: [['fechaOperacion', 'DESC'], ['horaOperacion', 'DESC'], ['id', 'DESC']],
                limit: limite, offset: (pagina - 1) * limite, raw: true
            });
            const ids = rows.map(p => p.id), casas = [...new Set(rows.map(p => p.casaId))];
            const [movimientos, tags] = rows.length ? await Promise.all([
                PagoAccesoC3.findAll({ where: { origen: 'PAGO', origenId: { [Op.in]: ids } },
                    attributes: ['id', 'origenId', 'meses', 'estado'], raw: true }),
                ZkTarjeta.findAll({ where: { casaId: { [Op.in]: casas } },
                    attributes: ['casaId', 'numeroTarjeta', 'fechaFin', 'ultimaLectura', 'enControlador'], order: [['id', 'ASC']], raw: true })
            ]) : [[], []];
            const entregas = movimientos.length ? await PagoAccesoTagC3.findAll({
                where: { pagoAccesoId: { [Op.in]: movimientos.map(m => m.id) } },
                attributes: ['pagoAccesoId', 'estado'], raw: true
            }) : [];
            const data = rows.map(p => {
                const diario = movimientos.filter(m => String(m.origenId) === String(p.id)).map(m => {
                    const intentos = entregas.filter(t => String(t.pagoAccesoId) === String(m.id));
                    return { meses: Number(m.meses), estado: m.estado, tagsTotal: intentos.length,
                        tagsAplicados: intentos.filter(t => t.estado === 'COMPLETADO').length };
                });
                return { ...p, movimientos: diario, tags: tags.filter(t => String(t.casaId) === String(p.casaId)) };
            });
            return res.json({ ok: true, ...periodo, pagina, limite, total: count, data });
        } catch (error) {
            return res.status(error.status || 500).json({ ok: false,
                message: error.status ? error.message : 'No se pudo consultar el historial de pagos.' });
        }
    };
}

module.exports = { crearHistorialController, rangoPeriodo, periodoActual };
