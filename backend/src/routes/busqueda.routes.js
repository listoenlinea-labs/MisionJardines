const express = require('express');
const { Op } = require('sequelize');
const { Casa, Condomino, Cuota, Visita } = require('../models');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');

const router = express.Router();
router.use(autenticarToken);

const personnel = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'SEGURIDAD'];
const finance = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'CONDOMINO'];
const like = value => `%${value.replace(/[\\%_]/g, '\\$&')}%`;
const normalize = value => typeof value === 'string' ? value.trim().slice(0, 80) : '';
const house = { model: Casa, as: 'casa', attributes: ['id', 'calle', 'numero'] };

router.get('/', async (req, res) => {
  const q = normalize(req.query.q);
  if (q.length < 2) return res.json({ ok: true, casas: [], residentes: [], cuotas: [], visitas: [] });
  const term = like(q);
  const role = req.usuario.rol;
  try {
    const queries = [];
    const result = { ok: true, casas: [], residentes: [], cuotas: [], visitas: [] };
    if (personnel.includes(role)) {
      queries.push(Casa.findAll({ attributes: ['id', 'calle', 'numero'], where: { [Op.or]: [{ calle: { [Op.like]: term } }, { numero: { [Op.like]: term } }, { nombre: { [Op.like]: term } }] }, limit: 6, order: [['calle', 'ASC'], ['numero', 'ASC']] }).then(rows => { result.casas = rows; }));
      queries.push(Condomino.findAll({ attributes: ['id', 'nombreCompleto'], where: { activo: true, [Op.or]: [{ nombreCompleto: { [Op.like]: term } }, { telefono: { [Op.like]: term } }] }, include: [house], limit: 6, order: [['nombreCompleto', 'ASC']] }).then(rows => { result.residentes = rows; }));
    }
    if (finance.includes(role)) {
      const where = { [Op.or]: [{ nombrePagador: { [Op.like]: term } }, { folio: { [Op.like]: term } }, { calleSnapshot: { [Op.like]: term } }, { numeroCasaSnapshot: { [Op.like]: term } }, { mes: { [Op.like]: term } }] };
      if (role === 'CONDOMINO') {
        if (!req.usuario.casaId) return res.status(403).json({ ok: false, message: 'Vivienda no asignada' });
        where.casaId = req.usuario.casaId;
      }
      queries.push(Cuota.findAll({ attributes: ['id', 'anio', 'mes', 'estatusPago', 'nombrePagador'], where, include: [house], limit: 6, order: [['anio', 'DESC'], ['id', 'DESC']] }).then(rows => { result.cuotas = rows; }));
    }
    if ([...personnel, 'CONDOMINO'].includes(role)) {
      const where = { [Op.or]: [{ nombreVisitante: { [Op.like]: term } }, { codigo: { [Op.like]: term } }, { placas: { [Op.like]: term } }] };
      if (role === 'CONDOMINO') {
        if (!req.usuario.casaId) return res.status(403).json({ ok: false, message: 'Vivienda no asignada' });
        where.casaId = req.usuario.casaId;
      }
      queries.push(Visita.findAll({ attributes: ['id', 'codigo', 'nombreVisitante', 'fechaProgramada', 'estatus'], where, include: [house], limit: 6, order: [['fechaProgramada', 'DESC']] }).then(rows => { result.visitas = rows; }));
    }
    await Promise.all(queries);
    return res.json(result);
  } catch (error) {
    console.error('Error de búsqueda global:', error);
    return res.status(500).json({ ok: false, message: 'No fue posible buscar en este momento' });
  }
});

router.get('/conmutador', autorizarRoles(...personnel), async (req, res) => {
  const calle = normalize(req.query.calle);
  const numero = normalize(req.query.numero);
  if (!calle && !numero) return res.json({ ok: true, casas: [] });
  try {
    const casas = await Casa.findAll({
      attributes: ['id', 'calle', 'numero', 'telefono'],
      where: { ...(calle && { calle: { [Op.like]: like(calle) } }), ...(numero && { numero: { [Op.like]: like(numero) } }) },
      include: [{ model: Condomino, as: 'condominos', where: { activo: true }, required: false, attributes: ['id', 'nombreCompleto', 'telefono'] }],
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
