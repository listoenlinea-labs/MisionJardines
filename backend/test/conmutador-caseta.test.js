const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

Object.assign(process.env, {
  DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: 'caseta_test',
  DB_USER: 'test', DB_PASSWORD: 'unused', JWT_SECRET: 'jwt-test',
  CONMUTADOR_CASETA_HABILITADO: 'true', CONMUTADOR_CASETA_TOKEN: 'agent-test-credential-for-unit-tests'
});
const db = require('../src/config/database');
const { Casa, Usuario, UsuarioCasa } = require('../src/models');
const app = express();
app.use(express.json());
app.use('/api/conmutador/caseta', require('../src/routes/conmutador-caseta.routes'));
app.use('/api/busqueda', require('../src/routes/busqueda.routes'));

test('Seguridad solicita por vivienda y solo el agente autenticado recibe el número', async t => {
  const destino = '5550000100';
  let fila = null;
  let historial;
  t.mock.method(Usuario, 'findByPk', async id => ({
    id, estatus: 'ACTIVO', rol: { nombre: id === 3 ? 'CONDOMINO' : 'SEGURIDAD', activo: true }
  }));
  t.mock.method(UsuarioCasa, 'findOne', async () => null);
  t.mock.method(Casa, 'findAll', async opciones => {
    assert.deepEqual(opciones.include, []);
    return [];
  });
  t.mock.method(db, 'transaction', async run => run({}));
  t.mock.method(db, 'query', async (sql, opciones = {}) => {
    const campos = opciones.replacements || {};
    if (sql.includes('SHOW COLUMNS')) return ['telefono', 'calle', 'numero'].map(Field => ({ Field }));
    if (sql.includes('condominos_importacion')) return [{ telefono: '+52' + destino }];
    if (sql.includes('CREATE TABLE')) return [];
    if (sql.includes('INSERT INTO conmutador_intentos_llamada')) {
      historial = campos;
      return [];
    }
    if (sql.includes("SET solicitud = ")) {
      if (fila && !['FINALIZADA', 'ERROR'].includes(fila.estado)) return [undefined, 0];
      fila = { ...campos, estado: 'PENDIENTE' };
      return [undefined, 1];
    }
    if (sql.includes("SET estado = 'RECLAMADA'")) {
      if (fila.estado !== 'PENDIENTE') return [undefined, 0];
      Object.assign(fila, { estado: 'RECLAMADA', reclamo: campos.reclamo });
      return [undefined, 1];
    }
    if (sql.includes('TIMESTAMPDIFF')) {
      const { solicitud, destino, reclamo } = fila;
      return [{ solicitud, destino, reclamo, vigencia_ms: 20000 }];
    }
    if (sql.includes('SET destino = NULL')) {
      fila.destino = null;
      return [undefined, 1];
    }
    if (sql.includes('SET estado = :estado')) {
      if (campos.solicitud !== fila.solicitud || campos.reclamo !== fila.reclamo) return [undefined, 0];
      if (campos.estado === 'FINALIZADA') assert.match(sql, /THEN UTC_TIMESTAMP/);
      fila.estado = campos.estado;
      return [undefined, 1];
    }
    if (sql.includes('SELECT CASE')) return fila.usuarioId === campos.usuarioId ? [{ estado: fila.estado }] : [];
    assert.fail('Consulta inesperada: ' + sql);
  });
  const servidor = app.listen(0);
  await new Promise(resolve => servidor.once('listening', resolve));
  t.after(() => new Promise(resolve => servidor.close(resolve)));

  const jwtPara = usuarioId => jwt.sign({ usuarioId }, process.env.JWT_SECRET);
  const guardia = jwtPara(1);
  const agente = process.env.CONMUTADOR_CASETA_TOKEN;
  const base = '/api/conmutador/caseta';
  async function llamar(ruta, token, datos) {
    const respuesta = await fetch('http://127.0.0.1:' + servidor.address().port + ruta, {
      method: datos ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: datos ? JSON.stringify(datos) : undefined
    });
    const json = respuesta.headers.get('content-type')?.includes('application/json')
      ? await respuesta.json() : null;
    return { codigo: respuesta.status, json };
  }

  const direccion = { grupo: 'Rosas', numero: '12' };
  const contacto = await llamar(base + '/contactos?grupo=Rosas&numero=12', guardia);
  assert.deepEqual(contacto.json, { ok: true, contactos: ['A'] });
  assert.equal((await llamar(base + '/contactos?grupo=Rosas&numero=12', jwtPara(3))).codigo, 403);
  assert.equal((await llamar('/api/busqueda/conmutador/telefono?grupo=Rosas&numero=12', guardia)).codigo, 403);
  assert.equal((await llamar('/api/busqueda/conmutador?calle=Rosas&numero=12', guardia)).codigo, 200);
  const creada = await llamar(base + '/llamadas', guardia, { ...direccion, contacto: 'A' });
  assert.equal(creada.codigo, 202);
  assert.deepEqual(Object.keys(creada.json), ['ok', 'solicitud']);
  assert.deepEqual(historial, { usuarioId: 1, ...direccion });
  assert.equal((await llamar(base + '/llamadas', guardia, { ...direccion, contacto: 'A' })).codigo, 409);
  assert.equal((await llamar(base + '/agente/siguiente', guardia, {})).codigo, 401);
  const orden = await llamar(base + '/agente/siguiente', agente, {});
  assert.equal(orden.json.destino, destino);
  assert.equal(fila.destino, null);
  assert.equal((await llamar(base + '/agente/siguiente', agente, {})).codigo, 204);
  const { solicitud, reclamo } = orden.json;
  assert.equal((await llamar(base + '/agente/resultado', agente, { solicitud, reclamo, estado: 'ENVIADA' })).codigo, 204);
  assert.deepEqual((await llamar(base + '/llamadas/' + solicitud, guardia)).json, { ok: true, estado: 'ENVIADA' });
  assert.equal((await llamar(base + '/llamadas/' + solicitud, jwtPara(2))).codigo, 404);
  assert.equal((await llamar(base + '/llamadas', guardia, { ...direccion, contacto: 'A' })).codigo, 409);
  assert.equal((await llamar(base + '/agente/resultado', agente, { solicitud, reclamo, estado: 'FINALIZADA' })).codigo, 204);
  assert.deepEqual((await llamar(base + '/llamadas/' + solicitud, guardia)).json, { ok: true, estado: 'FINALIZADA' });
  const reintento = await llamar(base + '/llamadas', guardia, { ...direccion, contacto: 'A' });
  assert.equal(reintento.codigo, 202);
  assert.notEqual(reintento.json.solicitud, solicitud);
  await llamar(base + '/agente/resultado', agente, { solicitud, reclamo, estado: 'FINALIZADA' });
  assert.equal(fila.estado, 'PENDIENTE');
});
