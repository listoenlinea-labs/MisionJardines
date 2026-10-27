const { Op } = require('sequelize');
const { crearServicio } = require('../../src/services/auto-users.service');
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
  const service = crearServicio({ db, ...Object.fromEntries(Object.keys(tables).map(key => [key, model(key)])), correoSender, buscarTelefono: async (model, phone) => { const normalize = require('../../src/services/telefono-cuenta.service').normalizarTelefono; if (!normalize(phone)) throw Object.assign(Error('Teléfono inválido'), { status: 400 }); return tables.Usuario.filter(u => normalize(u.telefono) === normalize(phone)).slice(0, 2).map(row => ({ ...row })); }, hashPassword: async p => { hashed.push(p); return 'synthetic-hash:' + p; } });
  return { service, sent, db, hashed, failDelete(table) { failDeleteTable = table; }, get tables() { return tables; }, enabled(value) { enabled = value; }, failSend(value) { failSend = value; } };
}

module.exports = {fixture};
