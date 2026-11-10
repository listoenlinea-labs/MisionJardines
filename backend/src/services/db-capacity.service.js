'use strict';

// Medidor preventivo LOCAL del proceso Node. MySQL/Hostinger no expone un
// contador oficial de cuota restante por cuenta; jamás se presenta como exacto.
const WINDOW_MS = 60 * 60 * 1000;
const samples = { connections: [], queries: [] };
const startedAt = Date.now();
const envLimit = key => {
  const value = Number(process.env[key]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};
const limits = {
  connections: envLimit('MYSQL_CONNECTIONS_PER_HOUR_LIMIT'),
  queries: envLimit('MYSQL_QUERIES_PER_HOUR_LIMIT')
};
const source = {
  connections: limits.connections ? 'entorno' : 'desconocido',
  queries: limits.queries ? 'entorno' : 'desconocido'
};

function prune(at = Date.now()) {
  const threshold = at - WINDOW_MS;
  for (const events of Object.values(samples)) {
    while (events.length && events[0] <= threshold) events.shift();
  }
}
function mark(kind, at = Date.now()) {
  if (!samples[kind]) return;
  samples[kind].push(at);
  prune(at);
}
function discoverLimits(rows) {
  const grants = (Array.isArray(rows) ? rows : []).flatMap(row => Object.values(row || {}))
    .filter(value => typeof value === 'string').join(' ');
  for (const [kind, pattern] of [
    ['connections', /MAX_CONNECTIONS_PER_HOUR\s+(\d+)/i],
    ['queries', /MAX_QUERIES_PER_HOUR\s+(\d+)/i]
  ]) {
    if (source[kind] === 'entorno') continue;
    const match = pattern.exec(grants);
    if (match && Number(match[1]) > 0) {
      limits[kind] = Number(match[1]);
      source[kind] = 'permisos_mysql';
    }
  }
}
function measure(kind) {
  const used = samples[kind].length;
  const limit = limits[kind];
  return {
    observedLastHour: used,
    limit,
    remainingEstimate: limit === null ? null : Math.max(0, limit - used),
    percentageUsedEstimate: limit === null ? null : Math.min(100, Math.round(100 * used / limit)),
    limitSource: source[kind]
  };
}
function read(sequelize) {
  prune();
  const pool = sequelize && sequelize.connectionManager && sequelize.connectionManager.pool;
  const write = pool && (pool.write || pool);
  const poolSnapshot = write && typeof write.size === 'number' ? {
    total: write.size, active: write.using, idle: write.available,
    waiting: write.waiting
  } : null;
  const connection = measure('connections');
  const query = measure('queries');
  const active = [connection, query].filter(item => item.limit !== null);
  const mostUsed = active.sort((a,b) => b.percentageUsedEstimate - a.percentageUsedEstimate)[0];
  return {
    ok: true,
    exact: false,
    scope: 'proceso_actual',
    since: new Date(startedAt).toISOString(),
    windowMinutes: 60,
    connections: connection,
    queries: query,
    pool: poolSnapshot,
    risk: mostUsed ? (mostUsed.percentageUsedEstimate >= 90 ? 'alto' :
      mostUsed.percentageUsedEstimate >= 75 ? 'precaucion' : 'normal') : 'desconocido',
    message: 'Estimación de este proceso. No incluye otros procesos, conexiones externas ni consumo anterior al reinicio. No es el saldo oficial de Hostinger.'
  };
}
module.exports = { mark, discoverLimits, read };
