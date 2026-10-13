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
      if (op === Op.in) return value[op].some(x => String(row[key]) === String(x));
      if (op === Op.ne) return value[op] === null ? row[key] != null : String(row[key]) !== String(value[op]);
      if (op === Op.gt) return Number(row[key]) > Number(value[op]);
      throw Error('Unknown operator');
    });
    return row[key] === value || String(row[key]) === String(value);
  });
}
function fixture(condos = [{ id: 1, direccionId: 10, nombreCompleto: 'Persona Uno Prueba', correo: 'persona1@example.com', telefono: '3312345678', activo: true }]) {
  let tables = { Usuario: [], Condomino: condos, Casa: [{ id: 10, calle: 'Calle Prueba', numero: '5' }, { id: 11, calle: 'Otra Calle', numero: 'A-2' }],
    Rol: [{ id: 3, nombre: 'CONDOMINO', activo: true }], UsuarioCasa: [], Invitacion: [], Reporte: [] };
  let chain = Promise.resolve();
  const db = { transaction: async fn => {
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
      async findOrCreate(options) {
        const existing = await this.findOne({ where: options.where });
        return existing ? [existing, false] : [await this.create({ ...options.defaults, ...options.where }), true];
      },
      async update(data, options) { for (const row of tables[table].filter(r => matches(r, options.where))) Object.assign(row, data); }
    };
  }
  const sent = [];
  let enabled = true, failSend = false;
  const whatsapp = {
    configuracion() { if (!enabled) throw Object.assign(Error('not configured'), { status: 503 }); return { frontend: 'https://example.com/portal' }; },
    telefonoWhatsApp: phone => phone && String(phone).replace(/\D/g, '').length >= 10,
    async enviarInvitacion(data) { if (failSend) throw Error('provider failed'); sent.push(data); return 'synthetic-message'; }
  };
  const service = crearServicio({ db, ...Object.fromEntries(Object.keys(tables).map(key => [key, model(key)])), whatsapp, hashPassword: async p => 'synthetic-hash:' + p });
  return { service, sent, get tables() { return tables; }, enabled(value) { enabled = value; }, failSend(value) { failSend = value; } };
}
const tokenFrom = f => new URLSearchParams(new URL(f.sent.at(-1).enlace).hash.slice(1)).get('invitacion');
const acceptBody = { nombreUsuario: 'persona1@example.com', correo: 'persona1@example.com', contrasena: 'ClavePrueba123', confirmarContrasena: 'ClavePrueba123', numeroConfirmado: '5' };

test('repetir crear o crear concurrentemente conserva una sola cuenta y un vínculo inactivo por condómino', async () => {
  const f = fixture(); await Promise.all([f.service.createOne(1), f.service.createOne(1)]); await f.service.crearLote();
  assert.equal(f.tables.Usuario.length, 1); assert.equal(f.tables.UsuarioCasa.length, 1);
  assert.equal(f.tables.Usuario[0].cuentaAceptada, false); assert.equal(f.tables.Usuario[0].estatus, 'PENDIENTE');
  assert.equal(f.tables.Usuario[0].nombreUsuario, 'persona1@example.com'); assert.equal(f.tables.UsuarioCasa[0].activo, false);
});
test('sin e-mail crea usuario por teléfono, concatena nombre en coincidencia y no inventa e-mails', async () => {
  const f = fixture([1, 2, 3].map(id => ({ id, direccionId: id === 3 ? 11 : 10, nombreCompleto: id === 1 ? 'Persona Uno Prueba' : 'Persona Dos Prueba', telefono: '3312345678', correo: null, activo: true })));
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
  assert.equal(f.tables.Reporte[0].estatus, 'CORREGIDO'); assert.equal(f.tables.Condomino[0].direccionId, 11);
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
  const f = fixture([{ id: 1, direccionId: 999, nombreCompleto: 'Persona Prueba', activo: true }, { id: 2, direccionId: 10, nombreCompleto: 'Persona Prueba', activo: false }]);
  const result = await f.service.crearLote(); assert.ok(result.resultados.every(r => r.resultado === 'REVISAR')); assert.equal(f.tables.Usuario.length, 0);
});
test('listing does not expose token hashes/passwords and preserves correction reports after editing', async () => {
  const f = fixture(); await f.service.crearLote(); await f.service.enviarLote();
  await f.service.reportar(tokenFrom(f), 'Datos de mi casa incorrectos.');
  const data = await f.service.listar(1);
  assert.equal(data.reportes.length, 1); assert.equal(data.reportes[0].usuario.id, 1);
  assert.ok(!JSON.stringify(data).includes('contrasenaHash')); assert.ok(!JSON.stringify(data).includes('tokenHash'));
});
