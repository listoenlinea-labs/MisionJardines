'use strict';

// Historial operativo de intentos, sin teléfonos, nombres ni datos del padrón.
// La app web no puede confirmar ni borrar llamadas salientes del iPhone.
const express = require('express');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');
const { esViviendaVisible } = require('../services/viviendas-visibles.service');
const telemetria = require('../services/conmutador-telemetria.service');

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
    `).then(() => sequelize.query(`
      CREATE TABLE IF NOT EXISTS conmutador_llamadas_seguimiento (
        solicitud CHAR(36) NOT NULL PRIMARY KEY,
        usuario_id INT NOT NULL,
        grupo VARCHAR(60) NOT NULL,
        numero VARCHAR(12) NOT NULL,
        estado VARCHAR(16) NOT NULL DEFAULT 'PENDIENTE',
        creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        confirmado_en DATETIME(3) NULL,
        INDEX idx_conmutador_seguimiento_fecha (creado_en),
        INDEX idx_conmutador_seguimiento_estado_fecha (estado, creado_en)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)).catch(error => {
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

// El historial principal muestra SOLO órdenes con envío a Asterisk
// confirmado por el agente autenticado. El registro antiguo conserva todos
// los intentos como auditoría, pero no prueba que una llamada se enviara.
// Los intentos PENDIENTES, ERROR o VENCIDOS no aparecen como realizados.
// Omitir fecha abre la última fecha con un envío confirmado.
router.get('/',async(req,res)=>{
 res.set('Cache-Control','no-store');
 const provided=req.query.fecha;
 let fecha=provided===undefined?null:String(provided);
 if(fecha!==null&&(
   !/^\d{4}-\d{2}-\d{2}$/.test(fecha)||
   Number.isNaN(Date.parse(fecha+'T00:00:00Z'))||
   new Date(fecha+'T00:00:00Z').toISOString().slice(0,10)!==fecha
 ))return res.status(400).json({ok:false,message:'Selecciona una fecha válida (AAAA-MM-DD).'});
 try{
  await asegurarTabla();
  if(fecha===null){
   // El índice de creado_en permite conocer el último día en una sola fila.
   const newest=await sequelize.query(
    "SELECT DATE_FORMAT(creado_en, '%Y-%m-%d') AS fecha "+
    "FROM conmutador_llamadas_seguimiento WHERE estado IN ('ENVIADA','FINALIZADA') "+
    'AND confirmado_en IS NOT NULL ORDER BY creado_en DESC LIMIT 1',
    {type:QueryTypes.SELECT}
   );
   fecha=newest[0]?.fecha||null;
  }
  if(fecha===null){
   return res.json({ok:true,tipo:'ENVIO_CONFIRMADO',
    fecha:null,total:0,registros:[],fechaAnterior:null,fechaSiguiente:null});
  }
  // WHERE usa rangos de fecha sargables: no aplicar DATE() a la columna.
  // Se consultan simultáneamente el día completo y los vecinos reales.
  const [registros,previous,next]=await Promise.all([
   sequelize.query(
    "SELECT solicitud AS id, grupo, numero, estado, DATE_FORMAT(creado_en, '%Y-%m-%d %H:%i:%s') AS fecha_hora "+
    'FROM conmutador_llamadas_seguimiento WHERE creado_en >= :fecha '+
    "AND creado_en < DATE_ADD(:fecha, INTERVAL 1 DAY) AND estado IN ('ENVIADA','FINALIZADA') "+
    'AND confirmado_en IS NOT NULL ORDER BY creado_en DESC, solicitud DESC',
    {replacements:{fecha},type:QueryTypes.SELECT}
   ),
   sequelize.query(
    "SELECT DATE_FORMAT(creado_en, '%Y-%m-%d') AS fecha "+
    "FROM conmutador_llamadas_seguimiento WHERE estado IN ('ENVIADA','FINALIZADA') "+
    'AND confirmado_en IS NOT NULL AND creado_en < :fecha '+
    'ORDER BY creado_en DESC LIMIT 1',
    {replacements:{fecha},type:QueryTypes.SELECT}
   ),
   sequelize.query(
    "SELECT DATE_FORMAT(creado_en, '%Y-%m-%d') AS fecha "+
    "FROM conmutador_llamadas_seguimiento WHERE estado IN ('ENVIADA','FINALIZADA') "+
    'AND confirmado_en IS NOT NULL AND creado_en >= DATE_ADD(:fecha, INTERVAL 1 DAY) '+
    'ORDER BY creado_en ASC LIMIT 1',
    {replacements:{fecha},type:QueryTypes.SELECT}
   )
  ]);
  return res.json({ok:true,tipo:'ENVIO_CONFIRMADO',fecha,total:registros.length,registros,
   fechaAnterior:previous[0]?.fecha||null,fechaSiguiente:next[0]?.fecha||null});
 }catch(error){
  console.error('No se pudo consultar el historial del conmutador:',error.message);
  return res.status(503).json({ok:false,message:'No fue posible consultar el historial'});
 }
});

// Consulta de SOLO LECTURA. El UUID de cada fila del historial identifica una
// solicitud; la respuesta nunca incluye teléfonos, credenciales ni grabaciones.
router.get('/:solicitud', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const solicitud = String(req.params.solicitud || '');
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(solicitud))
    return res.status(404).json({ ok: false, message: 'Llamada no encontrada' });
  try {
    await asegurarTabla();
    const result = await telemetria.detalle(solicitud);
    if (!result) return res.status(404).json({ ok: false, message: 'Llamada no encontrada' });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('No se pudo consultar el detalle de la llamada:', error.name);
    return res.status(503).json({ ok: false, message: 'No fue posible consultar el diagnóstico de la llamada' });
  }
});

module.exports = router;
module.exports.asegurarTabla = asegurarTabla;
