'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepararReporte } = require('../../docs/assets/js/analisis-excel.js');

const read = name => fs.readFileSync(path.resolve(__dirname, '../../', name), 'utf8');
const vivienda = (casaId, pagada, estatus = pagada ? 'PAGADO' : 'PENDIENTE') => ({
 casaId, calle: 'Gardenias', numero: String(casaId), nombre: `Persona ${casaId}`, pagada, estatus,
 montoPagado: pagada ? 300 : 0, saldoPendiente: pagada ? 0 : 300,
 ultimoMesPagado: pagada ? { mes: 'OCTUBRE', anio: 2026 } : null,
 ultimoPago: pagada ? { monto: 300, fecha: '2026-10-19' } : null, tags: { detalle: [] }
});
const data = {
 anio: 2026, mes: 10, periodo: 'OCTUBRE 2026',
 viviendasMantenimiento: Array.from({ length: 232 }, (_, i) => vivienda(i + 1, i < 197)),
 cuotasPeriodoDetalle: [{ id: 1, casaId: 2, anio: 2026, mes: 'OCTUBRE', montoPagado: 300 }],
 pagosPeriodoDetalle: [{ id: 8, casaId: 2, tipo: 'MANTENIMIENTO', monto: 300 }],
 ingresosManuales: [{ tipo: 'SALDO_INICIAL', monto: 500 }], esCargaHistorica: true,
 cobrosCuotasRegistrados: 59000, ingresosValidados: 40000, ingresosAdicionales: 500,
 totalManualConcepto: 0, ingresosParaBalance: 59500
};

test('los cuatro Excel usan el padrón completo de 232 sin búsqueda, filtros o paginación', () => {
 assert.equal(prepararReporte(data, 'padron').hojas[0].filas.length, 232);
 assert.equal(prepararReporte(data, 'pagadas').hojas[0].filas.length, 197);
 assert.equal(prepararReporte(data, 'pendientes').hojas[0].filas.length, 35);
 assert.equal(prepararReporte(data, 'pagadas').hojas[0].filas[0][7], 'OCTUBRE 2026');
 assert.ok(prepararReporte(data, 'historicas').hojas.some(h => h.nombre === 'Cuotas del período'));
 assert.ok(prepararReporte(data, 'historicas').hojas.some(h => h.nombre === 'Bancos validados'));
});

test('los abonos parciales aparecen separados sin desajustar el conteo de las tarjetas', () => {
 const parcial = vivienda(233, true, 'PAGO_PARCIAL');
 const reporte = prepararReporte({ ...data, viviendasMantenimiento: [...data.viviendasMantenimiento, parcial] }, 'pendientes');
 assert.equal(reporte.hojas[0].filas.length, 35);
 assert.equal(reporte.hojas[1].filas.length, 1);
});

test('nombres y referencias externas no se convierten en fórmulas en Excel', () => {
 const peligro = vivienda(5, true);
 peligro.nombre = '=HYPERLINK("http://example.invalid")';
 const row = prepararReporte({ ...data, viviendasMantenimiento: [peligro] }, 'padron').hojas[0].filas[0];
 assert.equal(row[3][0], "'");
});

test('UI permite editar un celular numérico, seleccionar filas sin radios y exportar por tarjeta', () => {
 const html = read('docs/analisis-cuotas.html');
 const js = read('docs/assets/js/analisis-cuotas.js');
 const css = read('docs/assets/css/analisis-cuotas.css');
 assert.match(html, /id="houseReceiptMonth"/);
 assert.match(js, /periodoSeleccionado/);
 assert.match(js, /https:\/\/wa\.me\//);
 assert.match(js, /https:\/\/web\.whatsapp\.com\/send/);
 assert.match(html, /id="houseReceiptPhoneInput" type="tel" inputmode="numeric" pattern="\[0-9\]\*"/);
 assert.match(js, /input\.value\.replace\(\/\\D\/g,''\)\.slice\(0,13\)/);
 assert.match(js, /const phone=normalizeReceiptPhone\(\$\('houseReceiptPhoneInput'\)\.value\)/);
 assert.match(js, /\$\('houseReceiptPhoneInput'\)\.value=phones\[0\]\?\.numero\|\|''/);
 assert.doesNotMatch(js, /Seleccionar teléfono registrado/);
 assert.doesNotMatch(html, /<th[^>]*>Seleccionar<\/th>|id="houseReceiptPrimaryPhone"/);
 assert.doesNotMatch(js, /receiptHouseSelection|Descargar Excel ↓/);
 assert.match(js, /data-finance-export/);
 assert.match(js, /aria-selected=/);
 assert.match(js, /addEventListener\('keydown',event=>/);
 assert.match(css, /background:#f5d0a7!important/);
 assert.doesNotMatch(css, /house-receipt-radio|house-receipt-selection-cell/);
 assert.doesNotMatch(css, /inset 3px 0 #4c9a70/);
 assert.match(html, /analisis-excel\.js\?v=20261020/);
});
