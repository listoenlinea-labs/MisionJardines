'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    process.env[name] ||= 'pruebas-locales';
}
process.env.DB_PORT ||= '3306';

const { datosDeMovimiento, periodosPagados, normalizarTelefonoMX, generarPdf } =
    require('../src/services/recibo-mantenimiento-analisis.service');

const casa = { id: 5, calle: 'Gardenias', numero: '5', nombre: 'Persona de prueba' };
const cuota = (id, mes, montoPagado, extras = {}) => ({
    id, anio: 2026, mes, montoPagado, recargo: 0,
    estatusPago: 'PAGADO', formaPago: 'EFECTIVO',
    referencia: 'MJMAN:2026-12-10:operacion-demo',
    fechaConfirmacion: '2026-10-19T18:00:00.000Z',
    origenImportacion: 'MANUAL_ANALISIS', ...extras
});

test('genera un recibo individual por mes pagado, del más reciente al más antiguo', () => {
    const cuotas = [cuota(11, 'OCTUBRE', 300), cuota(12, 'NOVIEMBRE', 300)];
    const primero = datosDeMovimiento(casa, cuotas, [], new Date('2026-10-20T12:00:00Z'));
    const segundo = datosDeMovimiento(casa, cuotas, [], new Date('2026-10-21T12:00:00Z'));
    assert.equal(primero.resumen.monto, 300);
    assert.equal(primero.recibo.periodosVarios, false);
    assert.equal(primero.recibo.mes, 'NOVIEMBRE 2026');
    assert.equal(primero.resumen.folio, segundo.resumen.folio);
    assert.match(primero.resumen.folio, /^MJ-AN-5-[0-9A-F]{10}-202611$/);
    assert.equal(primero.recibo.sello, 'PAGADO');
    assert.deepEqual(primero.periodosDisponibles.map(p=>p.valor),['2026-11','2026-10']);
    const octubre=datosDeMovimiento(casa,cuotas,[],new Date('2026-10-20T12:00:00Z'),'2026-10');
    assert.equal(octubre.resumen.periodo,'OCTUBRE 2026');
    assert.equal(octubre.resumen.monto,300);
    assert.notEqual(octubre.resumen.folio,primero.resumen.folio);
    assert.throws(()=>datosDeMovimiento(casa,cuotas,[],new Date(),'2026-12'),/no tiene un pago/);
});

test('la lista de meses omite períodos sin pago y no confunde años futuros',()=>{
    const disponibles=periodosPagados([cuota(1,'OCTUBRE',300),cuota(2,'DICIEMBRE',300,{anio:2027}),
        cuota(3,'NOVIEMBRE',0),cuota(4,'ENERO',100,{anio:2027,estatusPago:'PAGO_PARCIAL'})]);
    assert.deepEqual(disponibles.map(p=>p.valor),['2027-12','2027-01','2026-10']);
});

test('incluye recargos del cobro manual sin sumar dos veces los importes de una importación', () => {
    const manual = datosDeMovimiento(casa, [cuota(21, 'OCTUBRE', 350, { recargo: 50 })], []);
    assert.equal(manual.resumen.monto, 350);

    const importada = datosDeMovimiento(casa, [cuota(22, 'OCTUBRE', 350, {
        recargo: 50, origenImportacion: 'EXCEL_2026'
    })], []);
    assert.equal(importada.resumen.monto, 350);
});

test('un comprobante validado y su cuota representan un depósito, no dos', () => {
    const cuotas = [cuota(31, 'OCTUBRE', 300, { recargo: 50 })];
    const banco = [{ id: 7, tipoPago: 'MANTENIMIENTO', estatus: 'VALIDADO',
        monto: 350, recargo: 50, folioOperacion: cuotas[0].referencia,
        fechaOperacion: '2026-10-19', reciboFolio: 'MJ-2026-77' }];
    const datos = datosDeMovimiento(casa, cuotas, banco);
    assert.equal(datos.resumen.monto, 350);
    assert.equal(datos.resumen.folio, 'MJ-2026-77');
});

test('un abono registrado nunca lleva el sello PAGADO', () => {
    const datos = datosDeMovimiento(casa, [cuota(40, 'OCTUBRE', 150, {
        estatusPago: 'PAGO_PARCIAL'
    })], []);
    assert.equal(datos.recibo.sello, 'ABONO RECIBIDO');
    assert.equal(datos.resumen.monto, 150);
});

test('sin depósito o sin referencia no se emite un comprobante', () => {
    assert.throws(() => datosDeMovimiento(casa, [], []), /no tiene pagos/);
    assert.throws(() => datosDeMovimiento(casa, [cuota(51, 'OCTUBRE', 300, {
        referencia: null, folio: null
    })], []), /referencia verificable/);
});

test('genera recibo desde referencia exacta del historial incluso con varios meses', () => {
    const cuotas = [
        cuota(70, 'OCTUBRE', 150, { referencia: 'MOV-OCT', fechaConfirmacion: '2026-10-21' }),
        cuota(71, 'NOVIEMBRE', 300, { referencia: 'MOV-NOV-DIC', fechaConfirmacion: '2026-10-22' }),
        cuota(72, 'DICIEMBRE', 300, { referencia: 'MOV-NOV-DIC', fechaConfirmacion: '2026-10-22' })
    ];
    const octubre = datosDeMovimiento(casa, cuotas, [], new Date('2026-10-22T12:00:00Z'), null, 'mov-oct');
    assert.equal(octubre.resumen.monto, 150);
    assert.equal(octubre.resumen.periodo, 'OCTUBRE 2026');
    assert.equal(octubre.resumen.referencia, 'MOV-OCT');
    const conjunto = datosDeMovimiento(casa, cuotas, [], new Date('2026-10-22T12:00:00Z'), null, 'MOV-NOV-DIC');
    assert.equal(conjunto.resumen.monto, 600);
    assert.equal(conjunto.resumen.periodo, 'NOVIEMBRE 2026 A DICIEMBRE 2026');
    assert.equal(conjunto.recibo.periodosVarios, true);
    assert.notEqual(conjunto.resumen.folio, octubre.resumen.folio);
    assert.throws(() => datosDeMovimiento(casa, cuotas, [], new Date(), null, 'NO-EXISTE'), /no tiene un pago/);
    assert.throws(() => datosDeMovimiento(casa, cuotas, [], new Date(), '2026-10', 'MOV-OCT'), /no ambos/);
});

test('no permite emitir recibo de otro concepto y respeta los abonos parciales', () => {
    const cuotas = [cuota(80, 'OCTUBRE', 150, {referencia: 'MANT-80'})];
    const otros = [{id: 88, tipoPago: 'CASA_CLUB', estatus: 'VALIDADO', monto: 900, folioOperacion: 'CLUB-88'}];
    assert.throws(() => datosDeMovimiento(casa, cuotas, otros, new Date(), null, 'CLUB-88'), /no tiene un pago/);
    const parcial = datosDeMovimiento(casa, [cuota(81, 'OCTUBRE', 75, {
        referencia: 'PARCIAL-81', estatusPago: 'PAGO_PARCIAL'
    })], [], new Date(), null, 'PARCIAL-81');
    assert.equal(parcial.resumen.monto, 75);
    assert.equal(parcial.resumen.sello, 'ABONO RECIBIDO');
});

test('solo acepta teléfonos mexicanos completos para WhatsApp', () => {
    assert.equal(normalizarTelefonoMX('33 1234 5678'), '523312345678');
    assert.equal(normalizarTelefonoMX('+52 (33) 1234-5678'), '523312345678');
    assert.equal(normalizarTelefonoMX('5213312345678'), '523312345678');
    assert.equal(normalizarTelefonoMX('335089887'), null);
});

test('genera un PDF en memoria con el diseño original, sin crear un archivo ni registrar un pago nuevo', async () => {
    const datos = datosDeMovimiento(casa, [cuota(61, 'OCTUBRE', 300)], []);
    const resultado = await generarPdf(datos.recibo);
    assert.ok(Buffer.isBuffer(resultado.buffer));
    assert.match(resultado.buffer.subarray(0, 8).toString(), /^%PDF-/);
    assert.ok(resultado.buffer.length > 2000);
    assert.match(resultado.buffer.toString('latin1'),/\/Subtype\s*\/Image/,
        'La versión desplegable debe incluir el logotipo real como imagen en el PDF');
    assert.match(resultado.nombreArchivo, /^Recibo_.*\.pdf$/);
});

test('el enlace a recibos está protegido por el middleware de administradores', () => {
    const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes/finanzas.routes.js'), 'utf8');
    assert.match(routes, /router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
    assert.match(routes, /\/pagos-vivienda\/:casaId\/recibo\/datos/);
    assert.match(routes, /\/pagos-vivienda\/:casaId\/recibo'/);
});

test('Jardines 335: recibo por referencia coincide con $650 del historial y no duplica $50 de recargo', () => {
    const ref = 'MJM:10-DIC-2026:ejemplo-650';
    const cuotas = [
        cuota(201, 'OCTUBRE', 350, { referencia: ref, recargo: 50, fechaConfirmacion: '2026-10-28' }),
        cuota(202, 'NOVIEMBRE', 300, { referencia: ref, recargo: 0, fechaConfirmacion: '2026-10-28' })
    ];
    const { historialMantenimiento } = require('../src/services/historial-pagos-vivienda.service');
    const movimiento = historialMantenimiento(cuotas)[0];
    assert.equal(movimiento.monto, 650);
    assert.equal(movimiento.recargo, 50);
    const datos = datosDeMovimiento(casa, cuotas, [], new Date('2026-10-29T12:00:00Z'), null, ref);
    assert.equal(datos.resumen.monto, movimiento.monto);
    assert.equal(datos.recibo.montoPagado, 650);
    assert.equal(datos.resumen.periodo, 'OCTUBRE 2026 A NOVIEMBRE 2026');
    const mes = datosDeMovimiento(casa, cuotas, [], new Date(), '2026-10');
    assert.equal(mes.resumen.monto, 350);
});

test('recibos por referencia usan exactamente el importe del historial con depósito bancario o abono', () => {
    const cuotas = [cuota(203, 'OCTUBRE', 350, { referencia: 'PAGO-350', recargo: 50 })];
    const banco = [{ id: 21, tipoPago: 'MANTENIMIENTO', estatus: 'VALIDADO',
        monto: 350, recargo: 50, folioOperacion: 'PAGO-350', fechaOperacion: '2026-10-28' }];
    const { historialMantenimiento } = require('../src/services/historial-pagos-vivienda.service');
    for (const comprobantes of [[], banco]) {
        const movimiento = historialMantenimiento(cuotas, comprobantes)[0];
        const datos = datosDeMovimiento(casa, cuotas, comprobantes, new Date(), null, 'PAGO-350');
        assert.equal(datos.recibo.montoPagado, movimiento.monto);
        assert.equal(datos.resumen.monto, 350);
    }
    const parcial = [cuota(204, 'NOVIEMBRE', 125, { referencia: 'PARCIAL-125', recargo: 0,
        estatusPago: 'PAGO_PARCIAL' })];
    const abono = datosDeMovimiento(casa, parcial, [], new Date(), null, 'PARCIAL-125');
    assert.equal(abono.recibo.montoPagado, 125);
    assert.equal(abono.recibo.sello, 'ABONO RECIBIDO');
});
