'use strict';

const { Op } = require('sequelize');
const { Visita, Acceso, Casa, UsuarioCasa } = require('../models');

function fechaMexico(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

// El alcance es SIEMPRE derivado de la identidad del token validada por auth.
// No se aceptan IDs de vivienda, roles ni filtros de otra cuenta desde el cliente.
async function alcanceViviendas(usuario) {
  if (usuario.rol === 'SEGURIDAD') return { global: true, where: {} };
  const vínculos = await UsuarioCasa.findAll({
    where: { usuarioId: usuario.usuarioId, activo: true },
    attributes: ['casaId']
  });
  const ids = [...new Set(vínculos.map(row => Number(row.casaId)).filter(id =>
    Number.isSafeInteger(id) && id > 0
  ))];
  return { global: false, where: { casaId: { [Op.in]: ids.length ? ids : [-1] } } };
}

const casaInclude = [{ model: Casa, as: 'casa', attributes: ['calle', 'calleCorrecta', 'numero'], required: false }];
function direccion(casa) {
  if (!casa) return '';
  return [casa.calleCorrecta || casa.calle || '', casa.numero ?? ''].join(' ').trim();
}

async function obtenerDashboardOperativo(req, res) {
  let scope;
  try {
    scope = await alcanceViviendas(req.usuario);
  } catch (error) {
    // La falta de permisos/vínculos NO puede ampliar el alcance a otras viviendas.
    console.error('Dashboard operativo: no se pudieron resolver las viviendas de la cuenta:', error);
    return res.json({
      ok: true, vista: 'OPERATIVA', alcance: 'MIS_VIVIENDAS',
      generadoEn: new Date().toISOString(), periodo: { hoy: fechaMexico() },
      kpis: { visitas: {}, accesos: {} },
      operativo: { visitas: [], accesos: [] },
      fuentes: { visitas: false, accesos: false, viviendas: false }
    });
  }

  const hoy = fechaMexico();
  const visitsToday = { ...scope.where, fechaProgramada: hoy, estatus: { [Op.ne]: 'CANCELADA' } };
  const activeAccess = { ...scope.where, fechaSalida: null };
  // Las tablas de visitas y accesos pueden estar temporalmente incompletas
  // durante una migración. Cada fuente falla de forma independiente y el
  // dashboard sigue disponible para ambos roles, sin inventar cantidades.
  const [visitasResultado, accesosResultado] = await Promise.all([
    Promise.all([
      Visita.count({ where: visitsToday }),
      Visita.count({ where: { ...visitsToday, estatus: 'PROGRAMADA' } }),
      Visita.count({ where: { ...visitsToday, estatus: 'EN_CURSO' } }),
      Visita.findAll({
        where: visitsToday, include: casaInclude,
        attributes: ['id', 'nombreVisitante', 'fechaProgramada', 'horaProgramada',
          'fechaEntrada', 'estatus'],
        order: [['horaProgramada', 'ASC'], ['id', 'DESC']]
      })
    ]).catch(error => {
      console.error('Dashboard operativo: fuente visitas no disponible:', error);
      return null;
    }),
    Promise.all([
      Acceso.count({ where: activeAccess }),
      Acceso.findAll({
        where: activeAccess, include: casaInclude,
        attributes: ['id', 'nombre', 'tipo', 'fechaEntrada'],
        order: [['fechaEntrada', 'DESC'], ['id', 'DESC']]
      })
    ]).catch(error => {
      console.error('Dashboard operativo: fuente accesos no disponible:', error);
      return null;
    })
  ]);
  const [totalVisitas, programadas, enCurso, visitas] = visitasResultado || [];
  const [totalDentro, accesos] = accesosResultado || [];
  return res.json({
      ok: true,
      vista: 'OPERATIVA',
      alcance: scope.global ? 'FRACCIONAMIENTO' : 'MIS_VIVIENDAS',
      generadoEn: new Date().toISOString(),
      periodo: { hoy },
      kpis: {
        visitas: { hoy: totalVisitas ?? null, programadas: programadas ?? null, enCurso: enCurso ?? null },
        accesos: { activos: totalDentro ?? null }
      },
      operativo: {
        visitas: (visitas || []).map(v => ({
          id: v.id, nombre: v.nombreVisitante,
          hora: v.horaProgramada, estado: v.estatus,
          entrada: v.fechaEntrada || null, vivienda: direccion(v.casa)
        })),
        accesos: (accesos || []).map(a => ({
          id: a.id, nombre: a.nombre, tipo: a.tipo,
          entrada: a.fechaEntrada, vivienda: direccion(a.casa)
        }))
      },
      fuentes: { visitas: !!visitasResultado, accesos: !!accesosResultado, viviendas: true }
    });
}

module.exports = { obtenerDashboardOperativo, alcanceViviendas, fechaMexico };
