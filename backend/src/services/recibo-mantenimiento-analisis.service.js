'use strict';

const { createHash } = require('node:crypto');
const { Op } = require('sequelize');
const { Casa, Cuota, PagoReportado, Condomino, CondominoVivienda, Usuario, UsuarioCasa } = require('../models');
const { historialMantenimiento } = require('./historial-pagos-vivienda.service');
const { generarReciboPdf } = require('./pdf.service');

const errorDeRecibo = (status, message) => Object.assign(new Error(message), { status });
const refNormalizada = value => String(value || '').trim().toLowerCase();
const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

function periodosPagados(cuotas = []) {
    const registros = new Map();
    for (const cuota of cuotas) {
        const mes = meses.indexOf(String(cuota.mes || '').toUpperCase()) + 1;
        const anio = Number(cuota.anio);
        if (mes < 1 || !Number.isInteger(anio) || Number(cuota.montoPagado) <= 0 ||
            !['PAGADO', 'PAGO_PARCIAL'].includes(String(cuota.estatusPago).toUpperCase())) continue;
        const id = `${anio}-${String(mes).padStart(2, '0')}`;
        registros.set(id, { valor: id, etiqueta: `${meses[mes - 1]} ${anio}` });
    }
    return [...registros.values()].sort((a, b) => b.valor.localeCompare(a.valor));
}

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

function datosDeMovimiento(casa, cuotas, comprobantes, ahora = new Date(), periodoSolicitado = null, referenciaSolicitada = null) {
    const referenciaBuscada = refNormalizada(referenciaSolicitada);
    if (referenciaSolicitada != null && !referenciaBuscada) {
        throw errorDeRecibo(400, 'La referencia del movimiento no es válida.');
    }
    if (referenciaBuscada && periodoSolicitado) {
        throw errorDeRecibo(400, 'Selecciona un período o una referencia, no ambos.');
    }
    const disponibles = periodosPagados(cuotas);
    const periodo = referenciaBuscada ? null : (periodoSolicitado || disponibles[0]?.valor || null);
    if (periodoSolicitado && !disponibles.some(item => item.valor === periodoSolicitado)) {
        throw errorDeRecibo(409, 'El mes seleccionado no tiene un pago registrado para esta vivienda.');
    }
    const cuotaSeleccionada = periodo ? cuotas.find(c => {
        const mes = meses.indexOf(String(c.mes || '').toUpperCase()) + 1;
        return `${c.anio}-${String(mes).padStart(2, '0')}` === periodo &&
            Number(c.montoPagado) > 0 && ['PAGADO', 'PAGO_PARCIAL'].includes(String(c.estatusPago).toUpperCase());
    }) : null;
    if (cuotaSeleccionada && !refNormalizada(cuotaSeleccionada.referencia || cuotaSeleccionada.folio)) {
        throw errorDeRecibo(409, 'El mes seleccionado no tiene referencia verificable. Concilia el pago antes de emitir el recibo.');
    }
    const movimientos = historialMantenimiento(cuotas, comprobantes);
    const movimiento = referenciaBuscada
        ? movimientos.find(item => refNormalizada(item.referencia) === referenciaBuscada && Number(item.monto) > 0)
        : cuotaSeleccionada
            ? movimientos.find(item => [cuotaSeleccionada.referencia, cuotaSeleccionada.folio]
                .some(ref => ref && refNormalizada(ref) === refNormalizada(item.referencia)))
            : movimientos.find(item => Number(item.monto) > 0);
    if (!movimiento) {
        throw errorDeRecibo(409, referenciaBuscada
            ? 'El movimiento seleccionado no tiene un pago de mantenimiento confirmado o ya no existe.'
            : 'Esta vivienda no tiene pagos de mantenimiento conciliados para generar un recibo.');
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

    const cuotaPrincipal = cuotaSeleccionada || cuotasDelPago[0];
    const periodos = cuotaSeleccionada
        ? [{ mes: String(cuotaSeleccionada.mes).toUpperCase(), anio: Number(cuotaSeleccionada.anio) }]
        : movimiento.periodos || [];
    const primero = periodos[0];
    const ultimo = periodos[periodos.length - 1];
    const nombrePeriodo = periodos.length > 1
        ? `${primero.mes} ${primero.anio} A ${ultimo.mes} ${ultimo.anio}`
        : primero ? `${primero.mes} ${primero.anio}` : 'PAGO REGISTRADO';

    const sello = (cuotaSeleccionada ? [cuotaSeleccionada] : cuotasDelPago).some(c => c.estatusPago === 'PAGO_PARCIAL')
        ? 'ABONO RECIBIDO' : 'PAGADO';

    // Los registros manuales separan principal y recargos en cuotas;
    // un comprobante bancario validado ya contiene el depósito completo.
    const esRegistroManual = cuotasDelPago.some(c => c.origenImportacion === 'MANUAL_ANALISIS');
    const recargoMes = cuotaSeleccionada && cuotasDelPago.length === 1
        ? (esRegistroManual ? Number(cuotaSeleccionada.recargo || 0) : Number(comprobante?.recargo || 0))
        : cuotaSeleccionada && esRegistroManual ? Number(cuotaSeleccionada.recargo || 0) : 0;
    const monto = cuotaSeleccionada ? Number(cuotaSeleccionada.montoPagado) + recargoMes
        : comprobante ? Number(comprobante.monto)
            : Number(movimiento.monto) + (esRegistroManual ? Number(movimiento.recargo || 0) : 0);
    const fuenteFolio = comprobante?.reciboFolio || cuotaPrincipal?.folio;
    const huella = createHash('sha256')
        .update(`${casa.id}:${referencia}`).digest('hex').slice(0, 10).toUpperCase();
    // Distintos meses del mismo depósito necesitan folios distintos.
    const folio = cuotaSeleccionada && cuotasDelPago.length > 1
        ? `MJ-AN-${casa.id}-${huella}-${periodo.replace('-', '')}`
        : fuenteFolio || `MJ-AN-${casa.id}-${huella}`;

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
        periodosDisponibles: disponibles,
        periodoSeleccionado: periodo,
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
            sello,
            periodosDisponibles: disponibles,
            periodoSeleccionado: periodo
        }
    };
}

async function consultarPago(casaId, periodo = null, referencia = null) {
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
                'monto', 'recargo', 'folioReporte', 'folioOperacion', 'fechaOperacion', 'aplicacionCuotas']
        })
    ]);
    return { casa, ...datosDeMovimiento(casa, cuotas, comprobantes, new Date(), periodo, referencia) };
}

async function consultarTelefonos(casa) {
    const destinatarios = [];
    const vistos = new Set();

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
            attributes: ['nombre', 'apellidoPaterno', 'apellidoMaterno', 'telefono', 'esContactoPrincipal']
        }) : []
    ]);
    for (const u of usuarios.filter(item => item.esContactoPrincipal)) {
        agregarTelefonos(destinatarios, vistos, u.telefono,
            [u.nombre, u.apellidoPaterno, u.apellidoMaterno].filter(Boolean).join(' '), 'Contacto principal');
    }
    agregarTelefonos(destinatarios, vistos, casa.telefono, casa.nombre, 'Vivienda');
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
    periodosPagados,
    datosDeMovimiento,
    consultarPago,
    consultarTelefonos,
    generarPdf
};
