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
  try {
    const scope = await alcanceViviendas(req.usuario);
    const hoy = fechaMexico();
    const visitsToday = { ...scope.where, fechaProgramada: hoy, estatus: { [Op.ne]: 'CANCELADA' } };
    const activeAccess = { ...scope.where, fechaSalida: null };
    const [totalVisitas, programadas, enCurso, totalDentro, visitas, accesos] = await Promise.all([
      Visita.count({ where: visitsToday }),
      Visita.count({ where: { ...visitsToday, estatus: 'PROGRAMADA' } }),
      Visita.count({ where: { ...visitsToday, estatus: 'EN_CURSO' } }),
      Acceso.count({ where: activeAccess }),
      Visita.findAll({
        where: visitsToday, include: casaInclude,
        attributes: ['id', 'nombreVisitante', 'fechaProgramada', 'horaProgramada',
          'fechaEntrada', 'estatus'],
        order: [['horaProgramada', 'ASC'], ['id', 'DESC']],
        limit: 15
      }),
      Acceso.findAll({
        where: activeAccess, include: casaInclude,
        attributes: ['id', 'nombre', 'tipo', 'fechaEntrada'],
        order: [['fechaEntrada', 'DESC'], ['id', 'DESC']],
        limit: 15
      })
    ]);
    return res.json({
      ok: true,
      vista: 'OPERATIVA',
      alcance: scope.global ? 'FRACCIONAMIENTO' : 'MIS_VIVIENDAS',
      generadoEn: new Date().toISOString(),
      periodo: { hoy },
      kpis: {
        visitas: { hoy: totalVisitas, programadas, enCurso },
        accesos: { activos: totalDentro }
      },
      operativo: {
        visitas: visitas.map(v => ({
          id: v.id, nombre: v.nombreVisitante,
          hora: v.horaProgramada, estado: v.estatus,
          entrada: v.fechaEntrada || null, vivienda: direccion(v.casa)
        })),
        accesos: accesos.map(a => ({
          id: a.id, nombre: a.nombre, tipo: a.tipo,
          entrada: a.fechaEntrada, vivienda: direccion(a.casa)
        }))
      },
      fuentes: { visitas: true, accesos: true }
    });
  } catch (error) {
    console.error('Dashboard operativo: error de datos por rol:', error);
    return res.status(503).json({ ok: false, message: 'No fue posible consultar las visitas y accesos.' });
  }
}

module.exports = { obtenerDashboardOperativo, alcanceViviendas, fechaMexico };
