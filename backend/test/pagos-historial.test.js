const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Op } = require('sequelize');
const { crearHistorialController, rangoPeriodo, periodoActual } = require('../src/controllers/pagos-historial.controller');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('periodos sin solapamiento: incluye el día 11 inicial y excluye el siguiente, también en diciembre', () => {
  assert.deepEqual(rangoPeriodo('2026-10'), { periodo: '2026-10', desde: '2026-10-11', hastaExclusiva: '2026-11-11' });
  assert.equal(rangoPeriodo('2026-12').hastaExclusiva, '2027-01-11');
  for (const value of ['2026-00', '2026-13', '2026-1', 'x', '2026-10 OR 1=1']) assert.throws(() => rangoPeriodo(value), { status: 400 });
  assert.equal(periodoActual(new Date('2026-10-11T05:59:59Z')), '2026-09');
  assert.equal(periodoActual(new Date('2026-10-11T06:00:00Z')), '2026-10');
  assert.equal(periodoActual(new Date('2026-10-10T18:00:00Z')), '2026-09');
  assert.equal(periodoActual(new Date('2026-01-05T18:00:00Z')), '2025-12');
});

test('historial deniega otros roles antes de consultar datos', async () => {
  const handler = crearHistorialController({ PagoReportado: { findAndCountAll: () => assert.fail('consulta no autorizada') } });
  for (const rol of [undefined, 'CONDOMINO', 'SEGURIDAD', 'MESA_DIRECTIVA']) {
    const res = response(); await handler({ usuario: { rol }, query: {} }, res); assert.equal(res.code, 403);
  }
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/pagos.routes.js'), 'utf8');
  assert.match(route, /router\.get\('\/historial', soloAdministracion, listarHistorial\)/);
});

test('filtra por depósito, pagina, conserva abonos y estatus y consulta TAGs en lote', async () => {
  let calls = 0;
  const rows = [
    { id: 1, casaId: 10, monto: '300.00', recargo: '50.00', estatus: 'VALIDADO', creadoEn: '2026-10-15T18:00:00Z' },
    { id: 2, casaId: 10, monto: '50.00', recargo: '0.00', estatus: 'PENDIENTE_VALIDACION' },
    { id: 3, casaId: 11, monto: '650.00', recargo: '50.00', estatus: 'RECHAZADO' }
  ];
  const handler = crearHistorialController({
    PagoReportado: { findAndCountAll: async options => {
      calls++;
      assert.equal(options.where.fechaOperacion[Op.gte], '2026-10-11');
      assert.equal(options.where.fechaOperacion[Op.lt], '2026-11-11');
      assert.equal(options.where.estatus, undefined);
      assert.equal(options.offset, 50); assert.equal(options.limit, 50);
      assert.ok(!options.attributes.includes('comprobanteData')); assert.ok(!options.attributes.includes('textoOcr'));
      return { count: 53, rows };
    } },
    PagoAccesoC3: { findAll: async options => { calls++; assert.equal(options.where.origen, 'PAGO'); return [{ id: 9, origenId: 1, meses: 0, estado: 'COMPLETADO' }]; } },
    PagoAccesoTagC3: { findAll: async () => { calls++; return []; } },
    ZkTarjeta: { findAll: async options => { calls++; assert.deepEqual(options.where.casaId[Op.in], [10, 11]); return [
      { casaId: 10, numeroTarjeta: 'TEST-1', fechaFin: '2026-10-11', ultimaLectura: '2026-10-13T12:00:00Z' },
      { casaId: 10, numeroTarjeta: 'TEST-2', fechaFin: '2026-11-10' }
    ]; } }
  });
  const res = response(); await handler({ usuario: { rol: 'ADMINISTRADOR' }, query: { periodo: '2026-10', pagina: '2' } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.total, 53); assert.equal(calls, 4);
  assert.equal(res.body.data.length, 3); assert.equal(res.body.data[0].movimientos[0].meses, 0);
  assert.equal(res.body.data[0].tags.length, 2); assert.equal(res.body.data[1].movimientos.length, 0);
  assert.equal(res.body.data[2].tags.length, 0);
});

test('periodo y pagina inválidos no consultan SQL; vacío y fallos producen respuesta clara', async () => {
  const handler = crearHistorialController({ PagoReportado: { findAndCountAll: async () => ({ count: 0, rows: [] }) } });
  for (const query of [{ periodo: '2026-15' }, { pagina: '-1' }, { pagina: '1.5' }]) {
    const res = response(); await handler({ usuario: { rol: 'SUPER_ADMIN' }, query }, res); assert.equal(res.code, 400);
  }
  const res = response(); await handler({ usuario: { rol: 'SUPER_ADMIN' }, query: { periodo: '2026-10' } }, res);
  assert.deepEqual(res.body.data, []);
  const failed = crearHistorialController({ PagoReportado: { findAndCountAll: async () => { throw Error('private SQL'); } } });
  const error = response(); await failed({ usuario: { rol: 'ADMINISTRADOR' }, query: {} }, error);
  assert.equal(error.code, 500); assert.doesNotMatch(error.body.message, /private SQL/);
});

async function ui(role, data = []) {
  const elements = new Map(); const get = id => {
    if (!elements.has(id)) elements.set(id, { hidden: true, value: '', innerHTML: '', listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } });
    return elements.get(id);
  };
  let requests = 0;
  const storage = { getItem: key => key.includes('Usuario') ? JSON.stringify({ rol: role }) : 'synthetic-token' };
  const context = { document: { getElementById: get, addEventListener() {} }, localStorage: storage, sessionStorage: storage,
    fetch: async () => { requests++; return { ok: true, json: async () => ({ ok: true, desde: '2026-10-11', hastaExclusiva: '2026-11-11', pagina: 1, limite: 50, total: data.length, data }) }; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../docs/assets/js/pagos-historial.js'), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { get, requests };
}

test('interfaz oculta el historial a condóminos y no solicita datos', async () => {
  for (const role of ['CONDOMINO', 'SEGURIDAD', 'MESA_DIRECTIVA']) {
    const result = await ui(role); assert.equal(result.get('adminPaymentHistory').hidden, true); assert.equal(result.requests, 0);
  }
});

test('tabla muestra abonos, lectura TAG y entregas parciales; escapa datos del reportante', async () => {
  const result = await ui('ADMINISTRADOR', [{ folioReporte: 'TEST', folioOperacion: '00001', fechaOperacion: '2026-10-12',
    horaOperacion: '12:00:00', creadoEn: '2026-10-13T18:00:00Z', monto: 300, recargo: 50,
    nombreReportante: '<script>bad</script>', calleSnapshot: 'Prueba', numeroCasaSnapshot: '1', tipoPago: 'MANTENIMIENTO', estatus: 'VALIDADO',
    movimientos: [{ meses: 0, estado: 'COMPLETADO', tagsTotal: 0, tagsAplicados: 0 }, { meses: 2, estado: 'PENDIENTE', tagsTotal: 2, tagsAplicados: 1 }],
    tags: [{ numeroTarjeta: 'TEST-1', fechaFin: '2026-11-10', ultimaLectura: null, enControlador: false }] }]);
  assert.equal(result.get('adminPaymentHistory').hidden, false);
  const html = result.get('historyRows').innerHTML;
  assert.match(html, /Abono sin avance/); assert.match(html, /Aplicados a 1\/2 TAGs/);
  assert.match(html, /2026-11-10/); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(result.get('historyRange').textContent, /2026-11-10/);
});

test('meses aplicados destacan la cantidad completa y quedan junto al monto', async () => {
  const base = { monto: 600, tipoPago: 'MANTENIMIENTO', tags: [], movimientos: [
    { meses: 2, estado: 'COMPLETADO', tagsTotal: 2, tagsAplicados: 2 },
    { meses: 1, estado: 'PENDIENTE', tagsTotal: 2, tagsAplicados: 0 }
  ] };
  const result = await ui('ADMINISTRADOR', [base]);
  const html = result.get('historyRows').innerHTML;
  assert.match(html, /history-month-count">2<\/strong>/);
  assert.match(html, /1 · Sin entrega confirmada/);
  assert.ok(html.indexOf('data-label="Meses aplicados"') > html.indexOf('data-label="Monto"'));
  assert.ok(html.indexOf('data-label="Meses aplicados"') < html.indexOf('data-label="Reportado por'));
  const absent = await ui('SUPER_ADMIN', [{ ...base, movimientos: [] }]);
  assert.match(absent.get('historyRows').innerHTML, /history-month-count">—<\/strong>/);
});

test('API conserva fecha anterior del intento de este pago, sin sustituirla por la fecha actual del TAG', async () => {
  const handler = crearHistorialController({
    PagoReportado: { findAndCountAll: async () => ({ count: 2, rows: [{ id: 1, casaId: 10 }, { id: 2, casaId: 10 }] }) },
    PagoAccesoC3: { findAll: async () => [{ id: 91, origenId: 1, meses: 1, estado: 'COMPLETADO' }, { id: 92, origenId: 2, meses: 1, estado: 'PENDIENTE' }] },
    PagoAccesoTagC3: { findAll: async options => {
      assert.ok(options.attributes.includes('fechaAntes'));
      return [
        { pagoAccesoId: 91, numeroTarjeta: 'TEST-1', fechaAntes: '2026-09-10', fechaDespues: '2026-10-10', estado: 'COMPLETADO' },
        { pagoAccesoId: 91, numeroTarjeta: 'TEST-2', fechaAntes: '2026-08-10', fechaDespues: '2026-09-10', estado: 'COMPLETADO' },
        { pagoAccesoId: 92, numeroTarjeta: 'TEST-1', fechaAntes: null, fechaDespues: null, estado: 'PENDIENTE' }
      ];
    } },
    ZkTarjeta: { findAll: async () => [{ casaId: 10, numeroTarjeta: 'TEST-1', fechaFin: '2026-12-10' }] }
  });
  const res = response(); await handler({ usuario: { rol: 'ADMINISTRADOR' }, query: { periodo: '2026-10' } }, res);
  assert.equal(res.body.data[0].movimientos[0].tags[0].fechaAntes, '2026-09-10');
  assert.equal(res.body.data[0].movimientos[0].tags[1].fechaAntes, '2026-08-10');
  assert.equal(res.body.data[1].movimientos[0].tags[0].fechaAntes, null);
  assert.equal(res.body.data[0].tags[0].fechaFin, '2026-12-10');
});

test('interfaz muestra fechas anteriores por TAG; fechas faltantes, abonos y extraordinarios quedan explícitos', async () => {
  const base = { tipoPago: 'MANTENIMIENTO', tags: [{ numeroTarjeta: 'TEST-1', fechaFin: '2026-12-10' }],
    movimientos: [{ meses: 1, estado: 'PENDIENTE', tagsTotal: 2, tagsAplicados: 0, tags: [
      { numeroTarjeta: 'TEST-1', fechaAntes: '2026-09-10' }, { numeroTarjeta: 'TEST-2', fechaAntes: null }
    ] }] };
  const result = await ui('ADMINISTRADOR', [base]);
  const html = result.get('historyRows').innerHTML;
  const historical = html.split('data-label="Fecha anterior al pago">')[1].split('</td>')[0];
  assert.match(historical, /TEST-1: <b>2026-09-10/);
  assert.match(historical, /TEST-2: <b>No registrada/);
  assert.doesNotMatch(historical, /2026-12-10/);
  for (const [payment, expected] of [
    [{ ...base, movimientos: [] }, /No registrada para este pago/],
    [{ ...base, movimientos: [{ meses: 0 }] }, /No aplica: abono sin avance/],
    [{ ...base, tipoPago: 'EXTRAORDINARIO' }, /No aplica: extraordinario/]
  ]) {
    const check = await ui('ADMINISTRADOR', [payment]);
    assert.match(check.get('historyRows').innerHTML, expected);
  }
});
