const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { esViviendaVisible } = require('./viviendas-visibles.service');
const { Casa } = require('../models');
const { domicilioDesdeCasa } = require('./vivienda-conmutador-correspondencia.service');

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
const CONTACTOS_TABLE = 'conmutador_contactos_administrados';
let contactosSchemaPromise;

function asegurarContactosAdministrados() {
  if (!contactosSchemaPromise) {
    contactosSchemaPromise = sequelize.query(`
      CREATE TABLE IF NOT EXISTS conmutador_contactos_administrados (
        grupo VARCHAR(60) NOT NULL,
        numero VARCHAR(12) NOT NULL,
        telefono_a VARCHAR(16) NULL,
        telefono_b VARCHAR(16) NULL,
        actualizado_por INT NULL,
        actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (grupo, numero)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch(error => { contactosSchemaPromise = null; throw error; });
  }
  return contactosSchemaPromise;
}

function telefonoContactoValido(valor) {
  const input = String(valor ?? '').trim();
  if (!input) return '';
  if (!/^[+()\d\s-]{10,24}$/.test(input)) return null;
  let digits = input.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
  return /^[2-9]\d{9}$/.test(digits) ? digits : null;
}

async function obtenerContactosAdministrados({ grupo, numero }, transaction) {
  await asegurarContactosAdministrados();
  const rows = await sequelize.query(
    'SELECT telefono_a, telefono_b FROM ' + CONTACTOS_TABLE + ' WHERE grupo = :grupo AND numero = :numero LIMIT 1',
    { replacements: { grupo, numero }, type: QueryTypes.SELECT, transaction }
  );
  return rows.length ? [rows[0].telefono_a || '', rows[0].telefono_b || ''] : null;
}

// Solo se vincula una coincidencia unívoca del padrón, nunca otra vivienda con igual número.
async function casaDeDomicilioConmutador({ grupo, numero }) {
  if (!domicilioConmutador(grupo, numero)) return null;
  const casas=await Casa.findAll({where:{numero},attributes:['id','calle','calleCorrecta','numero','telefono'],limit:500});
  const matches=casas.filter(c=>{
    const domicilio=domicilioDesdeCasa(c);
    return domicilio?.grupo===grupo&&domicilio?.numero===numero;
  });
  return matches.length===1?matches[0]:null;
}

function telefonoNacionalCompartido(phone) {
  const raw=String(phone||'').replace(/\D/g,'');
  const national=raw.startsWith('521')&&raw.length===13?raw.slice(3):
    raw.startsWith('52')&&raw.length===12?raw.slice(2):raw;
  return /^[2-9]\d{9}$/.test(national)?national:'';
}

async function guardarContactosAdministrados(domicilio, telefonos, usuarioId, transaction) {
  const { grupo, numero } = domicilio || {};
  if (!domicilioConmutador(grupo, numero) || !Array.isArray(telefonos) || telefonos.length !== 2) {
    const err = new Error('Domicilio o contactos inválidos'); err.status = 400; throw err;
  }
  const normalizados = telefonos.map(telefonoContactoValido);
  if (normalizados.some(t => t === null)) {
    const err = new Error('Captura teléfonos nacionales válidos de 10 dígitos (A antes que B)'); err.status = 400; throw err;
  }
  await asegurarContactosAdministrados();
  await sequelize.query(`
    INSERT INTO conmutador_contactos_administrados
      (grupo, numero, telefono_a, telefono_b, actualizado_por)
    VALUES (:grupo, :numero, :a, :b, :usuarioId)
    ON DUPLICATE KEY UPDATE
      telefono_a = VALUES(telefono_a), telefono_b = VALUES(telefono_b),
      actualizado_por = VALUES(actualizado_por), actualizado_en = CURRENT_TIMESTAMP(3)
  `, { replacements: { grupo, numero, a: normalizados[0] || null, b: normalizados[1] || null, usuarioId }, type: QueryTypes.INSERT, transaction });
  return normalizados;
}


// Separa el nombre del contacto del padrón general y de los teléfonos A/B ya existentes.
// Solo la ruta privada ADMINISTRADOR consulta o modifica esta tabla.
const NOMBRES_TABLE = 'conmutador_contactos_propietarios';
let nombresSchemaPromise = null;
async function asegurarNombresConmutador() {
  if (!nombresSchemaPromise) nombresSchemaPromise = sequelize.query(`
    CREATE TABLE IF NOT EXISTS conmutador_contactos_propietarios (
      grupo VARCHAR(60) NOT NULL,
      numero VARCHAR(12) NOT NULL,
      propietario VARCHAR(150) NOT NULL DEFAULT '',
      actualizado_por INT NULL,
      actualizado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (grupo, numero)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `).catch(error => { nombresSchemaPromise = null; throw error; });
  return nombresSchemaPromise;
}
async function nombresGuardadosConmutador() {
  await asegurarNombresConmutador();
  return sequelize.query('SELECT grupo, numero, propietario FROM '+ NOMBRES_TABLE, {type:QueryTypes.SELECT});
}
async function guardarNombreConmutador(domicilio, propietario, usuarioId, transaction) {
  if (!domicilioConmutador(domicilio.grupo, domicilio.numero) ||
      typeof propietario !== 'string' || propietario.length > 150 ||
      /[\u0000-\u001f\u007f]/.test(propietario)) {
    const error = new Error('Nombre de propietario inválido (máximo 150 caracteres)');
    error.status = 400;
    throw error;
  }
  await asegurarNombresConmutador();
  const nombre = propietario.trim().replace(/\s+/g,' ');
  await sequelize.query(`
    INSERT INTO conmutador_contactos_propietarios (grupo, numero, propietario, actualizado_por)
    VALUES (:grupo, :numero, :propietario, :usuarioId)
    ON DUPLICATE KEY UPDATE propietario=VALUES(propietario),
      actualizado_por=VALUES(actualizado_por), actualizado_en=CURRENT_TIMESTAMP(3)
  `, { replacements:{...domicilio, propietario:nombre, usuarioId}, type:QueryTypes.INSERT, transaction });
  return nombre;
}

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
  if (!domicilioConmutador(grupo, numero)) return [];
  try {
    const administrados = await obtenerContactosAdministrados({ grupo, numero });
    if (administrados !== null) {
      const casa=administrados[0]?null:await casaDeDomicilioConmutador({grupo,numero});
      const principal=administrados[0]||telefonoNacionalCompartido(casa?.telefono);
      return [principal,administrados[1]].filter(Boolean);
    }
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

    if (telefonos.length) return telefonos;
    const casa=await casaDeDomicilioConmutador({grupo,numero});
    const recibos=telefonoNacionalCompartido(casa?.telefono);
    return recibos?[recibos]:[];
  } catch (error) {
    importColumnsPromise = null;
    throw error;
  }
}

module.exports = { domicilioConmutador, buscarTelefonosConmutador, guardarContactosAdministrados, telefonoContactoValido, nombresGuardadosConmutador, guardarNombreConmutador, obtenerContactosAdministrados, casaDeDomicilioConmutador, telefonoNacionalCompartido, asegurarContactosAdministrados, asegurarNombresConmutador };
