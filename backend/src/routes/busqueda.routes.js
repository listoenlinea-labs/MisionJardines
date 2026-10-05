const express = require('express');
const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { Casa, Condomino, Cuota, Visita, Acceso, Evento, PagoReportado } = require('../models');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');

const router = express.Router();
router.use(autenticarToken);

const personnel = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'SEGURIDAD'];
const finance = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'CONDOMINO'];
const like = value => `%${value.replace(/[\\%_]/g, '\\$&')}%`;
const normalize = value => typeof value === 'string' ? value.trim().slice(0, 80) : '';
const house = { model: Casa, as: 'casa', attributes: ['id', 'calle', 'numero'] };
const fields = (term, names) => ({ [Op.or]: names.map(name => ({ [name]: { [Op.like]: term } })) });

router.get('/', async (req, res) => {
  const q = normalize(req.query.q);
  const result = { ok: true, casas: [], residentes: [], cuotas: [], visitas: [], accesos: [], eventos: [], pagos: [] };
  if (q.length < 2) return res.json(result);
  const term = like(q);
  const numeric = /^\d{1,9}$/.test(q) ? Number(q) : null;
  const role = req.usuario.rol;
  try {
    const queries = [];
    if (personnel.includes(role)) {
      queries.push(Casa.findAll({ attributes: ['id', 'calle', 'numero'], where: fields(term, ['calle', 'numero', 'nombre', 'telefono', 'correo']), limit: 5, order: [['calle', 'ASC'], ['numero', 'ASC']] }).then(rows => { result.casas = rows; }));
      queries.push(Condomino.findAll({ attributes: ['id', 'nombreCompleto'], where: { activo: true, ...fields(term, ['nombreCompleto', 'telefono', 'correo']) }, include: [house], limit: 5, order: [['nombreCompleto', 'ASC']] }).then(rows => { result.residentes = rows; }));
      if (['SUPER_ADMIN', 'ADMINISTRADOR', 'SEGURIDAD'].includes(role)) queries.push(Acceso.findAll({ attributes: ['id', 'nombre', 'tipo', 'placas', 'fechaEntrada'], where: fields(term, ['nombre', 'placas', 'proveedor', 'motivo', 'telefono', 'tipo']), include: [house], limit: 5, order: [['fechaEntrada', 'DESC']] }).then(rows => { result.accesos = rows; }));
    }
    if (finance.includes(role)) {
      const where = fields(term, ['nombrePagador', 'folio', 'calleSnapshot', 'numeroCasaSnapshot', 'mes', 'estatusPago']);
      if (numeric !== null) where[Op.or].push({ anio: numeric }, { id: numeric });
      if (role === 'CONDOMINO') {
        if (!req.usuario.casaId) return res.status(403).json({ ok: false, message: 'Vivienda no asignada' });
        where.casaId = req.usuario.casaId;
      }
      queries.push(Cuota.findAll({ attributes: ['id', 'anio', 'mes', 'estatusPago', 'nombrePagador'], where, include: [house], limit: 5, order: [['anio', 'DESC'], ['id', 'DESC']] }).then(rows => { result.cuotas = rows; }));
      if (req.usuario.casaId) queries.push(PagoReportado.findAll({ attributes: ['id', 'folioReporte', 'folioOperacion', 'concepto', 'estatus'], where: { casaId: req.usuario.casaId, ...fields(term, ['folioReporte', 'folioOperacion', 'concepto', 'estatus', 'calleSnapshot', 'numeroCasaSnapshot']) }, limit: 5, order: [['creadoEn', 'DESC']] }).then(rows => { result.pagos = rows; }));
    }
    if (['SUPER_ADMIN', 'ADMINISTRADOR', 'SEGURIDAD'].includes(role)) {
      const where = fields(term, ['nombreVisitante', 'codigo', 'placas', 'autorizadoPor', 'estatus', 'telefono']);
      if (/^\d{4}-\d{2}-\d{2}$/.test(q)) where[Op.or].push({ fechaProgramada: q });
      if (role === 'CONDOMINO') {
        if (!req.usuario.casaId) return res.status(403).json({ ok: false, message: 'Vivienda no asignada' });
        where.casaId = req.usuario.casaId;
      }
      queries.push(Visita.findAll({ attributes: ['id', 'codigo', 'nombreVisitante', 'fechaProgramada', 'estatus'], where, include: [house], limit: 5, order: [['fechaProgramada', 'DESC']] }).then(rows => { result.visitas = rows; }));
    }
    if (['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'MANTENIMIENTO', 'CONDOMINO'].includes(role)) {
      const eventWhere = { activo: true, ...fields(term, ['titulo', 'descripcion', 'ubicacion', 'tipoEvento']) };
      if (/^\d{4}-\d{2}-\d{2}$/.test(q)) eventWhere[Op.or].push({ fechaInicio: { [Op.between]: [`${q} 00:00:00`, `${q} 23:59:59`] } });
      if (!['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA'].includes(role)) eventWhere[Op.and] = [{ [Op.or]: [{ visibilidad: 'TODOS' }, { visibilidad: 'SOLO_CASA', casaId: req.usuario.casaId || 0 }] }];
      queries.push(Evento.findAll({ attributes: ['id', 'titulo', 'fechaInicio', 'ubicacion'], where: eventWhere, limit: 5, order: [['fechaInicio', 'DESC']] }).then(rows => { result.eventos = rows; }));
    }
    const outcomes = await Promise.allSettled(queries);
    result.partial = outcomes.some(outcome => outcome.status === 'rejected');
    if (result.partial) outcomes.filter(outcome => outcome.status === 'rejected').forEach(outcome => console.error('Fuente de búsqueda no disponible:', outcome.reason));
    return res.json(result);
  } catch (error) {
    console.error('Error de búsqueda global:', error);
    return res.status(500).json({ ok: false, message: 'No fue posible buscar en este momento' });
  }
});


const CONMUTADOR_GROUPS = {
  Gardenias: { streetLikes: ['%Gardenias%'] },
  Magnolias: { streetLikes: ['%Magnolias%'] },
  Lirios: { streetLikes: ['%Lirios%'] },
  Rosas: { streetLikes: ['%Rosas%'] },
  'Jardines 1': { streetLikes: ['%Jardínes%', '%Jardines%'] },
  'Jardines 2': { streetLikes: ['%Jardínes%', '%Jardines%'] },
  'Jardines 3': { streetLikes: ['%Jardínes%', '%Jardines%'] },
  'Valle de México': { streetLikes: ['%Valle de México%', '%Valle de Mexico%'] },
  Atotonilco: { streetLikes: ['%Atotonilco%'] },
  Guadalajara: { streetLikes: ['%Guadalajara%'] }
};

const IMPORT_TABLE = 'condominos_importacion';
let importColumnsPromise = null;

function quoteIdentifier(value) {
  return '\`' + String(value).replace(/\`/g, '\`\`') + '\`';
}

async function importColumns() {
  if (!importColumnsPromise) {
    importColumnsPromise = sequelize.query(
      'SHOW COLUMNS FROM ' + quoteIdentifier(IMPORT_TABLE),
      { type: QueryTypes.SELECT }
    ).then(rows => rows.map(row => String(row.Field)));
  }
  return importColumnsPromise;
}

function findColumn(columns, candidates) {
  const lower = new Map(columns.map(column => [column.toLowerCase(), column]));
  for (const candidate of candidates) {
    const found = lower.get(candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

function normalizePhoneParts(value) {
  return String(value || '')
    .split('/')
    .map(part => part.replace(/[^\d+]/g, ''))
    .map(part => {
      const plus = part.startsWith('+');
      const digits = part.replace(/\D/g, '');
      return digits ? (plus ? '+' : '') + digits : '';
    })
    .filter(Boolean);
}

router.get('/conmutador/telefono', autorizarRoles(...personnel), async (req, res) => {
  const grupo = normalize(req.query.grupo);
  const numero = normalize(req.query.numero);
  const config = CONMUTADOR_GROUPS[grupo];

  if (!config || !numero) {
    return res.status(400).json({ ok: false, message: 'Domicilio no válido' });
  }

  try {
    const columns = await importColumns();
    const phoneColumn = findColumn(columns, ['telefono', 'teléfono', 'telefono1', 'tel']);
    const streetColumn = findColumn(columns, ['calle', 'direccion', 'dirección', 'domicilio']);
    const numberColumn = findColumn(columns, ['numero', 'número', 'casa', 'numero_casa', 'num_casa', 'no_casa']);

    if (!phoneColumn || !streetColumn || !numberColumn) {
      console.error('condominos_importacion no contiene las columnas esperadas', {
        phoneColumn,
        streetColumn,
        numberColumn,
        columns
      });
      return res.status(500).json({
        ok: false,
        message: 'El padrón importado no tiene la estructura necesaria para el conmutador'
      });
    }

    const streetSql = config.streetLikes
      .map((_, index) => quoteIdentifier(streetColumn) + ' LIKE :street' + index)
      .join(' OR ');

    const replacements = { numero, numeroLike: '%' + numero + '%' };
    config.streetLikes.forEach((value, index) => { replacements['street' + index] = value; });

    const sql =
      'SELECT ' + quoteIdentifier(phoneColumn) + ' AS telefono ' +
      'FROM ' + quoteIdentifier(IMPORT_TABLE) + ' ' +
      'WHERE (' + streetSql + ') ' +
      'AND (' +
      'TRIM(CAST(' + quoteIdentifier(numberColumn) + ' AS CHAR)) = :numero ' +
      'OR CAST(' + quoteIdentifier(numberColumn) + ' AS CHAR) LIKE :numeroLike' +
      ') ' +
      'AND ' + quoteIdentifier(phoneColumn) + ' IS NOT NULL ' +
      'AND TRIM(CAST(' + quoteIdentifier(phoneColumn) + ' AS CHAR)) <> \'\'' +
      ' LIMIT 12';

    const rows = await sequelize.query(sql, {
      replacements,
      type: QueryTypes.SELECT
    });

    const telefonos = [...new Set(
      rows.flatMap(row => normalizePhoneParts(row.telefono))
    )].slice(0, 2);

    return res.json({
      ok: true,
      grupo,
      numero,
      telefonos,
      multiples: telefonos.length > 1
    });
  } catch (error) {
    importColumnsPromise = null;
    console.error('Error al consultar teléfono del conmutador:', error);
    return res.status(500).json({
      ok: false,
      message: 'No fue posible consultar el teléfono de este domicilio'
    });
  }
});

router.get('/conmutador/opciones', autorizarRoles(...personnel), async (_req, res) => {
  try {
    const casas = await Casa.findAll({ attributes: ['calle', 'numero'], order: [['calle', 'ASC'], ['numero', 'ASC']], raw: true });
    return res.json({ ok: true, casas });
  } catch (error) {
    console.error('Error al cargar domicilios del conmutador:', error);
    return res.status(500).json({ ok: false, message: 'No fue posible cargar los domicilios' });
  }
});

router.get('/conmutador', autorizarRoles(...personnel), async (req, res) => {
  const calle = normalize(req.query.calle);
  const numero = normalize(req.query.numero);
  if (!calle && !numero) return res.json({ ok: true, casas: [] });
  try {
    const casas = await Casa.findAll({
      attributes: ['id', 'calle', 'numero'],
      where: { ...(calle && { calle: { [Op.like]: like(calle) } }), ...(numero && { numero: { [Op.like]: like(numero) } }) },
      include: [{ model: Condomino, as: 'condominos', where: { activo: true }, required: false, attributes: ['nombreCompleto', 'telefono'] }],
      limit: 40,
      order: [['calle', 'ASC'], ['numero', 'ASC']]
    });
    return res.json({ ok: true, casas });
  } catch (error) {
    console.error('Error del conmutador:', error);
    return res.status(500).json({ ok: false, message: 'No fue posible consultar el conmutador' });
  }
});

module.exports = router;
