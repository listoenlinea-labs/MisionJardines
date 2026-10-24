const sequelize = require('../config/database');
const {
    PagoReportado,
    Casa,
    Usuario,
    CuotaExtraordinaria
} = require('../models');
const {CargoExtraordinario,PagoManualConcepto}=require('../models');
const ReservaCasaClub=require('../models/ReservaCasaClub');
const {estadoCargos}=require('../services/cargos-extraordinarios.service');
const {consultarAdeudos}=require('../services/adeudos-comunidad.service');
const {fechaMexico}=require('../services/vigencia-calculo');
const {validarOperacion}=require('../services/mensualidades-mantenimiento');
const {resolverFechaCapturada}=require('../services/fecha-operativa-spei.service');
const { generarSiguienteFolio } = require('../services/folios.service');
const { generarReciboPagoReportado } = require('../services/pago-reportado-pdf.service');

const vigenciaService = require('../services/vigencia-mantenimiento.service');
const { centavos } = require('../services/vigencia-calculo');
const cuotasMantenimiento = require('../services/cuotas-mantenimiento.service');
const { comprobarDestino } = require('../services/comprobante-lector.service');
const idsBanco = require('../services/identificadores-bancarios.service');
const { verificarPosibilidad } = require('../services/verificar-comprobante-identificadores.service');
const BASE_MANTENIMIENTO = 300;
const {tarifaParaCasa}=require('../services/tarifa-mantenimiento.service');
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

function conceptoMantenimiento() {
    return 'Pago de mantenimiento (abono o mensualidades)';
}

function pagoSeguro(req, pago) {
    const data = pago.toJSON ? pago.toJSON() : { ...pago };
    delete data.comprobanteData;
    delete data.textoOcr;
    delete data.reciboPdfData;
    delete data.correoBancarioHash;
    data.tieneComprobante = true;
    data.tieneReciboPdf = Boolean(pago.reciboPdfData || data.reciboPdfNombre);
    data.reciboPdfUrl = data.id ? construirUrlRecibo(req, data.id) : null;
    return data;
}

async function obtenerConfiguracion(req, res) {
    const casa=req.usuario?.casaId?await Casa.findByPk(req.usuario.casaId):null;
    res.setHeader('Cache-Control','private, no-store');
    return res.json({
        ok: true,
        data: {
            banco: process.env.PAGOS_BANCO || 'BANCO AZTECA',
            titular: process.env.PAGOS_TITULAR || 'MARIA DEL ROCIO BAHENA JUAREZ',
            cuenta: process.env.PAGOS_CUENTA || '00002128412440',
            clabe: process.env.PAGOS_CLABE || '127320021284124409',
            destinoUltimos4: process.env.PAGOS_DESTINO_ULTIMOS4 || '4409',
            tarjeta: datoTransferencia(process.env.PAGOS_TARJETA, '4027666123124884'),
            referencia: process.env.PAGOS_REFERENCIA || 'NOMBRE DE CALLE Y NUMERO DE CASA',
            mantenimiento: {
                montoBase: casa?tarifaParaCasa(casa):BASE_MANTENIMIENTO,
                diaLimite: DIA_LIMITE,
                recargoTardio: casa&&require('../services/recargos-exenciones.service').activo(casa.exencionesRecargo)?0:RECARGO_TARDIO
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
            include: [
                { model: Casa, as: 'casa', required: false, attributes: ['id', 'calle', 'calleCorrecta', 'numero'] },
                {
                    model: CuotaExtraordinaria,
                    as: 'cuotaExtraordinaria',
                    required: false,
                    attributes: ['id', 'concepto', 'monto']
                }
            ],
            attributes: {
                exclude: ['comprobanteData', 'textoOcr', 'reciboPdfData', 'identificadoresVerificados']
            },
            order: [['creadoEn', 'DESC']],
            limit: 100, attributes: { exclude: ['comprobanteData', 'textoOcr', 'reciboPdfData', 'identificadoresVerificados'] }
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
        if(!req.usuario.casaId)return res.status(400).json({ok:false,message:'Selecciona una vivienda'});
        const data=await estadoCargos(req.usuario.casaId);
        return res.json({ ok: true, data:data.filter(c=>c.estado!=='PAGADO') });
    } catch (error) {
        console.error('Error al listar cuotas extraordinarias:', error);
        return res.status(500).json({
            ok: false,
            message: 'No fue posible consultar las cuotas extraordinarias'
        });
    }
}

async function crearCuotaExtraordinaria(req, res) {
    return res.status(409).json({ok:false,message:'Las cuotas se generan al registrar un egreso de categoría Cuota extraordinaria en Análisis de cuotas. Así se conserva el proyecto y sus 231 cargos.'});
}

async function obtenerAdeudos(req,res){
 try{
  if(!req.usuario.casaId)return res.json({ok:true,data:{cantidad:0,total:0,tipos:{MANTENIMIENTO:[],EXTRAORDINARIO:[],CASA_CLUB:[]},totales:{}}});
  const data=await consultarAdeudos(req.usuario.casaId);
  res.setHeader('Cache-Control','private, no-store');
  return res.json({ok:true,data});
 }catch(e){console.error('[adeudos]',e);return res.status(503).json({ok:false,message:'No fue posible consultar los adeudos. Reintenta antes de reservar.'});}
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

        if (!['MANTENIMIENTO', 'EXTRAORDINARIO', 'CASA_CLUB'].includes(tipoPago)) {
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
        // El texto OCR enviado por el navegador no constituye una verificación bancaria.
        // El servidor debe leer la imagen de nuevo antes de guardar el comprobante.
        let textoOcr = '';
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

        // La fecha del comprobante puede ser el siguiente día operativo bancario
        // (inclusive feriados). No proyectar recargos hacia días aún no transcurridos.
        let fechaCalculoMantenimiento = fechaOperacion;
        if (tipoPago === 'MANTENIMIENTO') {
            const hoy = fechaMexico();
            fechaCalculoMantenimiento = fechaOperacion > hoy ? hoy : fechaOperacion;
            validarOperacion(fechaCalculoMantenimiento, hoy);
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

        const comprobado = await comprobarDestino({
            comprobanteData, folioOperacion, fechaOperacion, horaOperacion, monto,
            exigirCampos: !['SUPER_ADMIN', 'ADMINISTRADOR'].includes(req.usuario.rol)
        });
        textoOcr = comprobado.texto;
        // Conservar lo que leyó y validó el OCR DEL SERVIDOR en el momento
        // del reporte. No depender de volver a interpretar el texto meses
        // después, cuando las expresiones regulares puedan haber cambiado.
        const identificadoresVerificados = idsBanco.almacenarVerificados(
            comprobado.extraido, folioOperacion
        );

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

        // Antes de crear otro acuse pendiente, exigir evidencia que el correo
        // bancario pueda contrastar: clave o referencia; el folio solo si el
        // aviso autenticado realmente publica ESE mismo folio.
        await verificarPosibilidad({textoOcr,casa,fechaOperacion,horaOperacion,monto});

        let cuotaExtraordinaria = null;
        let cargoExtraordinario = null;
        let reservaCasaClub = null;
        let cortesRecargo = null;
        let aplicacionCuotas = null;
        let requerido;
        let recargo = 0;
        let concepto;

        if (tipoPago === 'EXTRAORDINARIO') {
            const extraId = Number(req.body.cargoExtraordinarioId);

            if (!Number.isInteger(extraId) || extraId <= 0) {
                return res.status(400).json({
                    ok: false,
                    message: 'Selecciona una mensualidad extraordinaria pendiente'
                });
            }

            cargoExtraordinario=await CargoExtraordinario.findOne({where:{id:extraId,casaId},include:[{model:CuotaExtraordinaria,as:'cuota',required:true,where:{activo:true}}]});
            cuotaExtraordinaria=cargoExtraordinario?.cuota;

            if (!cuotaExtraordinaria) {
                return res.status(404).json({
                    ok: false,
                    message: 'La cuota extraordinaria ya no está disponible'
                });
            }

            requerido = Number(cargoExtraordinario.monto);
            concepto = 'Cuota extraordinaria: ' + cuotaExtraordinaria.concepto+' · '+cargoExtraordinario.periodo.slice(0,7);
        } else if(tipoPago==='CASA_CLUB'){
            const reservaId=Number(req.body.reservaCasaClubId);
            reservaCasaClub=await ReservaCasaClub.findOne({where:{id:reservaId,casaId,estatus:'APROBADA',pagado:false}});
            if(!reservaCasaClub)return res.status(404).json({ok:false,message:'No existe una reserva aprobada y pendiente para esta vivienda'});
            if(!reservaCasaClub.fechaLimitePago||fechaMexico()>reservaCasaClub.fechaLimitePago||fechaOperacion>reservaCasaClub.fechaLimitePago)
                return res.status(409).json({ok:false,message:'Venció el plazo para subir el comprobante de casa club'});
            requerido=Number(reservaCasaClub.cuotaRecuperacion)+Number(reservaCasaClub.depositoGarantia)+Number(reservaCasaClub.limpieza);
            concepto='Casa club · '+reservaCasaClub.fecha+' (renta $'+reservaCasaClub.cuotaRecuperacion+', depósito $'+reservaCasaClub.depositoGarantia+', limpieza $'+reservaCasaClub.limpieza+')';
        } else {
            // Validar en el backend, no confiar en importes del navegador ni OCR.
            // El recibo solo registra una solicitud: hasta validar contra el banco
            // no se activan TAGs físicos.
            transaction = await sequelize.transaction({ isolationLevel: 'READ COMMITTED' });
            const rule = await cuotasMantenimiento.cotizar(casaId, fechaCalculoMantenimiento, req.body.monto, transaction);
            aplicacionCuotas = rule;
            cortesRecargo = rule.cortesRecargo;
            requerido = rule.total;
            recargo = rule.recargo;
            concepto = (rule.abonoParcial ? 'Abono parcial de mantenimiento: sin avance de vigencia. Faltan $' + rule.faltante.toFixed(2) + ' para completar una mensualidad. ' : 'Mantenimiento: ' + rule.meses + ' mensualidad(es) ') +
                '(mensualidades consecutivas desde el último corte cubierto). ' +
                (rule.recargo > 0 ? 'Recargos por ' + cortesRecargo.length + ' corte(s) vencido(s): $' + rule.recargo + '.' : 'Sin recargos pendientes.');
        }

        if (!Number.isFinite(monto) || monto <= 0 || (tipoPago !== 'MANTENIMIENTO' && Math.abs(monto - requerido) > 0.009)) {
            return res.status(400).json({
                ok: false,
                message: tipoPago === 'MANTENIMIENTO' ? 'El importe debe ser mayor que cero' : 'El comprobante debe corresponder exactamente a $' + requerido.toFixed(2) + ' MXN para este concepto'
            });
        }

        if (!transaction) transaction = await sequelize.transaction();
        if(cargoExtraordinario||reservaCasaClub){
          if(cargoExtraordinario)await CargoExtraordinario.findByPk(cargoExtraordinario.id,{transaction,lock:transaction.LOCK.UPDATE});
          if(reservaCasaClub){
            const locked=await ReservaCasaClub.findByPk(reservaCasaClub.id,{transaction,lock:transaction.LOCK.UPDATE});
            if(!locked||locked.estatus!=='APROBADA'||locked.pagado||fechaMexico()>locked.fechaLimitePago){const e=new Error('La reservación ya no está vigente para pagar');e.status=409;throw e;}
          }
          // El comprobante pendiente ya bloquea ese cargo; no duplicar folios.
          const where=cargoExtraordinario?{cargoExtraordinarioId:cargoExtraordinario.id}:{reservaCasaClubId:reservaCasaClub.id};
          const existenteConcepto=await PagoReportado.findOne({where:{...where,estatus:{[require('sequelize').Op.in]:['PENDIENTE_VALIDACION','VALIDADO']}},transaction});
          const manual=await PagoManualConcepto.findOne({where:cargoExtraordinario?{cargoExtraordinarioId:cargoExtraordinario.id}:{reservaCasaClubId:reservaCasaClub.id},transaction});
          if(existenteConcepto||manual){const e=new Error('Este concepto ya tiene un pago registrado o pendiente de validación');e.status=409;throw e;}
        }

        const year = new Date().getFullYear();
        const folio = await generarSiguienteFolio(year, transaction);
        const now = new Date();

        const pago = await PagoReportado.create({
            casaId,
            usuarioId,
            tipoPago,
            cuotaExtraordinariaId: cuotaExtraordinaria?.id || null,
            cargoExtraordinarioId:cargoExtraordinario?.id||null,
            reservaCasaClubId:reservaCasaClub?.id||null,
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
            cortesRecargo,
            aplicacionCuotas,
            calleSnapshot: casa.calle,
            numeroCasaSnapshot: casa.numero,
            nombreReportante: nombreCompleto(usuario) || 'Residente',
            comprobanteData,
            comprobanteNombre: comprobanteNombre || null,
            comprobanteMime: comprobanteMime || 'image/jpeg',
            textoOcr: textoOcr || null,
            identificadoresVerificados,
            estatus: 'PENDIENTE_VALIDACION',
            verificacionBancaria: {version:1,etapa:'RECIBIDO',detalle:'Comprobante recibido. Se extrajeron los datos bancarios y se programó su conciliación con Titan.',fechaRevision:null,avisosConsultados:0,avisosAutenticados:0,coincidencias:0},
            reciboFolio: folio,
            fechaEmisionRecibo: now
        }, { transaction });


        await transaction.commit();
        transaction = null;
        // No bloquear la respuesta: primero aparece en MIS RECIBOS como EN REVISIÓN.
        // La conciliación procesa únicamente depósitos cuya evidencia sea inequívoca.
        if (process.env.PAGOS_BANK_AUTO_VALIDATE==='true') {
            try { require('../services/banco-correo-worker.service').programarRevision(); }
            catch (error) { console.error('[Bancos] No fue posible programar revisión:',error.message); }
        }

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
            message: 'Pago reportado y en revisión bancaria automática',
            data: pagoSeguro(req, pagoCompleto),
            vigencia: null
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
            code: error.status ? error.code : undefined,
            camposFaltantes: error.status ? error.camposFaltantes : undefined,
            camposCorreo: error.status ? error.camposCorreo : undefined,
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
        if (!pago.reciboPdfData || (pago.estatus === 'VALIDADO' && String(pago.reciboPdfNombre||'').startsWith('Acuse_Revision_'))) {
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
module.exports = { confirmarPagoDesdeBanco,
    obtenerConfiguracion,
    listarMisPagos,
    listarCuotasExtraordinarias,
    crearCuotaExtraordinaria,
    obtenerAdeudos,
    desactivarCuotaExtraordinaria,
    reportarPago,
    descargarRecibo, obtenerComprobantePropio, cotizacionMantenimiento, obtenerVigencia, inicializarVigencia, listarPendientes, obtenerComprobante
};

async function obtenerVigencia(req, res) {
    try {
        if (!req.usuario.casaId) return res.status(400).json({ ok: false, message: 'Selecciona una vivienda' });
        return res.json({ ok: true, data: await sequelize.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
            const {cuotas,tarifa,exencionesRecargo}=await cuotasMantenimiento.cargar(req.usuario.casaId,transaction);
            return require('../services/cuotas-mantenimiento-calculo').contextoCuotas(cuotas,fechaMexico(),tarifa,exencionesRecargo);
        }) });
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
        const rows = await PagoReportado.findAll({ where: { estatus: 'PENDIENTE_VALIDACION' }, include: [{ model: Casa, as: 'casa', required: false, attributes: ['id', 'calle', 'calleCorrecta', 'numero'] }], order: [['creadoEn', 'ASC']], limit: 100, attributes: { exclude: ['comprobanteData', 'textoOcr', 'reciboPdfData', 'identificadoresVerificados'] } });
        return res.json({ ok: true, data: rows.map(row => pagoSeguro(req, row)) });
    } catch (error) { return res.status(503).json({ ok: false, message: 'No fue posible consultar los comprobantes pendientes' }); }
}
// Única vía para validar un comprobante reportado: conciliación contra el buzón.
async function confirmarPagoDesdeBanco(pagoId, correoHash) {
    if (!Number.isSafeInteger(Number(pagoId)) || Number(pagoId) <= 0
        || typeof correoHash !== 'string' || !/^[a-f0-9]{64}$/.test(correoHash))
        throw Object.assign(new Error('Confirmación bancaria inválida'), { status: 400 });
    return sequelize.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
            const pago = await PagoReportado.findByPk(pagoId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!pago) throw Object.assign(new Error('Pago no encontrado'), { status: 404 });
            if (pago.estatus !== 'PENDIENTE_VALIDACION')
                throw Object.assign(new Error('El pago ya no está pendiente de validación bancaria'), { status: 409 });
            // El recargo calculado al reportar el pago queda protegido.
            const recargo = pago.recargo;
            if (centavos(recargo) > centavos(pago.monto)) throw Object.assign(new Error('El recargo no puede superar el pago'), { status: 400 });
            if (pago.tipoPago !== 'MANTENIMIENTO' && centavos(recargo) !== 0) throw Object.assign(new Error('Este concepto no lleva recargo de mantenimiento'), { status: 400 });
            await pago.update({ estatus: 'VALIDADO', recargo, correoBancarioHash: correoHash, validadoPorUsuarioId: null,
                fechaValidacion: new Date(), actualizadoEn: new Date(),
                verificacionBancaria: {...(pago.verificacionBancaria||{}),version:1,etapa:'VALIDADO',
                  fechaRevision:new Date().toISOString(),
                  detalle:'Pago confirmado: coincidieron los identificadores, el importe, la fecha bancaria, la cuenta y la vivienda en una notificación bancaria autenticada.'},
                observacionesRevision: 'Validado automáticamente por coincidencia de notificación bancaria autenticada.' }, { transaction });
            const vigencia = pago.tipoPago === 'MANTENIMIENTO'
                ? await cuotasMantenimiento.confirmar(pago, transaction) : null;
            if(pago.tipoPago==='CASA_CLUB' && pago.estatus==='VALIDADO'){
                const reserva=await ReservaCasaClub.findByPk(pago.reservaCasaClubId,{transaction,lock:transaction.LOCK.UPDATE});
                if(!reserva||reserva.estatus!=='APROBADA'||reserva.pagado)throw Object.assign(new Error('La reserva ya cambió de estado. Requiere conciliación.'),{status:409});
                await reserva.update({pagado:true,fechaPago:pago.fechaOperacion,folio:pago.folioOperacion,actualizadoEn:new Date()},{transaction});
            }
            return { pago: pago, vigencia };
        });
}

async function obtenerComprobante(req, res) {
    try {
        const row = await PagoReportado.findByPk(req.params.id, { attributes: ['id', 'comprobanteData'] });
        if (!row) return res.status(404).json({ ok: false, message: 'Comprobante no encontrado' });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ ok: true, data: { comprobanteData: row.comprobanteData } });
    } catch (error) { return res.status(503).json({ ok: false, message: 'No fue posible consultar el comprobante' }); }
}

async function cotizacionMantenimiento(req,res) {
    try {
        if (!req.usuario.casaId) return res.status(400).json({ ok:false, message:'Selecciona una vivienda' });
        const hoy = fechaMexico();
        const resuelta = resolverFechaCapturada(req.query.fechaOperacion, req.query.horaOperacion);
        if (!resuelta.ok) return res.status(400).json({ok:false,message:resuelta.mensaje});
        const fechaReportada = resuelta.fechaOperacion;
        // Cobrar solo cortes efectivamente vencidos a la fecha de hoy.
        const fechaCalculo = validarOperacion(fechaReportada > hoy ? hoy : fechaReportada, hoy);
        const data = await sequelize.transaction({ isolationLevel:'READ COMMITTED' }, transaction =>
            cuotasMantenimiento.cotizar(req.usuario.casaId, fechaCalculo, req.query.monto || null, transaction));
        data.fechaHoy = hoy;
        data.fechaOperacionReal = fechaReportada;
        data.fechaComprobante = resuelta.fechaComprobante;
        data.fechaCalculoRecargos = fechaCalculo;
        data.fechaPosterior = fechaReportada > hoy;
        data.ajusteSpei = resuelta.ajusteSpei;
        res.setHeader('Cache-Control','private, no-store');
        return res.json({ ok:true, data });
    } catch (e) { return res.status(e.status || 503).json({ ok:false, message:e.status ? e.message : 'No fue posible consultar las cuotas de la vivienda. Intenta nuevamente.' }); }
}
