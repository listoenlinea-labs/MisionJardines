'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) {
    process.env[name] ||= 'pruebas-locales';
}
process.env.DB_PORT ||= '3306';

const { datosDeMovimiento, normalizarTelefonoMX, generarPdf } =
    require('../src/services/recibo-mantenimiento-analisis.service');

const casa = { id: 5, calle: 'Gardenias', numero: '5', nombre: 'Persona de prueba' };
const cuota = (id, mes, montoPagado, extras = {}) => ({
    id, anio: 2026, mes, montoPagado, recargo: 0,
    estatusPago: 'PAGADO', formaPago: 'EFECTIVO',
    referencia: 'MJMAN:2026-12-10:operacion-demo',
    fechaConfirmacion: '2026-10-19T18:00:00.000Z',
    origenImportacion: 'MANUAL_ANALISIS', ...extras
});

test('agrupa un solo movimiento de varios meses y conserva un folio estable', () => {
    const cuotas = [cuota(11, 'OCTUBRE', 300), cuota(12, 'NOVIEMBRE', 300)];
    const primero = datosDeMovimiento(casa, cuotas, [], new Date('2026-10-20T12:00:00Z'));
    const segundo = datosDeMovimiento(casa, cuotas, [], new Date('2026-10-21T12:00:00Z'));
    assert.equal(primero.resumen.monto, 600);
    assert.equal(primero.recibo.periodosVarios, true);
    assert.equal(primero.recibo.mes, 'OCTUBRE 2026 A NOVIEMBRE 2026');
    assert.equal(primero.resumen.folio, segundo.resumen.folio);
    assert.match(primero.resumen.folio, /^MJ-AN-5-[0-9A-F]{10}$/);
    assert.equal(primero.recibo.sello, 'PAGADO');
});

test('incluye recargos del cobro manual sin sumar dos veces los importes de una importación', () => {
    const manual = datosDeMovimiento(casa, [cuota(21, 'OCTUBRE', 300, { recargo: 50 })], []);
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
    assert.match(resultado.nombreArchivo, /^Recibo_.*\.pdf$/);
});

test('el enlace a recibos está protegido por el middleware de administradores', () => {
    const routes = fs.readFileSync(path.resolve(__dirname, '../src/routes/finanzas.routes.js'), 'utf8');
    assert.match(routes, /router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
    assert.match(routes, /\/pagos-vivienda\/:casaId\/recibo\/datos/);
    assert.match(routes, /\/pagos-vivienda\/:casaId\/recibo'/);
});
