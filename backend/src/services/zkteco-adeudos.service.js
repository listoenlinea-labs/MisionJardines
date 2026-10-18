'use strict';

// Nunca tomar el reflejo SQL de vigencias como fuente del C3. El cálculo
// financiero es de solo lectura; las escrituras de bloqueo se hacen por TAG
// mediante zkteco-direct, que comprueba userauthorize en el panel físico.
const { fechaMexico } = require('./vigencia-calculo');

function adeudosExigibles(adeudos, hoy = fechaMexico()) {
  if (!adeudos?.tipos || !['MANTENIMIENTO', 'EXTRAORDINARIO', 'CASA_CLUB']
    .every(tipo => Array.isArray(adeudos.tipos[tipo]))) {
    throw new Error('Consulta de adeudos incompleta; no se puede decidir el estado del TAG');
  }
  const tipos = adeudos?.tipos || {};
  const valido = item => Number.isFinite(Number(item?.monto)) && Number(item.monto) > 0;
  const mantenimiento = (tipos.MANTENIMIENTO || []).filter(item =>
    valido(item) && /^\d{4}-\d{2}$/.test(String(item.periodo)) &&
    `${item.periodo}-10` < hoy);
  const extraordinario = (tipos.EXTRAORDINARIO || []).filter(item =>
    valido(item) && /^\d{4}-\d{2}$/.test(String(item.periodo)) &&
    item.periodo <= hoy.slice(0, 7));
  // Una aprobación concede un plazo para pagar. Si se presentó comprobante
  // oportunamente, la demora de Administración no debe bloquear el TAG.
  const casaClub = (tipos.CASA_CLUB || []).filter(item =>
    valido(item) && /^\d{4}-\d{2}-\d{2}$/.test(String(item.fechaLimitePago)) &&
    item.fechaLimitePago < hoy && item.estado !== 'EN_REVISION');
  const centavos = lista => lista.reduce((s, x) => s + Math.round(Number(x.monto) * 100), 0);
  const totales = {
    MANTENIMIENTO: centavos(mantenimiento) / 100,
    EXTRAORDINARIO: centavos(extraordinario) / 100,
    CASA_CLUB: centavos(casaClub) / 100
  };
  return { tipos: { MANTENIMIENTO: mantenimiento, EXTRAORDINARIO: extraordinario, CASA_CLUB: casaClub },
    totales, total: Math.round(Object.values(totales).reduce((a, b) => a + b, 0) * 100) / 100 };
}

async function comprobarHabilitacion(casaId, { consultar, hoy } = {}) {
  const obtener = consultar || require('./adeudos-comunidad.service').consultarAdeudos;
  const deuda = adeudosExigibles(await obtener(casaId), hoy || fechaMexico());
  if (deuda.total > 0) {
    const error = new Error('La vivienda tiene adeudos exigibles de mantenimiento, cuota extraordinaria o Casa club; no se puede habilitar el TAG. Revisa Pagos.');
    error.status = 409;
    error.totales = deuda.totales;
    throw error;
  }
  return deuda;
}

function idsPiloto(value) {
  if (!value) return [];
  const parts = String(value).split(',').map(x => x.trim());
  if (parts.some(x => !/^[1-9]\d*$/.test(x) || !Number.isSafeInteger(Number(x))))
    throw new Error('ZKTECO_ADEUDOS_CASA_IDS debe contener únicamente IDs numéricos separados por coma');
  return [...new Set(parts.map(Number))];
}

let running = false, timer = null;

async function run({ env = process.env, obtenerTarjetas, consultar, bloquear, obtenerPadron, hoy = fechaMexico() } = {}) {
  if (running) return { estado: 'OCUPADO' };
  if (env.ZKTECO_ADEUDOS_ENABLED !== 'true') return { estado: 'INACTIVO' };
  const piloto = idsPiloto(env.ZKTECO_ADEUDOS_CASA_IDS);
  const global = env.ZKTECO_ADEUDOS_GLOBAL_CONFIRMADO === 'CONFIRMO_231';
  if (!piloto.length && !global) return { estado: 'SIN_ALCANCE', mensaje: 'Configura IDs de piloto o confirma el padrón de 231 viviendas' };
  const simulacion = env.ZKTECO_ADEUDOS_DRY_RUN !== 'false' || env.ZKTECO_DRY_RUN !== 'false';
  const maximo = Math.min(10, Math.max(1, Number(env.ZKTECO_ADEUDOS_MAX_TAGS) || 3));
  running = true;
  try {
    const tarjetas = await (obtenerTarjetas || (() => require('../models/ZkTarjeta').findAll({
      where: { enControlador: true, bloqueado: false },
      attributes: ['id', 'casaId'], order: [['casaId', 'ASC'], ['id', 'ASC']]
    })))();
    const oficiales = global ? await (obtenerPadron || require('./cargos-extraordinarios.service').padronOficial)() : [];
    const permitidas = new Set([...piloto, ...oficiales.map(c => Number(c.id))]);
    const elegibles = tarjetas.filter(t => permitidas.has(Number(t.casaId)) && Number(t.casaId) > 0);
    const cobrar = consultar || require('./adeudos-comunidad.service').consultarAdeudos;
    const bloquearTag = bloquear || (id => require('./zkteco-direct.service').setCardBlocked(id, true));
    let examinadas = 0, detectadas = 0, bloqueadas = 0, fallidas = 0;
    const cache = new Map();
    for (const tarjeta of elegibles) {
      const casaId = Number(tarjeta.casaId);
      if (!cache.has(casaId)) {
        cache.set(casaId, adeudosExigibles(await cobrar(casaId), hoy).total > 0);
        examinadas++;
      }
      if (!cache.get(casaId)) continue;
      detectadas++;
      if (simulacion) continue;
      if (bloqueadas + fallidas >= maximo) break;
      try { await bloquearTag(tarjeta.id); bloqueadas++; }
      catch (error) { fallidas++; console.error('[C3 adeudos] No se pudo bloquear TAG de vivienda', casaId, error.message); }
    }
    return { estado: simulacion ? 'SIMULACION' : 'EJECUTADO', examinadas, detectadas, bloqueadas, fallidas };
  } finally { running = false; }
}

function start() {
  if (timer || process.env.ZKTECO_ADEUDOS_ENABLED !== 'true') return;
  const interval = Math.max(60000, Number(process.env.ZKTECO_ADEUDOS_MS) || 900000);
  timer = setInterval(() => { void run().then(resultado => console.log('[C3 adeudos]', resultado))
    .catch(error => console.error('[C3 adeudos] Barrido suspendido:', error.message)); }, interval);
  timer.unref?.();
  // No bloquear a cientos de residentes durante el arranque/despliegue.
  console.log('[C3 adeudos] Monitor habilitado; primer barrido en', interval, 'ms');
}

module.exports = { adeudosExigibles, comprobarHabilitacion, idsPiloto, run, start };
