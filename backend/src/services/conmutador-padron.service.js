const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { esViviendaVisible } = require('./viviendas-visibles.service');

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
  return '`' + String(value).replace(/`/g, '``') + '`';
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

function domicilioConmutador(grupo, numero) {
  if (!Object.hasOwn(CONMUTADOR_GROUPS, grupo) || !/^\d{1,4}$/.test(numero)) return null;
  if (!esViviendaVisible({ calle: grupo, numero })) return null;
  return { grupo, numero };
}

async function buscarTelefonosConmutador({ grupo, numero }) {
  const config = CONMUTADOR_GROUPS[grupo];
  try {
    const columns = await importColumns();
    const phoneColumn = findColumn(columns, ['telefono', 'teléfono', 'telefono1', 'tel']);
    const streetColumn = findColumn(columns, ['calle', 'direccion', 'dirección', 'domicilio']);
    const numberColumn = findColumn(columns, ['numero', 'número', 'casa', 'numero_casa', 'num_casa', 'no_casa']);

    if (!phoneColumn || !streetColumn || !numberColumn) {
      throw new Error('Esquema del padrón incompatible con el conmutador');
    }

    const streetSql = config.streetLikes
      .map((_, index) => quoteIdentifier(streetColumn) + ' LIKE :street' + index)
      .join(' OR ');

    const replacements = { numero };
    config.streetLikes.forEach((value, index) => { replacements['street' + index] = value; });

    const sql =
      'SELECT ' + quoteIdentifier(phoneColumn) + ' AS telefono ' +
      'FROM ' + quoteIdentifier(IMPORT_TABLE) + ' ' +
      'WHERE (' + streetSql + ') ' +
      'AND (' +
      'TRIM(CAST(' + quoteIdentifier(numberColumn) + ' AS CHAR)) = :numero ' +
      'OR CAST(' + quoteIdentifier(numberColumn) + ' AS CHAR) REGEXP CONCAT(\'(^|[^0-9])\', :numero, \'([^0-9]|$)\')' +
      ') ' +
      'AND ' + quoteIdentifier(phoneColumn) + ' IS NOT NULL ' +
      'AND TRIM(CAST(' + quoteIdentifier(phoneColumn) + ' AS CHAR)) <> \'\'' +
      ' ORDER BY ' + quoteIdentifier(phoneColumn) + ' LIMIT 12';

    const rows = await sequelize.query(sql, {
      replacements,
      type: QueryTypes.SELECT
    });

    const telefonos = [...new Set(
      rows.flatMap(row => normalizePhoneParts(row.telefono))
    )].slice(0, 2);

    return telefonos;
  } catch (error) {
    importColumnsPromise = null;
    throw error;
  }
}

module.exports = { domicilioConmutador, buscarTelefonosConmutador };
