'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { adeudosExigibles, comprobarHabilitacion, idsPiloto, run } = require('../src/services/zkteco-adeudos.service');

const EMPTY = () => ({ tipos: { MANTENIMIENTO: [], EXTRAORDINARIO: [], CASA_CLUB: [] } });
const DEBT = () => ({ tipos: {
  MANTENIMIENTO: [{ periodo: '2026-10', monto: 350 }],
  EXTRAORDINARIO: [{ periodo: '2026-10', monto: 10 }],
  CASA_CLUB: [{ fechaLimitePago: '2026-10-15', monto: 400, estado: 'PENDIENTE' }]
} });

test('mantenimiento vence el día 11; extras del período actual y club solo tras su plazo', () => {
  const elDiez = adeudosExigibles(DEBT(), '2026-10-10');
  assert.deepEqual(elDiez.totales, { MANTENIMIENTO: 0, EXTRAORDINARIO: 10, CASA_CLUB: 0 });
  const elDieciseis = adeudosExigibles(DEBT(), '2026-10-16');
  assert.deepEqual(elDieciseis.totales, { MANTENIMIENTO: 350, EXTRAORDINARIO: 10, CASA_CLUB: 400 });
});

test('no bloquear reserva en revisión administrativa; ni proyecto futuro, ni montos cero', () => {
  const debt = DEBT();
  debt.tipos.CASA_CLUB[0].estado = 'EN_REVISION';
  debt.tipos.EXTRAORDINARIO[0].periodo = '2027-01';
  debt.tipos.MANTENIMIENTO[0].monto = 0;
  assert.equal(adeudosExigibles(debt, '2026-10-18').total, 0);
});

test('fallar cerrado ante resultados incompletos; impedir habilitación con deuda', async () => {
  assert.throws(() => adeudosExigibles(null), /incompleta/);
  await assert.rejects(comprobarHabilitacion(25, { consultar: async () => DEBT(), hoy: '2026-10-18' }),
    error => error.status === 409 && error.totales.CASA_CLUB === 400);
  await comprobarHabilitacion(25, { consultar: async () => EMPTY(), hoy: '2026-10-18' });
});

test('el piloto solo admite IDs específicos', () => {
  assert.deepEqual(idsPiloto('9, 10,9'), [9,10]);
  assert.throws(() => idsPiloto('9,0,abc'), /numéricos/);
});

const cards = [{ id: 101, casaId: 7 }, { id: 102, casaId: 7 }, { id: 103, casaId: 8 }];
test('no ejecuta escritura sin activar explicitamente el monitor', async () => {
  let invocado = false;
  const result = await run({ env: {}, obtenerTarjetas: async () => { invocado = true; return cards; } });
  assert.equal(result.estado, 'INACTIVO');
  assert.equal(invocado, false);
});

test('piloto en simulación reporta TAGs pero no modifica C3', async () => {
  const changed = [];
  const result = await run({ env: { ZKTECO_ADEUDOS_ENABLED:'true', ZKTECO_ADEUDOS_CASA_IDS:'7' },
    obtenerTarjetas:async()=>cards, consultar:async()=>DEBT(), bloquear:async id => changed.push(id), hoy:'2026-10-18' });
  assert.equal(result.estado, 'SIMULACION');
  assert.equal(result.detectadas, 2);
  assert.deepEqual(changed, []);
});

test('escritura por piloto solo con dos flags y limitada por corrida', async () => {
  const changed = [];
  const result = await run({ env: { ZKTECO_ADEUDOS_ENABLED:'true', ZKTECO_ADEUDOS_DRY_RUN:'false',
    ZKTECO_DRY_RUN:'false', ZKTECO_ADEUDOS_CASA_IDS:'7,8', ZKTECO_ADEUDOS_MAX_TAGS:'2' },
    obtenerTarjetas:async()=>cards, consultar:async()=>DEBT(), bloquear:async id => changed.push(id), hoy:'2026-10-18' });
  assert.equal(result.estado, 'EJECUTADO');
  assert.equal(result.bloqueadas, 2);
  assert.deepEqual(changed, [101,102]);
});

test('modo global necesita confirmación explícita y padrón validado', async () => {
  const env = { ZKTECO_ADEUDOS_ENABLED:'true', ZKTECO_ADEUDOS_DRY_RUN:'false', ZKTECO_DRY_RUN:'false' };
  assert.equal((await run({env})).estado, 'SIN_ALCANCE');
  const touched = [];
  const result = await run({ env:{ ...env, ZKTECO_ADEUDOS_GLOBAL_CONFIRMADO:'CONFIRMO_231' },
    obtenerPadron:async()=>[{id:7}], obtenerTarjetas:async()=>cards,
    consultar:async()=>DEBT(), bloquear:async id=>touched.push(id), hoy:'2026-10-18' });
  assert.deepEqual(touched,[101,102]);
  assert.equal(result.bloqueadas,2);
});

test('la activación manual de un TAG se deniega ANTES de conectar al C3 si hay adeudo', async t => {
  Object.assign(process.env, { DB_HOST:'localhost', DB_PORT:'3306', DB_NAME:'test', DB_USER:'test', DB_PASSWORD:'test' });
  const Tags = require('../src/models/ZkTarjeta');
  const direct = require('../src/services/zkteco-direct.service');
  const { C3Client } = require('../src/services/zkteco-c3-client.service');
  t.mock.method(Tags, 'findByPk', async () => ({ id:43, casaId:7, numeroTarjeta:'FICTICIO' }));
  let conexiones = 0;
  t.mock.method(C3Client.prototype, 'connect', async () => { conexiones++; });
  // El servicio real lee datos de adeudos, pero no hace conexión SQL aquí.
  const original = require('../src/services/zkteco-adeudos.service');
  t.mock.method(original, 'comprobarHabilitacion', async () => {
    const error = new Error('Adeudo exigible'); error.status = 409; throw error;
  });
  await assert.rejects(direct.setCardBlocked(43, false), { status:409 });
  assert.equal(conexiones,0);
});
