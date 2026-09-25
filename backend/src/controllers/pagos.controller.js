const crypto = require('crypto');
const { PagoReportado, Casa, Usuario } = require('../models');

function nombreCompleto(usuario) {
    return [usuario?.nombre, usuario?.apellidoPaterno, usuario?.apellidoMaterno]
        .filter(Boolean)
        .join(' ')
        .trim();
}

function limpiarTexto(value, max = 300) {
    return String(value || '').trim().slice(0, max);
}

function generarFolioReporte() {
    const ahora = new Date();
    const fecha = [
        ahora.getFullYear(),
        String(ahora.getMonth() + 1).padStart(2, '0'),
        String(ahora.getDate()).padStart(2, '0')
    ].join('');
    return `PAG-${fecha}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function pagoSeguro(pago) {
    const data = pago.toJSON ? pago.toJSON() : pago;
    delete data.comprobanteData;
    delete data.textoOcr;
    data.tieneComprobante = true;
    return data;
}

async function obtenerConfiguracion(req, res) {
    return res.json({
        ok: true,
        data: {
            banco: process.env.PAGOS_BANCO || '',
            titular: process.env.PAGOS_TITULAR || '',
            cuenta: process.env.PAGOS_CUENTA || '',
            clabe: process.env.PAGOS_CLABE || '',
            referencia: process.env.PAGOS_REFERENCIA || '',
            montoMinimo: 300,
            moneda: 'MXN'
        }
    });
}

async function listarMisPagos(req, res) {
    try {
        if (!req.usuario.casaId) {
            return res.status(400).json({
                ok: false,
                message: 'Tu usuario no tiene una vivienda asignada'
            });
        }

        const folioBuscado = typeof req.query.folio === 'string' ? req.query.folio.trim().slice(0, 60) : '';
        const pagos = await PagoReportado.findAll({
            where: {
                casaId: req.usuario.casaId,
                ...(folioBuscado && { folioReporte: folioBuscado })
            },
            attributes: {
                exclude: ['comprobanteData', 'textoOcr']
            },
            order: [['creadoEn', 'DESC']],
            limit: 50
        });

        return res.json({
            ok: true,
            total: pagos.length,
            data: pagos
        });
    } catch (error) {
        console.error('Error al listar pagos reportados:', error);
        return res.status(500).json({
            ok: false,
            message: 'No fue posible consultar tus pagos reportados',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

async function reportarPago(req, res) {
    try {
        const casaId = Number(req.usuario.casaId);
        const usuarioId = Number(req.usuario.usuarioId);

        if (!casaId || !usuarioId) {
            return res.status(400).json({
                ok: false,
                message: 'Tu sesión no tiene una vivienda asociada'
            });
        }

        const folioOperacion = limpiarTexto(req.body.folioOperacion, 180);
        const fechaOperacion = limpiarTexto(req.body.fechaOperacion, 10);
        const horaOperacion = limpiarTexto(req.body.horaOperacion, 8);
        const concepto = limpiarTexto(req.body.concepto, 300);
        const monto = Number(req.body.monto);
        const comprobanteData = String(req.body.comprobanteData || '');
        const textoOcr = limpiarTexto(req.body.textoOcr, 12000);

        if (!folioOperacion || !fechaOperacion || !horaOperacion || !concepto) {
            return res.status(400).json({
                ok: false,
                message: 'Folio de operación, fecha, hora y concepto son obligatorios'
            });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaOperacion)) {
            return res.status(400).json({
                ok: false,
                message: 'La fecha de operación no es válida'
            });
        }

        if (!/^\d{2}:\d{2}(:\d{2})?$/.test(horaOperacion)) {
            return res.status(400).json({
                ok: false,
                message: 'La hora de operación no es válida'
            });
        }

        if (!Number.isFinite(monto) || monto < 300) {
            return res.status(400).json({
                ok: false,
                message: 'El monto reportado debe ser de $300 MXN o mayor'
            });
        }

        if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(comprobanteData)) {
            return res.status(400).json({
                ok: false,
                message: 'Adjunta una captura o fotografía válida del comprobante'
            });
        }

        if (comprobanteData.length > 1500000) {
            return res.status(413).json({
                ok: false,
                message: 'La imagen del comprobante es demasiado grande. Intenta con otra foto o captura.'
            });
        }

        const [casa, usuario] = await Promise.all([
            Casa.findByPk(casaId, {
                attributes: ['id', 'calle', 'numero']
            }),
            Usuario.findByPk(usuarioId, {
                attributes: ['id', 'nombre', 'apellidoPaterno', 'apellidoMaterno']
            })
        ]);

        if (!casa) {
            return res.status(404).json({
                ok: false,
                message: 'No fue posible localizar la vivienda asociada a tu cuenta'
            });
        }

        const existente = await PagoReportado.findOne({
            where: { folioOperacion }
        });

        if (existente) {
            return res.status(409).json({
                ok: false,
                message: 'Ese folio de operación ya fue reportado anteriormente'
            });
        }

        const pago = await PagoReportado.create({
            casaId,
            usuarioId,
            folioReporte: generarFolioReporte(),
            folioOperacion,
            fechaOperacion,
            horaOperacion: horaOperacion.length === 5 ? `${horaOperacion}:00` : horaOperacion,
            concepto,
            monto,
            calleSnapshot: casa.calle,
            numeroCasaSnapshot: casa.numero,
            nombreReportante: nombreCompleto(usuario) || null,
            comprobanteData,
            textoOcr: textoOcr || null,
            estatus: 'PENDIENTE_VALIDACION'
        });

        return res.status(201).json({
            ok: true,
            message: 'Pago reportado correctamente',
            data: pagoSeguro(pago)
        });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({
                ok: false,
                message: 'Este comprobante ya fue registrado'
            });
        }

        console.error('Error al reportar pago:', error);
        return res.status(500).json({
            ok: false,
            message: 'No fue posible registrar el comprobante de pago',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

module.exports = {
    obtenerConfiguracion,
    listarMisPagos,
    reportarPago
};
