'use strict';

const { createHash } = require('node:crypto');
const { Op } = require('sequelize');
const { Casa, Cuota, PagoReportado, Condomino, CondominoVivienda, Usuario, UsuarioCasa } = require('../models');
const { historialMantenimiento } = require('./historial-pagos-vivienda.service');
const { generarReciboPdf } = require('./pdf.service');

const errorDeRecibo = (status, message) => Object.assign(new Error(message), { status });
const refNormalizada = value => String(value || '').trim().toLowerCase();

function normalizarTelefonoMX(valor) {
    const digitos = String(valor || '').replace(/\D/g, '');
    if (digitos.length === 10) return '52' + digitos;
    if (digitos.length === 12 && digitos.startsWith('52')) return digitos;
    if (digitos.length === 13 && digitos.startsWith('521')) return '52' + digitos.slice(3);
    return null;
}

function agregarTelefonos(destinatarios, vistos, telefono, nombre, origen) {
    for (const fragmento of String(telefono || '').split(/\s*(?:\/|,|;|\by\b)\s*/i)) {
        const numero = normalizarTelefonoMX(fragmento);
        if (!numero || vistos.has(numero)) continue;
        vistos.add(numero);
        destinatarios.push({ numero, nombre: nombre || 'Contacto registrado', origen });
    }
}

function datosDeMovimiento(casa, cuotas, comprobantes, ahora = new Date()) {
    const movimiento = historialMantenimiento(cuotas, comprobantes)
        .find(item => Number(item.monto) > 0);
    if (!movimiento) {
        throw errorDeRecibo(409, 'Esta vivienda no tiene pagos de mantenimiento registrados para generar un recibo.');
    }
    const referencia = refNormalizada(movimiento.referencia);
    if (!referencia) {
        throw errorDeRecibo(409, 'El último pago no tiene referencia verificable. Concilia el movimiento antes de emitir el recibo.');
    }

    const cuotasDelPago = cuotas.filter(c =>
        [c.referencia, c.folio].some(value => refNormalizada(value) === referencia));
    const comprobante = comprobantes.find(p =>
        [p.folioOperacion, p.folioReporte].some(value => refNormalizada(value) === referencia));
    if (!cuotasDelPago.length && !comprobante) {
        throw errorDeRecibo(409, 'No se encontró el movimiento original correspondiente a la referencia del pago.');
    }

    const cuotaPrincipal = cuotasDelPago[0];
    const periodos = movimiento.periodos || [];
    const primero = periodos[0];
    const ultimo = periodos[periodos.length - 1];
    const nombrePeriodo = periodos.length > 1
        ? `${primero.mes} ${primero.anio} A ${ultimo.mes} ${ultimo.anio}`
        : primero ? `${primero.mes} ${primero.anio}` : 'PAGO REGISTRADO';

    const sello = cuotasDelPago.some(c => c.estatusPago === 'PAGO_PARCIAL')
        ? 'ABONO RECIBIDO' : 'PAGADO';

    // Los registros manuales separan principal y recargos en cuotas;
    // un comprobante bancario validado ya contiene el depósito completo.
    const esRegistroManual = cuotasDelPago.some(c => c.origenImportacion === 'MANUAL_ANALISIS');
    const monto = comprobante ? Number(comprobante.monto) :
        Number(movimiento.monto) + (esRegistroManual ? Number(movimiento.recargo || 0) : 0);
    const fuenteFolio = comprobante?.reciboFolio || cuotaPrincipal?.folio;
    const huella = createHash('sha256')
        .update(`${casa.id}:${referencia}`).digest('hex').slice(0, 10).toUpperCase();
    const folio = fuenteFolio || `MJ-AN-${casa.id}-${huella}`;

    const recibo = {
        folio,
        fechaConfirmacion: ahora,
        nombrePagador: cuotaPrincipal?.nombrePagador || comprobante?.nombreReportante || casa.nombre || 'Residente',
        calleSnapshot: casa.calleCorrecta || casa.calle,
        numeroCasaSnapshot: casa.numero,
        mes: nombrePeriodo,
        periodosVarios: periodos.length > 1,
        montoPagado: monto,
        formaPago: cuotaPrincipal?.formaPago || (comprobante ? 'TRANSFERENCIA' : 'No especificada'),
        referencia: movimiento.referencia,
        sello
    };
    return {
        recibo,
        resumen: {
            casaId: casa.id,
            calle: recibo.calleSnapshot,
            numero: casa.numero,
            nombre: recibo.nombrePagador,
            folio,
            fechaPago: movimiento.fecha,
            monto,
            referencia: movimiento.referencia,
            formaPago: recibo.formaPago,
            periodo: nombrePeriodo,
            sello
        }
    };
}

async function consultarPago(casaId) {
    const casa = await Casa.findByPk(casaId, {
        attributes: ['id', 'calle', 'calleCorrecta', 'numero', 'nombre', 'telefono']
    });
    if (!casa) throw errorDeRecibo(404, 'Vivienda no encontrada');

    const [cuotas, comprobantes] = await Promise.all([
        Cuota.findAll({ where: { casaId }, attributes: [
            'id', 'anio', 'mes', 'nombrePagador', 'montoPagado', 'recargo', 'estatusPago',
            'referencia', 'folio', 'fechaPago', 'fechaConfirmacion', 'formaPago', 'origenImportacion'
        ] }),
        PagoReportado.findAll({
            where: { casaId, tipoPago: 'MANTENIMIENTO', estatus: 'VALIDADO' },
            attributes: ['id', 'tipoPago', 'estatus', 'reciboFolio', 'nombreReportante',
                'monto', 'recargo', 'folioReporte', 'folioOperacion', 'fechaOperacion']
        })
    ]);
    return { casa, ...datosDeMovimiento(casa, cuotas, comprobantes) };
}

async function consultarTelefonos(casa) {
    const destinatarios = [];
    const vistos = new Set();
    agregarTelefonos(destinatarios, vistos, casa.telefono, casa.nombre, 'Vivienda');

    const [vinculos, accesos] = await Promise.all([
        CondominoVivienda.findAll({
            where: { viviendaId: casa.id, activo: true }, attributes: ['condominoId']
        }),
        UsuarioCasa.findAll({
            where: { casaId: casa.id, activo: true }, attributes: ['usuarioId']
        })
    ]);
    const idsCondominos = [...new Set(vinculos.map(v => v.condominoId))];
    const idsUsuarios = [...new Set(accesos.map(v => v.usuarioId))];
    const [condominos, usuarios] = await Promise.all([
        idsCondominos.length ? Condomino.findAll({
            where: { id: { [Op.in]: idsCondominos }, activo: true },
            attributes: ['nombreCompleto', 'telefono']
        }) : [],
        idsUsuarios.length ? Usuario.findAll({
            where: { id: { [Op.in]: idsUsuarios }, estatus: 'ACTIVO', cuentaAceptada: true },
            attributes: ['nombre', 'apellidoPaterno', 'apellidoMaterno', 'telefono']
        }) : []
    ]);
    for (const c of condominos) {
        agregarTelefonos(destinatarios, vistos, c.telefono, c.nombreCompleto, 'Condómino vinculado');
    }
    for (const u of usuarios) {
        agregarTelefonos(destinatarios, vistos, u.telefono,
            [u.nombre, u.apellidoPaterno, u.apellidoMaterno].filter(Boolean).join(' '),
            'Cuenta con acceso activo');
    }
    return destinatarios;
}

async function generarPdf(recibo) {
    return generarReciboPdf(recibo, { enMemoria: true });
}

module.exports = {
    normalizarTelefonoMX,
    datosDeMovimiento,
    consultarPago,
    consultarTelefonos,
    generarPdf
};
