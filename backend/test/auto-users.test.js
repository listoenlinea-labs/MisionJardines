const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Op } = require('sequelize');
const { crearServicio } = require('../src/services/auto-users.service');
process.env.JWT_SECRET = 'synthetic-auto-users-test-secret';

function matches(row, where = {}) {
  return Reflect.ownKeys(where).every(key => {
    if (key === Op.or) return where[key].some(w => matches(row, w));
    const value = where[key];
    if (value && typeof value === 'object') return Reflect.ownKeys(value).every(op => {
      if (op === Op.like) return String(row[key] || '').startsWith(value[op].replace(/%$/, ''));
      if (op === Op.notIn) return !value[op].some(x => String(row[key]) === String(x));
      if (op === Op.in) return value[op].some(x => String(row[key]) === String(x));
      if (op === Op.ne) return value[op] === null ? row[key] != null : String(row[key]) !== String(value[op]);
      if (op === Op.gt) return Number(row[key]) > Number(value[op]);
      throw Error('Unknown operator');
    });
    return row[key] === value || String(row[key]) === String(value);
  });
}
function fixture(condos = [{ id: 1, viviendaIds: [10], nombreCompleto: 'Persona Uno Prueba', correo: 'persona1@example.com', telefono: '3312345678', activo: true }]) {
  let tables = { Usuario: [], Condomino: condos.map(({ viviendaIds, ...person }) => person), Casa: [{ id: 10, calle: 'Calle Prueba', numero: '5' }, { id: 11, calle: 'Otra Calle', numero: 'A-2' }],
    Rol: [{ id: 3, nombre: 'CONDOMINO', activo: true }], UsuarioCasa: [], CondominoVivienda: condos.flatMap(c => c.viviendaIds.map(viviendaId => ({ condominoId: c.id, viviendaId, activo: c.activo }))), Invitacion: [], Reporte: [] };
  let chain = Promise.resolve(), failDeleteTable = null;
  const db = { getQueryInterface: () => ({
    async showAllTables() { return Object.values(db.models || {}).map(model => model.getTableName()); },
    async describeTable(table) { const model = Object.values(db.models || {}).find(model => model.getTableName() === table); return Object.fromEntries(Object.entries(model.rawAttributes).map(([key, value]) => [value.field || key, {}])); }
  }), transaction: async fn => {
    const run = chain.then(async () => {
      const before = structuredClone(tables);
      try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); } catch (e) { tables = before; throw e; }
    }); chain = run.catch(() => {}); return run;
  } };
  function model(table) {
    const pk = table === 'Invitacion' ? 'usuarioId' : 'id';
    const instance = row => row && { ...row, async update(data) { Object.assign(row, data); Object.assign(this, data); return this; } };
    const all = (options = {}) => {
      let rows = tables[table].filter(r => matches(r, options.where));
      if (options.order) rows = [...rows].sort((a, b) => (a[pk] - b[pk]) * (options.order[0][1] === 'DESC' ? -1 : 1));
      if (options.offset) rows = rows.slice(options.offset);
      if (options.limit) rows = rows.slice(0, options.limit);
      return rows.map(row => options.raw ? Object.fromEntries((options.attributes || Object.keys(row)).map(k => [k, row[k]])) : instance(row));
    };
    return {
      async findByPk(id) { return instance(tables[table].find(r => String(r[pk]) === String(id))); },
      async findOne(options) { return all({ ...options, limit: 1 })[0] || null; },
      async findAll(options) { return all(options); },
      async findAndCountAll(options) { return { count: tables[table].filter(r => matches(r, options.where)).length, rows: all(options) }; },
      async create(data) {
        if (table === 'Usuario') for (const field of ['correo', 'nombreUsuario', 'condominoId']) {
          if (data[field] && tables.Usuario.some(u => u[field] === data[field])) throw Object.assign(Error('duplicate'), { name: 'SequelizeUniqueConstraintError' });
        }
        const row = { ...data, ...(pk === 'id' ? { id: Math.max(0, ...tables[table].map(r => Number(r.id))) + 1 } : {}) };
        tables[table].push(row); return instance(row);
      },
      async destroy(options) { if (table === failDeleteTable) throw Object.assign(Error('delete FK'), { name: 'SequelizeForeignKeyConstraintError' }); tables[table] = tables[table].filter(r => !matches(r, options.where)); },
      async findOrCreate(options) {
        const existing = await this.findOne({ where: options.where });
        return existing ? [existing, false] : [await this.create({ ...options.defaults, ...options.where }), true];
      },
      async update(data, options) { for (const row of tables[table].filter(r => matches(r, options.where))) Object.assign(row, data); }
    };
  }
  const sent = [], hashed = [];
  let enabled = true, failSend = false;
  const correoSender = {
    configuracion() { if (!enabled) throw Object.assign(Error('not configured'), { status: 503 }); return { frontend: 'https://example.com/portal' }; },
    correoValido: correo => Boolean(correo) && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(correo),
    async enviarInvitacion(data) { if (failSend) throw Error('provider failed'); sent.push(data); return 'synthetic-message'; }
  };
  const service = crearServicio({ db, ...Object.fromEntries(Object.keys(tables).map(key => [key, model(key)])), correoSender, buscarTelefono: async (model, phone) => { const normalize = require('../src/services/telefono-cuenta.service').normalizarTelefono; if (!normalize(phone)) throw Object.assign(Error('Teléfono inválido'), { status: 400 }); return tables.Usuario.filter(u => normalize(u.telefono) === normalize(phone)).slice(0, 2).map(row => ({ ...row })); }, hashPassword: async p => { hashed.push(p); return 'synthetic-hash:' + p; } });
  return { service, sent, db, hashed, failDelete(table) { failDeleteTable = table; }, get tables() { return tables; }, enabled(value) { enabled = value; }, failSend(value) { failSend = value; } };
}
const tokenFrom = f => new URLSearchParams(new URL(f.sent.at(-1).enlace).hash.slice(1)).get('invitacion');
const acceptBody = { nombreUsuario: 'persona1@example.com', correo: 'persona1@example.com', contrasena: 'ClavePrueba123', confirmarContrasena: 'ClavePrueba123', numeroConfirmado: '5' };

test('validar comprueba credenciales sin número, sin hash, sin activar ni consumir el enlace', async () => {
  const f = fixture(); await f.service.crearLote(); await f.service.enviarLote(); const token = tokenFrom(f);
  const before = structuredClone(f.tables), hashes = f.hashed.length;
  const { numeroConfirmado, ...body } = acceptBody;
  assert.deepEqual(await f.service.validar(token, body), { valido: true });
  assert.deepEqual(f.tables, before); assert.equal(f.hashed.length, hashes);
  await f.service.aceptar(token, acceptBody); // La validación no consumió el enlace.
});
test('validar rechaza formato, contraseñas y conflictos antes de confirmar vivienda', async () => {
  const f = fixture(); await f.service.crearLote(); await f.service.enviarLote(); const token = tokenFrom(f);
  const before = structuredClone(f.tables);
  for (const patch of [{ correo: 'correo-invalido' }, { nombreUsuario: 'a b' }, { nombreUsuario: 'ab' },
    { confirmarContrasena: 'diferente' }, ...['abc123', 'soloMinusculas', 'SOLOMAYUSCULAS123', 'solo123456', 'Aa1' + 'é'.repeat(35)].map(contrasena => ({ contrasena, confirmarContrasena: contrasena }))]) {
    await assert.rejects(f.service.validar(token, { ...acceptBody, ...patch }), { status: 400 });
  }
  assert.deepEqual(f.tables, before);
  f.tables.Usuario.push({ id: 9, nombreUsuario: 'reservado', correo: 'otro@example.com' });
  for (const patch of [{ nombreUsuario: 'reservado' }, { correo: 'otro@example.com' }, { nombreUsuario: 'otro@example.com' }]) {
    await assert.rejects(f.service.validar(token, { ...acceptBody, ...patch }), { status: 409 });
  }
  assert.equal(f.tables.Usuario[0].cuentaAceptada, false);
});
test('validar requiere enlace vigente y aceptar revalida disponibilidad tras una comprobación exitosa', async () => {
  const f = fixture(); await f.service.crearLote(); await f.service.enviarLote(); const token = tokenFrom(f);
  await assert.rejects(f.service.validar('invalido', acceptBody), { status: 410 });
  const data = { ...acceptBody, nombreUsuario: 'nuevo-usuario' };
  await f.service.validar(token, data);
  f.tables.Usuario.push({ id: 9, nombreUsuario: 'nuevo-usuario', correo: null });
  await assert.rejects(f.service.aceptar(token, data), { status: 409 });
  assert.equal(f.tables.Usuario[0].cuentaAceptada, false); assert.ok(f.tables.Invitacion[0].tokenHash);
  f.tables.Invitacion[0].expiraEn = new Date(0);
  await assert.rejects(f.service.validar(token, acceptBody), { status: 410 });
});

test('repetir crear o crear concurrentemente conserva una sola cuenta y un vínculo inactivo por condómino', async () => {
  const f = fixture(); await Promise.all([f.service.createOne(1), f.service.createOne(1)]); await f.service.crearLote();
  assert.equal(f.tables.Usuario.length, 1); assert.equal(f.tables.UsuarioCasa.length, 1);
  assert.equal(f.tables.Usuario[0].cuentaAceptada, false); assert.equal(f.tables.Usuario[0].estatus, 'PENDIENTE');
  assert.equal(f.tables.Usuario[0].nombreUsuario, 'persona1@example.com'); assert.equal(f.tables.UsuarioCasa[0].activo, false);
});
test('sin e-mail crea usuario por teléfono, concatena nombre en coincidencia y no inventa e-mails', async () => {
  const f = fixture([1, 2, 3].map(id => ({ id, viviendaIds: [id === 3 ? 11 : 10], nombreCompleto: id === 1 ? 'Persona Uno Prueba' : 'Persona Dos Prueba', telefono: '3312345678', correo: null, activo: true })));
  await f.service.crearLote(); assert.equal(f.tables.Usuario.length, 3);
  assert.equal(f.tables.Usuario[0].nombreUsuario, '3312345678');
  assert.equal(f.tables.Usuario[1].nombreUsuario, '3312345678personadosprueba');
  assert.equal(f.tables.Usuario[2].nombreUsuario, '3312345678personadosprueba.3');
  assert.ok(f.tables.Usuario.every(u => u.correo === null));
});
test('vincula cuenta activa coincidente sin recrearla y no une identidades incompatibles', async () => {
  const f = fixture(); f.tables.Usuario.push({ id: 8, correo: 'persona1@example.com', nombre: 'Persona', apellidoPaterno: 'Uno', apellidoMaterno: 'Prueba', casaId: 10, rolId: 3, estatus: 'ACTIVO', cuentaAceptada: true });
  await f.service.createOne(1); assert.equal(f.tables.Usuario.length, 1); assert.equal(f.tables.Usuario[0].condominoId, 1);
  const wrong = fixture(); wrong.tables.Usuario.push({ id: 8, correo: 'persona1@example.com', nombre: 'Otra Persona', casaId: 11, rolId: 3, estatus: 'ACTIVO' });
  const result = await wrong.service.crearLote(); assert.equal(result.resultados[0].resultado, 'REVISAR'); assert.equal(wrong.tables.Usuario.length, 1);
});
test('resend rotates unique tokens, stores only hash and accepted accounts are never invited again', async () => {
  const f = fixture(); await f.service.crearLote(); await f.service.enviarLote(); const old = tokenFrom(f);
  assert.equal(f.tables.Invitacion[0].tokenHash, crypto.createHash('sha256').update(old).digest('hex'));
  assert.ok(!JSON.stringify(f.tables).includes(old)); await f.service.enviarLote(); const next = tokenFrom(f); assert.notEqual(next, old);
  await assert.rejects(f.service.consultar(old), { status: 410 });
  const accepted = await f.service.aceptar(next, acceptBody);
  assert.equal(accepted.usuario.cuentaAceptada, true); assert.ok(accepted.token); assert.equal(f.tables.Usuario[0].estatus, 'ACTIVO');
  assert.equal(f.tables.UsuarioCasa[0].activo, true); assert.equal(f.tables.Invitacion[0].tokenHash, null);
  assert.ok(!JSON.stringify(accepted).includes('contrasenaHash'));
  await assert.rejects(f.service.aceptar(next, acceptBody), { status: 410 });
  await f.service.enviarLote(); assert.equal(f.sent.length, 2); await f.service.crearLote(); assert.equal(f.tables.Usuario.length, 1);
});
test('wrong house and body house/role tampering cannot activate or reassign preregistration', async () => {
  const f = fixture(); await f.service.crearLote(); await f.service.enviarLote(); const token = tokenFrom(f);
  await assert.rejects(f.service.aceptar(token, { ...acceptBody, numeroConfirmado: '7', casaId: 11, rolId: 1 }), { status: 400 });
  assert.equal(f.tables.Usuario[0].cuentaAceptada, false); assert.equal(f.tables.UsuarioCasa[0].activo, false);
  await f.service.aceptar(token, { ...acceptBody, casaId: 11, rolId: 1, cuentaAceptada: true });
  assert.equal(f.tables.Usuario[0].casaId, 10); assert.equal(f.tables.Usuario[0].rolId, 3);
});
test('error report revokes old link; correction moves household and individual resend permits corrected activation', async () => {
  const f = fixture(); await f.service.crearLote(); await f.service.enviarLote(); const old = tokenFrom(f);
  await f.service.reportar(old, 'Mi vivienda es Otra Calle A-2.');
  assert.equal(f.tables.Reporte[0].estatus, 'ABIERTO'); await assert.rejects(f.service.consultar(old), { status: 410 });
  const blocked = await f.service.enviarLote(); assert.equal(blocked.resultados[0].resultado, 'REVISAR'); assert.equal(f.sent.length, 1);
  await f.service.editar(1, { nombreCompleto: 'Persona Uno Prueba', casaId: 11, nombreUsuario: 'persona-nueva', correo: 'corregido@example.com', telefono: '3312345678' }, 100);
  assert.equal(f.tables.Reporte[0].estatus, 'CORREGIDO'); assert.deepEqual(f.tables.CondominoVivienda.filter(l => l.condominoId === 1 && l.activo).map(l => l.viviendaId), [11]);
  await f.service.enviarLote(0, 1); const next = tokenFrom(f); assert.notEqual(next, old);
  await assert.rejects(f.service.aceptar(next, acceptBody), { status: 400 });
  const accepted = await f.service.aceptar(next, { ...acceptBody, nombreUsuario: 'persona-nueva', correo: 'corregido@example.com', numeroConfirmado: ' A-2 ' });
  assert.equal(accepted.usuario.casaId, 11); assert.equal(f.tables.UsuarioCasa.find(l => l.casaId === 10).activo, false);
  assert.equal(f.tables.UsuarioCasa.find(l => l.casaId === 11).activo, true);
});
test('expired invitation, password mismatch and username/email collision remain inactive', async () => {
  const f = fixture(); await f.service.crearLote(); await f.service.enviarLote(); const token = tokenFrom(f);
  await assert.rejects(f.service.aceptar(token, { ...acceptBody, confirmarContrasena: 'otra' }), { status: 400 });
  f.tables.Usuario.push({ id: 9, nombreUsuario: 'reservado', correo: 'otro@example.com' });
  await assert.rejects(f.service.aceptar(token, { ...acceptBody, nombreUsuario: 'otro@example.com' }), { status: 409 });
  f.tables.Invitacion[0].expiraEn = new Date(Date.now() - 1000);
  await assert.rejects(f.service.consultar(token), { status: 410 }); assert.equal(f.tables.Usuario[0].cuentaAceptada, false);
});
test('provider not configured does not fake sending; network error is recorded without losing account', async () => {
  const f = fixture(); await f.service.crearLote(); f.enabled(false);
  await assert.rejects(f.service.enviarLote(), { status: 503 }); assert.equal(f.tables.Invitacion[0].tokenHash, undefined);
  f.enabled(true); f.failSend(true); const result = await f.service.enviarLote();
  assert.equal(result.resultados[0].resultado, 'ERROR'); assert.equal(f.tables.Invitacion[0].envioEstado, 'ERROR'); assert.equal(f.tables.Usuario.length, 1);
});
test('inactive or invalid condominium is reported without leaving partial users', async () => {
  const f = fixture([{ id: 1, viviendaIds: [999], nombreCompleto: 'Persona Prueba', activo: true }, { id: 2, viviendaIds: [10], nombreCompleto: 'Persona Prueba', activo: false }]);
  const result = await f.service.crearLote(); assert.ok(result.resultados.every(r => r.resultado === 'REVISAR')); assert.equal(f.tables.Usuario.length, 0);
});
test('listing does not expose token hashes/passwords and preserves correction reports after editing', async () => {
  const f = fixture(); await f.service.crearLote(); await f.service.enviarLote();
  await f.service.reportar(tokenFrom(f), 'Datos de mi casa incorrectos.');
  const data = await f.service.listar(1);
  assert.equal(data.reportes.length, 1); assert.equal(data.reportes[0].usuario.id, 1);
  assert.ok(!JSON.stringify(data).includes('contrasenaHash')); assert.ok(!JSON.stringify(data).includes('tokenHash'));
});

test('prueba individual crea exactamente una cuenta ficticia, idempotente, sin correo configurado', async () => {
  const f = fixture(); f.enabled(false);
  assert.deepEqual((await f.service.viviendasPrueba()).map(c => c.id), [10]);
  const key = 'a'.repeat(32);
  const [first, repeated] = await Promise.all([f.service.crearPrueba(10, key), f.service.crearPrueba(10, key)]);
  assert.equal(first.usuarioId, repeated.usuarioId);
  assert.equal(f.tables.Usuario.length, 1); assert.equal(f.tables.Condomino.length, 2);
  assert.equal(f.tables.Condomino[0].correo, 'persona1@example.com');
  assert.equal(f.tables.Usuario[0].telefono, null);
  const link = await f.service.enlacePrueba(first.usuarioId, 'https://example.com/portal/');
  const token = new URLSearchParams(new URL(link.enlace).hash.slice(1)).get('invitacion');
  assert.equal((await f.service.consultar(token)).numero, '5');
  assert.equal(f.tables.Invitacion[0].envioEstado, 'PRUEBA_SIN_ENVIO');
  assert.ok(!JSON.stringify(f.tables).includes(token));
  await assert.rejects(f.service.aceptar(token, { ...acceptBody, numeroConfirmado: 'wrong' }), { status: 400 });
  assert.equal(f.tables.Usuario[0].cuentaAceptada, false);
  await f.service.aceptar(token, acceptBody);
  assert.equal(f.tables.Usuario[0].cuentaAceptada, true);
  await assert.rejects(f.service.enlacePrueba(first.usuarioId, 'https://example.com'), { status: 409 });
  await assert.rejects(f.service.consultar(token), { status: 410 });
  assert.equal((await f.service.crearPrueba(10, key)).cuentaAceptada, true);
  assert.equal(f.tables.Usuario.length, 1); assert.equal(f.sent.length, 0);
});
test('prueba rechaza viviendas reales, revoca enlaces, exige corregir reportes y excluye envíos masivos', async () => {
  const f = fixture();
  await assert.rejects(f.service.crearPrueba(11, 'b'.repeat(32)), { status: 400 });
  assert.equal(f.tables.Condomino.length, 1);
  const trial = await f.service.crearPrueba(10, 'b'.repeat(32));
  const getToken = async () => new URLSearchParams(new URL((await f.service.enlacePrueba(trial.usuarioId, 'https://example.com')).enlace).hash.slice(1)).get('invitacion');
  const old = await getToken(), next = await getToken();
  await assert.rejects(f.service.consultar(old), { status: 410 });
  await f.service.reportar(next, 'Quiero corregir mi nombre de prueba.');
  await assert.rejects(getToken(), { status: 409 });
  await assert.rejects(f.service.editar(trial.usuarioId, { ...acceptBody, nombreCompleto: 'Prueba Corregida', casaId: 11 }, 100), { status: 400 });
  await f.service.editar(trial.usuarioId, { ...acceptBody, nombreCompleto: 'Prueba Corregida', casaId: 10, telefono: '3312345678' }, 100);
  const corrected = await getToken();
  assert.equal((await f.service.consultar(corrected)).nombre, 'Prueba Corregida');
  const results = await f.service.enviarLote();
  assert.equal(results.resultados[0].resultado, 'PRUEBA_SIN_ENVIO');
  assert.equal(f.sent.length, 0);
  assert.equal((await f.service.consultar(corrected)).numero, '5');
  await assert.rejects(f.service.enlacePrueba(trial.usuarioId, 'http://evil.example'), { status: 400 });
});
test('envío individual de prueba usa SMTP, conserva exclusión masiva/pública y permite aceptar su enlace', async () => {
  const f = fixture(); const trial = await f.service.crearPrueba(10, '1'.repeat(32));
  await f.service.editarPrueba(trial.usuarioId, { nombreCompleto: 'Prueba Correo', casaId: 10,
    nombreUsuario: 'prueba-correo', correo: 'smtp-trial@example.com', telefono: '3312345678' }, 100);
  const before = await f.service.enlacePrueba(trial.usuarioId, 'https://example.com');
  const oldToken = new URLSearchParams(new URL(before.enlace).hash.slice(1)).get('invitacion');
  const result = await f.service.enviarLote(0, trial.usuarioId);
  assert.equal(result.resultados[0].resultado, 'ENVIADO'); assert.equal(result.siguiente, null);
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].correo, 'smtp-trial@example.com');
  assert.equal(f.tables.Invitacion[0].envioEstado, 'ENVIADO');
  assert.match(f.tables.Usuario[0].observaciones, /^AUTO_USERS_PRUEBA:/);
  assert.equal(f.tables.Usuario[0].cuentaAceptada, false);
  const token = tokenFrom(f);
  await assert.rejects(f.service.consultar(oldToken), { status: 410 });
  assert.equal((await f.service.enviarLote()).resultados[0].resultado, 'PRUEBA_SIN_ENVIO');
  assert.equal((await f.service.sendOne(trial.usuarioId, true, true)).resultado, 'PRUEBA_SIN_ENVIO');
  await assert.rejects(f.service.enviarPorTelefono('3312345678'), { status: 409 });
  assert.equal(f.sent.length, 1); assert.equal((await f.service.consultar(token)).numero, '5');
  await f.service.aceptar(token, { ...acceptBody, nombreUsuario: 'prueba-correo', correo: 'smtp-trial@example.com' });
  assert.equal((await f.service.enviarLote(0, trial.usuarioId)).resultados[0].resultado, 'ACEPTADA_O_NO_ELEGIBLE');
  assert.equal(f.sent.length, 1);
});
test('envío individual de prueba conserva controles de correo, reportes, vivienda y fallos SMTP', async () => {
  const f = fixture(); const trial = await f.service.crearPrueba(10, '2'.repeat(32));
  f.tables.Usuario[0].correo = null;
  assert.equal((await f.service.enviarLote(0, trial.usuarioId)).resultados[0].resultado, 'REVISAR');
  assert.equal(f.sent.length, 0);
  f.tables.Usuario[0].correo = 'smtp-trial@example.com';
  f.tables.Reporte.push({ usuarioId: trial.usuarioId, estatus: 'ABIERTO' });
  assert.equal((await f.service.enviarLote(0, trial.usuarioId)).resultados[0].resultado, 'REVISAR');
  f.tables.Reporte.length = 0;
  f.tables.Casa[0].calle = 'Calle Residencial';
  assert.equal((await f.service.enviarLote(0, trial.usuarioId)).resultados[0].resultado, 'REVISAR');
  assert.equal(f.sent.length, 0);
  f.tables.Casa[0].calle = 'Calle Prueba'; f.failSend(true);
  assert.equal((await f.service.enviarLote(0, trial.usuarioId)).resultados[0].resultado, 'ERROR');
  assert.equal(f.tables.Invitacion[0].envioEstado, 'ERROR');
  assert.equal(f.tables.Usuario[0].cuentaAceptada, false);
});
test('fallo creando prueba revierte también el condómino ficticio', async () => {
  const f = fixture(); f.tables.Rol[0].activo = false;
  await assert.rejects(f.service.crearPrueba(10, 'c'.repeat(32)), { status: 503 });
  assert.equal(f.tables.Condomino.length, 1); assert.equal(f.tables.Usuario.length, 0);
});

test('vista de pruebas omite cuentas reales y secretos; edita pendiente/aceptada conservando estado y vínculos', async () => {
  const f = fixture(); await f.service.createOne(1);
  const trial = await f.service.crearPrueba(10, 'd'.repeat(32));
  let list = await f.service.listarPruebas(); assert.equal(list.total, 1); assert.equal(list.registros[0].id, trial.usuarioId);
  assert.ok(!JSON.stringify(list).includes('contrasenaHash')); assert.ok(!JSON.stringify(list).includes('AUTO_USERS_PRUEBA:'));
  await assert.rejects(f.service.editarPrueba(1, { ...acceptBody, casaId: 10, nombreCompleto: 'Cambio indebido' }, 100), { status: 403 });
  await f.service.editarPrueba(trial.usuarioId, { ...acceptBody, nombreUsuario: 'trial-edit', correo: 'trial-edit@example.com', casaId: 10, nombreCompleto: 'Prueba Editada', telefono: '3312345678' }, 100);
  list = await f.service.listarPruebas(); assert.equal(list.registros[0].condomino.nombreCompleto, 'Prueba Editada');
  assert.equal(list.registros[0].cuentaAceptada, false);
  const link = await f.service.enlacePrueba(trial.usuarioId, 'https://example.com');
  const token = new URLSearchParams(new URL(link.enlace).hash.slice(1)).get('invitacion');
  assert.ok(!JSON.stringify(await f.service.listarPruebas()).includes('tokenHash'));
  await f.service.aceptar(token, { ...acceptBody, nombreUsuario: 'trial-edit', correo: 'trial-edit@example.com' });
  const beforeVersion = f.tables.Usuario[1].sesionVersion;
  await f.service.editarPrueba(trial.usuarioId, { ...acceptBody, nombreUsuario: 'trial-updated', correo: 'updated@example.com', casaId: 10, nombreCompleto: 'Prueba Actualizada' }, 100);
  assert.equal(f.tables.Usuario[1].cuentaAceptada, true); assert.equal(f.tables.Usuario[1].estatus, 'ACTIVO');
  assert.equal(f.tables.Usuario[1].sesionVersion, beforeVersion + 1);
  assert.equal(f.tables.UsuarioCasa.find(l => l.usuarioId === trial.usuarioId).activo, true);
  assert.equal(f.tables.Usuario[0].nombreUsuario, 'persona1@example.com');
  await f.service.borrarPrueba(trial.usuarioId); assert.equal(f.tables.Usuario.length, 1);
});
test('borrar prueba elimina solo registros ficticios e invalida enlace y cuenta; conserva vivienda y usuarios reales', async () => {
  const f = fixture(); await f.service.createOne(1);
  const trial = await f.service.crearPrueba(10, 'e'.repeat(32));
  const link = await f.service.enlacePrueba(trial.usuarioId, 'https://example.com');
  const token = new URLSearchParams(new URL(link.enlace).hash.slice(1)).get('invitacion');
  await f.service.reportar(token, 'Reporte de prueba para borrar.');
  await assert.rejects(f.service.borrarPrueba(1), { status: 403 });
  await f.service.borrarPrueba(trial.usuarioId);
  assert.equal(f.tables.Usuario.length, 1); assert.equal(f.tables.Condomino.length, 1);
  assert.equal(f.tables.UsuarioCasa.length, 1); assert.equal(f.tables.Invitacion.length, 1); assert.equal(f.tables.Reporte.length, 0);
  assert.equal(f.tables.Casa.length, 2); assert.equal((await f.service.listarPruebas()).total, 0);
  await assert.rejects(f.service.consultar(token), { status: 410 });
  await f.service.crearPrueba(10, 'e'.repeat(32)); assert.equal((await f.service.listarPruebas()).total, 1);
});
test('borrado bloquea historial de otros módulos y revierte toda eliminación al fallar una FK', async () => {
  const f = fixture(); const trial = await f.service.crearPrueba(10, 'f'.repeat(32));
  f.db.models = { Pago: { getTableName: () => 'pagos', rawAttributes: { usuarioId: { references: { model: 'usuarios' } } }, async findOne() { return { id: 99 }; } } };
  await assert.rejects(f.service.borrarPrueba(trial.usuarioId), { status: 409 });
  assert.equal(f.tables.Usuario.length, 1); assert.equal(f.tables.Invitacion.length, 1);
  f.db.models.Pago.findOne = async () => { throw Object.assign(Error('FK failure'), { name: 'SequelizeForeignKeyConstraintError' }); };
  await assert.rejects(f.service.borrarPrueba(trial.usuarioId), { status: 503 });
  assert.equal(f.tables.Usuario.length, 1); assert.equal(f.tables.Condomino.length, 2);
  f.db.models = {}; f.failDelete('Usuario');
  await assert.rejects(f.service.borrarPrueba(trial.usuarioId), { name: 'SequelizeForeignKeyConstraintError' });
  assert.equal(f.tables.Invitacion.length, 1); assert.equal(f.tables.UsuarioCasa.length, 1);
  f.failDelete(null); await f.service.borrarPrueba(trial.usuarioId); assert.equal(f.tables.Usuario.length, 0);
});

test('borrado usa solo columnas físicas de referencia y no consulta modelos/tablas ausentes', async () => {
  const f = fixture(); const trial = await f.service.crearPrueba(10, '1'.repeat(32));
  let checked = false;
  f.db.models = {
    Legacy: { getTableName: () => 'pagos_legacy', rawAttributes: {
      usuarioId: { field: 'usuario_id', references: { model: 'usuarios' } },
      usuarioRevisadoId: { field: 'revisado_por', references: { model: 'usuarios' } },
      columnaNueva: { field: 'columna_nueva' }
    }, async findOne(options) {
      checked = true;
      assert.deepEqual(options.attributes, ['usuarioId']);
      assert.deepEqual(Reflect.ownKeys(options.where[Op.or][0]), ['usuarioId']);
      assert.equal(options.transaction.LOCK.UPDATE, 'UPDATE');
      return null;
    } },
    Optional: { getTableName: () => 'modulo_ausente', rawAttributes: { usuarioId: { field: 'usuario_id' } }, async findOne() { throw Error('Must not query absent table'); } }
  };
  f.db.getQueryInterface = () => ({ async showAllTables() { return ['pagos_legacy']; }, async describeTable() { return { id: {}, usuario_id: {} }; } });
  await f.service.borrarPrueba(trial.usuarioId);
  assert.equal(checked, true); assert.equal(f.tables.Usuario.length, 0);
});
test('error al revisar historial tiene mensaje accionable y mantiene cuenta/invitación intactas', async () => {
  const f = fixture(); const trial = await f.service.crearPrueba(10, '2'.repeat(32));
  f.db.models = { Legacy: { getTableName: () => 'pagos_legacy', rawAttributes: { usuarioId: { field: 'usuario_id' } }, async findOne() { throw Error('SQL must not be exposed'); } } };
  await assert.rejects(f.service.borrarPrueba(trial.usuarioId), error => error.status === 503 && /pagos_legacy/.test(error.message) && !/SQL must/.test(error.message));
  assert.equal(f.tables.Usuario.length, 1); assert.equal(f.tables.Invitacion.length, 1);
});

test('acceso por teléfono distingue aceptada, prerregistro, desconocida, bloqueada y número compartido sin devolver datos privados', async () => {
  const f = fixture();
  assert.equal((await f.service.consultarTelefono('3312345678')).estado, 'NUEVA');
  await f.service.createOne(1);
  const state = await f.service.consultarTelefono('+52 (33) 1234-5678');
  assert.deepEqual(state, { estado: 'PRERREGISTRO' }); assert.equal(f.sent.length, 0);
  const result = await f.service.enviarPorTelefono('3312345678');
  assert.ok(result.mensaje); assert.equal(result.enlace, undefined); assert.equal(result.registro, undefined);
  assert.ok(!JSON.stringify(result).includes('persona1@example.com'));
  const firstHash = f.tables.Invitacion[0].tokenHash;
  await f.service.enviarPorTelefono('3312345678');
  assert.equal(f.sent.length, 1); assert.equal(f.tables.Invitacion[0].tokenHash, firstHash);
  f.tables.Usuario[0].cuentaAceptada = true; f.tables.Usuario[0].estatus = 'ACTIVO';
  assert.deepEqual(await f.service.consultarTelefono('3312345678'), { estado: 'ACEPTADA' });
  await assert.rejects(f.service.enviarPorTelefono('3312345678'), { status: 409 });
  f.tables.Usuario[0].estatus = 'BLOQUEADO';
  assert.equal((await f.service.consultarTelefono('3312345678')).estado, 'REVISION');
  f.tables.Usuario.push({ id: 2, telefono: '52 33 1234 5678', estatus: 'ACTIVO', cuentaAceptada: true });
  assert.equal((await f.service.consultarTelefono('3312345678')).estado, 'REVISION');
  await assert.rejects(f.service.enviarPorTelefono('3312345678'), { status: 409 });
  await assert.rejects(f.service.consultarTelefono('3312345678 / 3398765432'), { status: 400 });
});
test('invitaciones SMTP no requieren teléfono y rechazan cuentas sin correo sin simular envío', async () => {
  const f = fixture(); await f.service.createOne(1); f.tables.Usuario[0].telefono = null;
  assert.equal((await f.service.enviarLote()).resultados[0].resultado, 'ENVIADO');
  assert.equal(f.sent[0].correo, 'persona1@example.com'); assert.equal(f.sent[0].telefono, undefined);
  f.tables.Usuario[0].correo = null;
  const before = f.tables.Invitacion[0].tokenHash;
  const retry = await f.service.enviarLote();
  assert.equal(retry.resultados[0].resultado, 'REVISAR'); assert.match(retry.resultados[0].mensaje, /correo/);
  assert.equal(f.tables.Invitacion[0].tokenHash, before); assert.equal(f.sent.length, 1);
});

test('varias viviendas requieren confirmar todas; no basta la principal ni IDs repetidos', async () => {
  const f = fixture();
  f.tables.CondominoVivienda.push({ condominoId: 1, viviendaId: 11, activo: true });
  await f.service.createOne(1); await f.service.createOne(1);
  assert.equal(f.tables.Usuario.length, 1);
  assert.deepEqual(f.tables.UsuarioCasa.map(l => [l.casaId, l.activo]), [[10, false], [11, false]]);
  await f.service.sendOne(1); const token = tokenFrom(f);
  assert.equal((await f.service.consultar(token)).viviendas.length, 2);
  for (const viviendasConfirmadas of [undefined, [{ id: 10, numero: '5' }], [{ id: 10, numero: '5' }, { id: 10, numero: '5' }], [{ id: 10, numero: '5' }, { id: 11, numero: 'incorrecto' }]]) {
    await assert.rejects(f.service.aceptar(token, { ...acceptBody, viviendasConfirmadas }), { status: 400 });
    assert.equal(f.tables.Usuario[0].cuentaAceptada, false);
    assert.ok(f.tables.UsuarioCasa.every(l => !l.activo));
  }
  await f.service.aceptar(token, { ...acceptBody, viviendasConfirmadas: [{ id: 10, numero: '5' }, { id: 11, numero: 'a-2' }] });
  assert.ok(f.tables.UsuarioCasa.every(l => l.activo));
});
test('vínculos inactivos no se recuperan desde direccion_id y no conceden acceso', async () => {
  const f = fixture(); f.tables.CondominoVivienda[0].activo = false;
  await assert.rejects(f.service.createOne(1), { status: 409 });
  assert.equal(f.tables.Usuario.length, 0);
  f.tables.CondominoVivienda.push({ condominoId: 1, viviendaId: 11, activo: true });
  await f.service.createOne(1);
  assert.equal(f.tables.Usuario[0].casaId, 11);
  assert.deepEqual(f.tables.UsuarioCasa.map(l => l.casaId), [11]);
});
test('corregir un preregistro cambia el conjunto completo, invalida el enlace y conserva otras personas', async () => {
  const f = fixture(); await f.service.createOne(1); await f.service.sendOne(1); const old = tokenFrom(f);
  f.tables.CondominoVivienda.push({ condominoId: 2, viviendaId: 10, activo: true });
  const body = { nombreCompleto: 'Persona Uno Prueba', casaId: 11, viviendaIds: [10, 11], nombreUsuario: 'persona1@example.com', correo: 'persona1@example.com' };
  await f.service.editar(1, body, 99);
  await assert.rejects(f.service.consultar(old), { status: 410 });
  assert.equal(f.tables.CondominoVivienda.find(l => l.condominoId === 2).activo, true);
  assert.ok(f.tables.UsuarioCasa.every(l => !l.activo));
  await assert.rejects(f.service.editar(1, { ...body, viviendaIds: undefined }, 99), { status: 409 });
  await assert.rejects(f.service.editar(1, { ...body, viviendaIds: [10, 999] }, 99), { status: 400 });
  await f.service.editar(1, { ...body, viviendaIds: [11] }, 99);
  assert.equal(f.tables.CondominoVivienda.find(l => l.condominoId === 1 && l.viviendaId === 10).activo, false);
  assert.equal(f.tables.CondominoVivienda.find(l => l.condominoId === 1 && l.viviendaId === 11).activo, true);
});
test('las viviendas cambiadas después de consultar requieren una confirmación nueva', async () => {
  const f = fixture(); await f.service.createOne(1); await f.service.sendOne(1); const token = tokenFrom(f);
  await f.service.consultar(token);
  f.tables.CondominoVivienda.push({ condominoId: 1, viviendaId: 11, activo: true });
  await assert.rejects(f.service.aceptar(token, acceptBody), { status: 400 });
  assert.equal(f.tables.Usuario[0].cuentaAceptada, false);
});
test('una cuenta aceptada conserva sus permisos al repetir crear; no recibe viviendas por coincidencia', async () => {
  const f = fixture(); await f.service.createOne(1); await f.service.sendOne(1);
  await f.service.aceptar(tokenFrom(f), acceptBody);
  f.tables.CondominoVivienda.push({ condominoId: 1, viviendaId: 11, activo: true });
  await f.service.createOne(1);
  assert.deepEqual(f.tables.UsuarioCasa.filter(l => l.activo).map(l => l.casaId), [10]);
});
test('borrar prueba elimina también sus vínculos de padrón y conserva la vivienda', async () => {
  const f = fixture(); const trial = await f.service.crearPrueba(10, 'f'.repeat(32));
  await f.service.borrarPrueba(trial.usuarioId);
  assert.ok(!f.tables.CondominoVivienda.some(l => l.condominoId === trial.condominoId));
  assert.equal(f.tables.Casa.length, 2);
  assert.ok(f.tables.CondominoVivienda.some(l => l.condominoId === 1));
});


test('pruebas y correcciones guardan personas sin columna de dirección heredada', async () => {
  const f = fixture();
  const trial = await f.service.crearPrueba(10, 'e'.repeat(32));
  const person = f.tables.Condomino.find(c => c.id === trial.condominoId);
  assert.ok(!Object.hasOwn(person, 'direccionId'));
  await f.service.editarPrueba(trial.usuarioId, { nombreCompleto: 'Persona de Prueba', casaId: 10,
    viviendaIds: [10], nombreUsuario: 'prueba-sin-direccion', correo: 'trial@example.com' }, 99);
  assert.ok(f.tables.Condomino.every(c => !Object.hasOwn(c, 'direccionId')));
  assert.deepEqual(f.tables.CondominoVivienda.filter(l => l.condominoId === person.id && l.activo).map(l => l.viviendaId), [10]);
});
