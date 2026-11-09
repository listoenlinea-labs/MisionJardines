'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

function createFixture({ existingLink = false, linkedName = 'María López', storedName = null } = {}) {
  const house = {
    id: 18, calle: 'Rosas', numero: '18', nombre: storedName,
    telefono: '3312345678', correo: 'correo@example.test',
    enRenta: true, observaciones: 'Sin modificar',
    async update(values) { Object.assign(this, values); return this; }
  };
  const state = { house, created: 0, createdLinks: 0 };
  const links = existingLink ? [{ condominoId: 8, viviendaId: 18, activo: true }] : [];
  const existing = existingLink ? [{ id: 8, activo: true, nombreCompleto: linkedName }] : [];
  const mock = {
    './viviendas-visibles.service': { esViviendaVisible: () => true },
    'sequelize': { Op: { in: Symbol('in'), ne: Symbol('ne') } },
    '../config/database': {
      transaction: async (options, operation) => operation({ LOCK: { UPDATE: 'UPDATE' } })
    },
    '../models': {
      Casa: { findByPk: async id => Number(id) === 18 ? house : null },
      Condomino: {
        findAll: async () => existing,
        create: async fields => { state.created++; return { id: 42, ...fields }; }
      },
      CondominoVivienda: {
        findAll: async () => links,
        create: async fields => { state.createdLinks++; return fields; }
      }
    },
    './viviendas.service': {
      admin: role => ['SUPER_ADMIN', 'ADMINISTRADOR'].includes(role),
      fallo: (status, message) => Object.assign(new Error(message), { status })
    }
  };
  const moduleShim = { exports: {} };
  new Function('require', 'module', read('backend/src/services/residentes.service.js'))(
    name => {
      if (!Object.hasOwn(mock, name)) throw Error('Unexpected mock dependency: ' + name);
      return mock[name];
    },
    moduleShim
  );
  return { service: moduleShim.exports, state };
}

test('La captura rápida crea vínculo y nombre, preservando pagos/contactos y ajustes previos', async () => {
  const { service, state } = createFixture();
  const result = await service.registrarRapido(
    { rol: 'ADMINISTRADOR', usuarioId: 4 }, 18, { nombreCompleto: '  María    López  ' }
  );
  assert.equal(result.nombre, 'María López');
  assert.equal(result.casaId, 18);
  assert.equal(result.vinculoExistente, false);
  assert.equal(state.house.nombre, 'María López');
  assert.equal(state.house.telefono, '3312345678');
  assert.equal(state.house.correo, 'correo@example.test');
  assert.equal(state.house.enRenta, true);
  assert.equal(state.house.observaciones, 'Sin modificar');
  assert.equal(state.created, 1);
  assert.equal(state.createdLinks, 1);
});

test('No permite reescribir el residente existente ni registrar dos veces', async () => {
  const { service, state } = createFixture({ storedName: 'Residente original' });
  await assert.rejects(service.registrarRapido(
    { rol: 'ADMINISTRADOR' }, 18, { nombreCompleto: 'Otro nombre' }
  ), e => e.status === 409);
  assert.equal(state.house.nombre, 'Residente original');
  assert.equal(state.created, 0);
});

test('La cuenta de Seguridad no puede crear residentes', async () => {
  const { service, state } = createFixture();
  await assert.rejects(service.registrarRapido(
    { rol: 'SEGURIDAD' }, 18, { nombreCompleto: 'Persona' }
  ), e => e.status === 403);
  assert.equal(state.created, 0);
});

test('Si el condómino ya está vinculado, solo reconcilia el nombre coincidente', async () => {
  const { service, state } = createFixture({ existingLink: true });
  const result = await service.registrarRapido(
    { rol: 'ADMINISTRADOR' }, 18, { nombreCompleto: 'María López' }
  );
  assert.equal(result.vinculoExistente, true);
  assert.equal(state.created, 0);
  assert.equal(state.createdLinks, 0);
  assert.equal(state.house.nombre, 'María López');

  const diff = createFixture({ existingLink: true });
  await assert.rejects(diff.service.registrarRapido(
    { rol: 'ADMINISTRADOR' }, 18, { nombreCompleto: 'Nombre distinto' }
  ), e => e.status === 409);
  assert.equal(diff.state.created, 0);
});

test('El formulario exige un nombre válido y deja intacta la vivienda si falla', async () => {
  const { service, state } = createFixture();
  await assert.rejects(service.registrarRapido(
    { rol: 'ADMINISTRADOR' }, 18, { nombreCompleto: ' ' }
  ), e => e.status === 400);
  await assert.rejects(service.registrarRapido(
    { rol: 'ADMINISTRADOR' }, 18, { nombreCompleto: 'X' }
  ), e => e.status === 400);
  assert.equal(state.house.nombre, null);
  assert.equal(state.created, 0);
});

test('El análisis ofrece el botón solo donde falta residente y el modal tiene envío protegido', () => {
  const html = read('docs/analisis-cuotas.html');
  const js = read('docs/assets/js/analisis-cuotas.js');
  const backend = read('backend/src/controllers/finanzas.controller.js');
  const routes = read('backend/src/routes/finanzas.routes.js');
  assert.match(html, /id="financeResidentModal"/);
  assert.match(html, /id="financeResidentForm"/);
  assert.match(html, /id="financeResidentName"[^>]*maxlength="150"/);
  assert.match(js, /function residentCell\(h\)/);
  assert.match(js, /if\(hasResident\(h\)\)return esc\(h.nombre\)/);
  assert.match(js, /data-resident-register/);
  assert.match(js, /request\('\/viviendas\/'\+casaId\+'\/registrar-residente',\{nombreCompleto\}\)/);
  assert.match(js, /const refreshed=await load\(\)/);
  assert.match(backend, /residenteRegistrado:Boolean\(String\(h.nombre\|\|''\)\.trim\(\)\)/);
  assert.match(routes, /registrar-residente/);
  assert.doesNotThrow(() => new Function(js));
});
