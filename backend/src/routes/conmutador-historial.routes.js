'use strict';

// Historial operativo de intentos, sin teléfonos, nombres ni datos del padrón.
// La app web no puede confirmar ni borrar llamadas salientes del iPhone.
const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');
const { esViviendaVisible } = require('../services/viviendas-visibles.service');

const router = express.Router();
router.use(autenticarToken, autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'SEGURIDAD'));

const grupos = new Set([
  'Gardenias', 'Magnolias', 'Lirios', 'Rosas',
  'Jardines 1', 'Jardines 2', 'Jardines 3',
  'Valle de México', 'Atotonilco', 'Guadalajara'
]);
let schemaPromise;

function asegurarTabla() {
  if (!schemaPromise) {
    schemaPromise = sequelize.query(`
      CREATE TABLE IF NOT EXISTS conmutador_intentos_llamada (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        usuario_id INT NOT NULL,
        grupo VARCHAR(60) NOT NULL,
        numero VARCHAR(12) NOT NULL,
        creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_conmutador_historial_fecha (creado_en),
        INDEX idx_conmutador_historial_usuario (usuario_id, creado_en)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function domicilioValido(body) {
  if (!body || typeof body !== 'object') return null;
  const grupo = typeof body.grupo === 'string' ? body.grupo.trim() : '';
  const numero = typeof body.numero === 'string' ? body.numero.trim() : '';
  if (!grupos.has(grupo) || !/^\d{1,4}$/.test(numero) || !esViviendaVisible({ calle: grupo, numero })) return null;
  return { grupo, numero };
}

router.post('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const domicilio = domicilioValido(req.body);
  if (!domicilio) return res.status(400).json({ ok: false, message: 'Domicilio inválido' });
  try {
    await asegurarTabla();
    await sequelize.query(
      'INSERT INTO conmutador_intentos_llamada (usuario_id, grupo, numero) VALUES (:usuarioId, :grupo, :numero)',
      { replacements: { usuarioId: req.usuario.usuarioId, ...domicilio }, type: QueryTypes.INSERT }
    );
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('No se pudo registrar el intento del conmutador:', error.message);
    return res.status(503).json({ ok: false, message: 'No fue posible guardar el intento' });
  }
});

router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await asegurarTabla();
    const rows = await sequelize.query(
      "SELECT id, grupo, numero, DATE_FORMAT(creado_en, '%Y-%m-%d %H:%i:%s') AS fecha_hora " +
      'FROM conmutador_intentos_llamada ORDER BY id DESC LIMIT 100',
      { type: QueryTypes.SELECT }
    );
    return res.json({ ok: true, tipo: 'INTENTO_DE_MARCADO', registros: rows });
  } catch (error) {
    console.error('No se pudo consultar el historial del conmutador:', error.message);
    return res.status(503).json({ ok: false, message: 'No fue posible consultar el historial' });
  }
});

module.exports = router;
