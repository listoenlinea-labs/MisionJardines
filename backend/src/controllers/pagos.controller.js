const sequelize = require('../config/database');
const {
    PagoReportado,
    Casa,
    Usuario,
    CuotaExtraordinaria
} = require('../models');
const { generarSiguienteFolio } = require('../services/folios.service');
const { generarReciboPagoReportado } = require('../services/pago-reportado-pdf.service');

const vigenciaService = require('../services/vigencia-mantenimiento.service');
const { centavos } = require('../services/vigencia-calculo');
const BASE_MANTENIMIENTO = 300;
const RECARGO_TARDIO = 50;
const DIA_LIMITE = 10;

function nombreCompleto(usuario) {
    return [usuario?.nombre, usuario?.apellidoPaterno, usuario?.apellidoMaterno]
        .filter(Boolean)
        .join(' ')
        .trim();
}

function limpiarTexto(value, max = 300) {
    return String(value || '').trim().slice(0, max);
}

function datoTransferencia(value, fallback) {
    const text = String(value ?? '').trim();
    return text && !/^[—–-]+$/.test(text) ? text : fallback;
}

function basePublicaBackend(req) {
    const configured = String(process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
    if (configured) {
        return configured;
    }

    const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim();

    const protocol = forwardedProto || req.protocol || 'https';
    const host = req.get('host');

    return protocol + '://' + host;
}

function construirUrlRecibo(req, pagoId) {
    return basePublicaBackend(req) + '/api/pagos/' + pagoId + '/recibo';
}

function montoMantenimiento(fechaOperacion) {
    const match = String(fechaOperacion || '').match(/^\d{4}-\d{2}-(\d{2})$/);
    const day = match ? Number(match[1]) : NaN;
    if (!Number.isInteger(day)) return null;

    const late = day > DIA_LIMITE;

    return {
        base: BASE_MANTENIMIENTO,
        recargo: late ? RECARGO_TARDIO : 0,
        total: BASE_MANTENIMIENTO + (late ? RECARGO_TARDIO : 0),
        late
    };
}

function conceptoMantenimiento() {
    return 'Pago de mantenimiento (abono o mensualidades)';
}

function pagoSeguro(req, pago) {
    const data = pago.toJSON ? pago.toJSON() : { ...pago };
    delete data.comprobanteData;
    delete data.textoOcr;
    delete data.reciboPdfData;
    data.tieneComprobante = true;
    data.tieneReciboPdf = Boolean(pago.reciboPdfData || data.reciboPdfNombre);
    data.reciboPdfUrl = data.id ? construirUrlRecibo(req, data.id) : null;
    return data;
}

async function obtenerConfiguracion(req, res) {
    return res.json({
        ok: true,
        data: {
            banco: process.env.PAGOS_BANCO || 'BANCO AZTECA',
            titular: process.env.PAGOS_TITULAR || 'MARIA DEL ROCIO BAHENA JUAREZ',
            cuenta: process.env.PAGOS_CUENTA || '00002128412440',
            clabe: process.env.PAGOS_CLABE || '127320021284124409',
            tarjeta: datoTransferencia(process.env.PAGOS_TARJETA, '4027666123124884'),
            referencia: process.env.PAGOS_REFERENCIA || 'NOMBRE DE CALLE Y NUMERO DE CASA',
            mantenimiento: {
                montoBase: BASE_MANTENIMIENTO,
                diaLimite: DIA_LIMITE,
                recargoTardio: RECARGO_TARDIO
            },
            moneda: 'MXN',
            legal: {
                titulo: 'Fundamento y aviso de cuotas',
                texto: 'Pendiente de incorporar el artículo legal indicado por la administración.'
            }
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

        const folio = typeof req.query.folio === 'string'
            ? req.query.folio.trim().slice(0, 60)
            : '';

        const pagos = await PagoReportado.findAll({
            where: {
                casaId: req.usuario.casaId,
                ...(folio && { reciboFolio: folio })
            },
            include: [{
                model: CuotaExtraordinaria,
                as: 'cuotaExtraordinaria',
                required: false,
                attributes: ['id', 'concepto', 'monto']
            }],
            attributes: {
                exclude: ['comprobanteData', 'textoOcr', 'reciboPdfData']
            },
            order: [['creadoEn', 'DESC']],
            limit: 100, attributes: { exclude: ['comprobanteData', 'textoOcr', 'reciboPdfData'] }
        });

        return res.json({
            ok: true,
            total: pagos.length,
            data: pagos.map(pago => pagoSeguro(req, pago))
        });
    } catch (error) {
        console.error('Error al listar pagos reportados:', error);
        return res.status(500).json({
            ok: false,
            message: 'No fue posible consultar tus recibos',
            error: process.env.NODE_ENV === 'development'
                ? error.message
                : undefined
        });
    }
}

async function listarCuotasExtraordinarias(req, res) {
    try {
        const data = await CuotaExtraordinaria.findAll({
            where: { activo: true },
            order: [['creadoEn', 'DESC']]
        });

        return res.json({ ok: true, data });
    } catch (error) {
        console.error('Error al listar cuotas extraordinarias:', error);
        return res.status(500).json({
            ok: false,
            message: 'No fue posible consultar las cuotas extraordinarias'
        });
    }
}

async function crearCuotaExtraordinaria(req, res) {
    try {
        const concepto = limpiarTexto(req.body.concepto, 300);
        const monto = Number(req.body.monto);

        if (!concepto) {
            return res.status(400).json({
                ok: false,
                message: 'El concepto es obligatorio'
            });
        }

        if (!Number.isFinite(monto) || monto <= 0) {
            return res.status(400).json({
                ok: false,
                message: 'El monto debe ser mayor que cero'
            });
        }

        const cuota = await CuotaExtraordinaria.create({
            concepto,
            monto,
            activo: true,
            creadoPorUsuarioId: req.usuario.usuarioId || null
        });

        return res.status(201).json({
            ok: true,
            message: 'Cuota extraordinaria creada',
            data: cuota
        });
    } catch (error) {
        console.error('Error al crear cuota extraordinaria:', error);
        return res.status(500).json({
            ok: false,
            message: 'No fue posible crear la cuota extraordinaria'
        });
    }
}

async function desactivarCuotaExtraordinaria(req, res) {
    try {
        const cuota = await CuotaExtraordinaria.findByPk(req.params.id);

        if (!cuota) {
            return res.status(404).json({
                ok: false,
                message: 'Cuota extraordinaria no encontrada'
            });
        }

        await cuota.update({
            activo: false,
            actualizadoEn: new Date()
        });

        return res.json({
            ok: true,
            message: 'Cuota extraordinaria archivada'
        });
    } catch (error) {
        console.error('Error al archivar cuota extraordinaria:', error);
        return res.status(500).json({
            ok: false,
            message: 'No fue posible archivar la cuota extraordinaria'
        });
    }
}

async function reportarPago(req, res) {
    let transaction;

    try {
        const casaId = Number(req.usuario.casaId);
        const usuarioId = Number(req.usuario.usuarioId);

        if (!casaId || !usuarioId) {
            return res.status(400).json({
                ok: false,
                message: 'Tu sesión no tiene una vivienda asociada'
            });
        }

        const tipoPago = String(req.body.tipoPago || 'MANTENIMIENTO').toUpperCase();

        if (!['MANTENIMIENTO', 'EXTRAORDINARIO'].includes(tipoPago)) {
            return res.status(400).json({
                ok: false,
                message: 'Tipo de pago no válido'
            });
        }

        const folioOperacion = limpiarTexto(req.body.folioOperacion, 180);
        const fechaOperacion = limpiarTexto(req.body.fechaOperacion, 10);
        const horaOperacion = limpiarTexto(req.body.horaOperacion, 8);
        const monto = centavos(req.body.monto) / 100;
        const comprobanteData = String(req.body.comprobanteData || '');
        const textoOcr = limpiarTexto(req.body.textoOcr, 12000);
        const comprobanteNombre = limpiarTexto(req.body.comprobanteNombre, 255);
        const comprobanteMime = limpiarTexto(req.body.comprobanteMime, 100);

        if (!folioOperacion || !fechaOperacion || !horaOperacion) {
            return res.status(400).json({
                ok: false,
                message: 'Folio, fecha y hora de operación son obligatorios'
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

        if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(comprobanteData)) {
            return res.status(400).json({
                ok: false,
                message: 'Adjunta una imagen o PDF válido; los PDF se procesan como imagen de su primera página'
            });
        }

        if (comprobanteData.length > 1500000) {
            return res.status(413).json({
                ok: false,
                message: 'El comprobante procesado es demasiado grande'
            });
        }

        const existente = await PagoReportado.findOne({
            where: { folioOperacion }
        });

        if (existente) {
            return res.status(409).json({
                ok: false,
                message: 'Ese folio de operación ya fue reportado'
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
                message: 'No fue posible localizar tu vivienda'
            });
        }

        let cuotaExtraordinaria = null;
        let requerido;
        let recargo = 0;
        let concepto;

        if (tipoPago === 'EXTRAORDINARIO') {
            const extraId = Number(req.body.cuotaExtraordinariaId);

            if (!Number.isInteger(extraId) || extraId <= 0) {
                return res.status(400).json({
                    ok: false,
                    message: 'Selecciona una cuota extraordinaria'
                });
            }

            cuotaExtraordinaria = await CuotaExtraordinaria.findOne({
                where: {
                    id: extraId,
                    activo: true
                }
            });

            if (!cuotaExtraordinaria) {
                return res.status(404).json({
                    ok: false,
                    message: 'La cuota extraordinaria ya no está disponible'
                });
            }

            requerido = Number(cuotaExtraordinaria.monto);
            concepto = 'Pago extraordinario correspondiente a ' + cuotaExtraordinaria.concepto;
        } else {
            const rule = montoMantenimiento(fechaOperacion);

            if (!rule) {
                return res.status(400).json({
                    ok: false,
                    message: 'Fecha de operación no válida'
                });
            }

            requerido = rule.total;
            recargo = rule.recargo;
            concepto = conceptoMantenimiento();
        }

        if (!Number.isFinite(monto) || monto <= 0 || (tipoPago === 'EXTRAORDINARIO' && Math.abs(monto - requerido) > 0.009)) {
            return res.status(400).json({
                ok: false,
                message: tipoPago === 'MANTENIMIENTO' ? 'El importe debe ser mayor que cero' : 'El comprobante debe corresponder exactamente a $' + requerido.toFixed(2) + ' MXN para este concepto'
            });
        }

        transaction = await sequelize.transaction();

        const year = new Date().getFullYear();
        const folio = await generarSiguienteFolio(year, transaction);
        const now = new Date();

        const pago = await PagoReportado.create({
            casaId,
            usuarioId,
            tipoPago,
            cuotaExtraordinariaId: cuotaExtraordinaria?.id || null,
            folioReporte: folio,
            folioOperacion,
            fechaOperacion,
            horaOperacion: horaOperacion.length === 5
                ? horaOperacion + ':00'
                : horaOperacion,
            concepto,
            monto,
            montoRequerido: requerido,
            recargo: Math.min(recargo, monto),
            calleSnapshot: casa.calle,
            numeroCasaSnapshot: casa.numero,
            nombreReportante: nombreCompleto(usuario) || 'Residente',
            comprobanteData,
            comprobanteNombre: comprobanteNombre || null,
            comprobanteMime: comprobanteMime || 'image/jpeg',
            textoOcr: textoOcr || null,
            estatus: 'PENDIENTE_VALIDACION',
            reciboFolio: folio,
            fechaEmisionRecibo: now
        }, { transaction });

        await transaction.commit();
        transaction = null;

        const pagoCompleto = await PagoReportado.findByPk(pago.id, {
            include: [{
                model: CuotaExtraordinaria,
                as: 'cuotaExtraordinaria',
                required: false,
                attributes: ['id', 'concepto', 'monto']
            }]
        });

        try {
            const pdf = await generarReciboPagoReportado(pagoCompleto);
            const reciboPdfUrl = construirUrlRecibo(req, pagoCompleto.id);

            await pagoCompleto.update({
                reciboPdfUrl,
                reciboPdfData: pdf.buffer,
                reciboPdfNombre: pdf.fileName,
                reciboPdfMime: pdf.mimeType,
                actualizadoEn: new Date()
            });
        } catch (pdfError) {
            console.error('Pago guardado; error al generar recibo:', pdfError);
        }

        return res.status(201).json({
            ok: true,
            message: 'Pago reportado y recibo generado',
            data: pagoSeguro(req, pagoCompleto)
        });
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }

        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({
                ok: false,
                message: 'Este comprobante ya fue registrado'
            });
        }

        console.error('Error al reportar pago:', error);
        return res.status(error.status || 500).json({
            ok: false,
            message: error.status ? error.message : 'No fue posible registrar el comprobante de pago',
            error: process.env.NODE_ENV === 'development'
                ? error.message
                : undefined
        });
    }
}

async function descargarRecibo(req, res) {
    try {
        const pago = await PagoReportado.findOne({
            where: {
                id: Number(req.params.id),
                casaId: req.usuario.casaId
            },
            include: [{
                model: CuotaExtraordinaria,
                as: 'cuotaExtraordinaria',
                required: false,
                attributes: ['id', 'concepto', 'monto']
            }]
        });

        if (!pago) {
            return res.status(404).json({
                ok: false,
                message: 'Recibo no encontrado'
            });
        }

        // Compatibilidad con recibos creados antes de guardar PDFs en MySQL:
        // se regeneran una sola vez y quedan persistidos en la base de datos.
        if (!pago.reciboPdfData) {
            const pdf = await generarReciboPagoReportado(pago);
            await pago.update({
                reciboPdfData: pdf.buffer,
                reciboPdfNombre: pdf.fileName,
                reciboPdfMime: pdf.mimeType,
                reciboPdfUrl: construirUrlRecibo(req, pago.id),
                actualizadoEn: new Date()
            });
        }

        const fileName = pago.reciboPdfNombre ||
            ('Recibo_' + (pago.reciboFolio || pago.id) + '.pdf');

        res.setHeader('Content-Type', pago.reciboPdfMime || 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            'inline; filename="' + fileName.replace(/"/g, '') + '"'
        );
        res.setHeader('Cache-Control', 'private, max-age=300');

        return res.send(pago.reciboPdfData);
    } catch (error) {
        console.error('Error al descargar recibo PDF:', error);
        return res.status(500).json({
            ok: false,
            message: 'No fue posible abrir el recibo'
        });
    }
}

async function obtenerComprobantePropio(req,res){
 try{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<1||!req.usuario.casaId)return res.status(404).json({ok:false,message:'Comprobante no encontrado'});
  const row=await PagoReportado.findOne({where:{id,casaId:req.usuario.casaId},attributes:['id','comprobanteData','comprobanteNombre','comprobanteMime']});
  if(!row)return res.status(404).json({ok:false,message:'Comprobante no encontrado'});
  res.setHeader('Cache-Control','private, no-store');
  return res.json({ok:true,data:{comprobanteData:row.comprobanteData,comprobanteNombre:row.comprobanteNombre,comprobanteMime:row.comprobanteMime}});
 }catch(e){console.error('Comprobante propio:',e);return res.status(503).json({ok:false,message:'No fue posible consultar el comprobante'});}
}
module.exports = {
    obtenerConfiguracion,
    listarMisPagos,
    listarCuotasExtraordinarias,
    crearCuotaExtraordinaria,
    desactivarCuotaExtraordinaria,
    reportarPago,
    descargarRecibo, obtenerComprobantePropio, obtenerVigencia, inicializarVigencia, listarPendientes, revisarPago, obtenerComprobante
};

async function obtenerVigencia(req, res) {
    try {
        if (!req.usuario.casaId) return res.status(400).json({ ok: false, message: 'Selecciona una vivienda' });
        return res.json({ ok: true, data: vigenciaService.resumen(await vigenciaService.Vigencia.findByPk(req.usuario.casaId)) });
    } catch (error) { return res.status(503).json({ ok: false, message: 'No fue posible consultar la vigencia' }); }
}
async function inicializarVigencia(req, res) {
    try {
        const casaId = Number(req.params.casaId);
        if (!Number.isSafeInteger(casaId) || casaId <= 0) throw Object.assign(new Error('Vivienda inválida'), { status: 400 });
        const row = await sequelize.transaction({ isolationLevel: 'READ COMMITTED' }, transaction =>
            vigenciaService.inicializar(casaId, req.body.fechaFinal, BASE_MANTENIMIENTO, req.usuario.usuarioId, transaction));
        return res.json({ ok: true, data: vigenciaService.resumen(row) });
    } catch (error) { return res.status(error.status || 503).json({ ok: false, message: error.status ? error.message : 'No fue posible configurar la vigencia' }); }
}
async function listarPendientes(req, res) {
    try {
        const rows = await PagoReportado.findAll({ where: { estatus: 'PENDIENTE_VALIDACION' }, order: [['creadoEn', 'ASC']], limit: 100, attributes: { exclude: ['comprobanteData', 'textoOcr', 'reciboPdfData'] } });
        return res.json({ ok: true, data: rows.map(row => pagoSeguro(req, row)) });
    } catch (error) { return res.status(503).json({ ok: false, message: 'No fue posible consultar los comprobantes pendientes' }); }
}
async function revisarPago(req, res) {
    try {
        if (!['VALIDADO', 'RECHAZADO'].includes(req.body.estatus)) throw Object.assign(new Error('Estado de revisión inválido'), { status: 400 });
        const result = await sequelize.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
            const pago = await PagoReportado.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!pago) throw Object.assign(new Error('Pago no encontrado'), { status: 404 });
            if (pago.estatus !== 'PENDIENTE_VALIDACION') {
                if (pago.estatus !== req.body.estatus) throw Object.assign(new Error('El pago ya tiene otra resolución'), { status: 409 });
                return { pago: pagoSeguro(req, pago), vigencia: vigenciaService.resumen(await vigenciaService.Vigencia.findByPk(pago.casaId, { transaction })) };
            }
            const recargo = req.body.recargo === undefined ? pago.recargo : req.body.recargo;
            if (centavos(recargo) > centavos(pago.monto)) throw Object.assign(new Error('El recargo no puede superar el pago'), { status: 400 });
            if (pago.tipoPago === 'EXTRAORDINARIO' && centavos(recargo) !== 0) throw Object.assign(new Error('La cuota extraordinaria no lleva recargo de mantenimiento'), { status: 400 });
            await pago.update({ estatus: req.body.estatus, recargo, validadoPorUsuarioId: req.usuario.usuarioId,
                fechaValidacion: new Date(), actualizadoEn: new Date(), observacionesRevision: limpiarTexto(req.body.observaciones, 600) }, { transaction });
            const vigencia = pago.tipoPago === 'MANTENIMIENTO' && pago.estatus === 'VALIDADO'
                ? await vigenciaService.actualizar(pago.casaId, req.usuario.usuarioId, transaction) : null;
            return { pago: pagoSeguro(req, pago), vigencia };
        });
        return res.json({ ok: true, data: result });
    } catch (error) { return res.status(error.status || 503).json({ ok: false, message: error.status ? error.message : 'No fue posible revisar el pago' }); }
}

async function obtenerComprobante(req, res) {
    try {
        const row = await PagoReportado.findByPk(req.params.id, { attributes: ['id', 'comprobanteData'] });
        if (!row) return res.status(404).json({ ok: false, message: 'Comprobante no encontrado' });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ ok: true, data: { comprobanteData: row.comprobanteData } });
    } catch (error) { return res.status(503).json({ ok: false, message: 'No fue posible consultar el comprobante' }); }
}
