const express = require('express');
const { randomUUID, timingSafeEqual } = require('node:crypto');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');
const { casetaHabilitada } = require('../config/conmutador-caseta');
const { domicilioConmutador, buscarTelefonosConmutador } = require('../services/conmutador-padron.service');
const { asegurarTabla } = require('./conmutador-historial.routes');

const router = express.Router();
const personal = autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'SEGURIDAD');
const uuid = valor => typeof valor === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(valor);

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

function agente(req, res, next) {
  const clave = Buffer.from(process.env.CONMUTADOR_CASETA_TOKEN || '');
  const cabecera = Buffer.from(req.get('Authorization') || '');
  const esperado = Buffer.concat([Buffer.from('Bearer '), clave]);
  if (clave.length < 32 || cabecera.length !== esperado.length || !timingSafeEqual(cabecera, esperado)) {
    return res.status(401).json({ ok: false, message: 'Agente no autorizado' });
  }
  next();
}

function habilitado(_req, res, next) {
  if (!casetaHabilitada()) return res.status(503).json({ ok: false, message: 'La línea de caseta está deshabilitada' });
  if (Buffer.byteLength(process.env.CONMUTADOR_CASETA_TOKEN || '') < 32) {
    return res.status(503).json({ ok: false, message: 'Falta configurar la central de caseta' });
  }
  next();
}

function telefonoNacional(telefono) {
  return telefono.replace(/^\+?(?:521|52)(?=\d{10}$)/, '');
}

async function opciones(datos) {
  const grupo = typeof datos?.grupo === 'string' ? datos.grupo.trim() : '';
  const numero = typeof datos?.numero === 'string' ? datos.numero.trim() : '';
  const domicilio = domicilioConmutador(grupo, numero);
  if (!domicilio) return null;
  const telefonos = (await buscarTelefonosConmutador(domicilio)).map(telefonoNacional);
  const contactos = ['A', 'B'].filter((_, indice) => /^[2-9]\d{9}$/.test(telefonos[indice] || ''));
  return { domicilio, telefonos, contactos };
}

function fallo(res, error) {
  console.error('Error en conmutador de caseta:', error.name);
  return res.status(503).json({ ok: false, message: 'No fue posible comunicarse con el conmutador de caseta' });
}

router.get('/modo', autenticarToken, personal, (_req, res) => {
  res.json({ ok: true, habilitado: casetaHabilitada() });
});

router.get('/contactos', autenticarToken, personal, habilitado, async (req, res) => {
  try {
    const resultado = await opciones(req.query);
    if (!resultado) return res.status(404).json({ ok: false, message: 'Vivienda no disponible' });
    return res.json({ ok: true, contactos: resultado.contactos });
  } catch (error) {
    return fallo(res, error);
  }
});

router.post('/llamadas', autenticarToken, personal, habilitado, async (req, res) => {
  try {
    const resultado = await opciones(req.body);
    const contacto = req.body?.contacto;
    if (!resultado?.contactos.includes(contacto)) {
      return res.status(404).json({ ok: false, message: 'Contacto no disponible para esta vivienda' });
    }

    await asegurarTabla();
    const solicitud = randomUUID();
    const usuarioId = req.usuario.usuarioId;
    const destino = resultado.telefonos[contacto === 'A' ? 0 : 1];
    const aceptada = await sequelize.transaction(async transaction => {
      const [, cambios] = await sequelize.query(`
        UPDATE conmutador_caseta SET solicitud = :solicitud, usuario_id = :usuarioId,
          destino = :destino, estado = 'PENDIENTE', vence_en = UTC_TIMESTAMP(3) + INTERVAL 30 SECOND,
          reclamo = NULL
        WHERE id = 1 AND (vence_en IS NULL OR vence_en <= UTC_TIMESTAMP(3))
      `, { replacements: { solicitud, usuarioId, destino }, type: QueryTypes.UPDATE, transaction, logging: false });
      if (!cambios) return false;
      // Auditoría: conservar el intento original sin darlo por realizado.
      await sequelize.query(
        'INSERT INTO conmutador_intentos_llamada (usuario_id, grupo, numero) VALUES (:usuarioId, :grupo, :numero)',
        { replacements: { usuarioId, ...resultado.domicilio }, type: QueryTypes.INSERT, transaction }
      );
      // Una fila única por solicitud, con estado PENDIENTE. Solo el agente
      // autenticado podrá confirmar posteriormente el envío a Asterisk.
      await sequelize.query(
        'INSERT INTO conmutador_llamadas_seguimiento (solicitud, usuario_id, grupo, numero, estado) ' +
        "VALUES (:solicitud, :usuarioId, :grupo, :numero, 'PENDIENTE')",
        { replacements: { solicitud, usuarioId, ...resultado.domicilio }, type: QueryTypes.INSERT, transaction }
      );
      return true;
    });
    if (!aceptada) return res.status(409).json({ ok: false, message: 'La solicitud anterior sigue activa. Intenta de nuevo cuando termine.' });
    return res.status(202).json({ ok: true, solicitud });
  } catch (error) {
    return fallo(res, error);
  }
});

router.get('/llamadas/:solicitud', autenticarToken, personal, habilitado, async (req, res) => {
  if (!uuid(req.params.solicitud)) return res.sendStatus(404);
  try {
    const [fila] = await sequelize.query(`
      SELECT CASE WHEN estado IN ('PENDIENTE', 'RECLAMADA') AND vence_en <= UTC_TIMESTAMP(3)
        THEN 'VENCIDA' ELSE estado END AS estado
      FROM conmutador_caseta WHERE id = 1 AND solicitud = :solicitud AND usuario_id = :usuarioId
    `, { replacements: { solicitud: req.params.solicitud, usuarioId: req.usuario.usuarioId }, type: QueryTypes.SELECT });
    if (!fila) return res.sendStatus(404);
    return res.json({ ok: true, estado: fila.estado });
  } catch (error) {
    return fallo(res, error);
  }
});

router.post('/agente/siguiente', habilitado, agente, async (_req, res) => {
  try {
    const reclamo = randomUUID();
    const [, cambios] = await sequelize.query(`
      UPDATE conmutador_caseta SET estado = 'RECLAMADA', reclamo = :reclamo
      WHERE id = 1 AND estado = 'PENDIENTE' AND vence_en > UTC_TIMESTAMP(3)
    `, { replacements: { reclamo }, type: QueryTypes.UPDATE });
    if (!cambios) return res.sendStatus(204);

    const [orden] = await sequelize.query(`
      SELECT solicitud, destino, reclamo,
        TIMESTAMPDIFF(MICROSECOND, UTC_TIMESTAMP(3), vence_en) DIV 1000 AS vigencia_ms
      FROM conmutador_caseta
      WHERE id = 1 AND reclamo = :reclamo AND vence_en > UTC_TIMESTAMP(3)
    `, { replacements: { reclamo }, type: QueryTypes.SELECT });
    if (!orden) return res.sendStatus(204);
    await sequelize.query(
      'UPDATE conmutador_caseta SET destino = NULL WHERE id = 1 AND reclamo = :reclamo',
      { replacements: { reclamo }, type: QueryTypes.UPDATE }
    );
    return res.json(orden);
  } catch (error) {
    return fallo(res, error);
  }
});

router.post('/agente/resultado', habilitado, agente, async (req, res) => {
  const { solicitud, reclamo, estado } = req.body || {};
  if (!uuid(solicitud) || !uuid(reclamo) || !['ENVIADA', 'ERROR', 'FINALIZADA'].includes(estado)) {
    return res.sendStatus(400);
  }
  try {
    // Ambas actualizaciones son una transacción: nunca se podrá mostrar una
    // llamada "ENVIADA" si caseta no aceptó el resultado del agente.
    await sequelize.transaction(async transaction => {
      const [, cambios] = await sequelize.query(`
        UPDATE conmutador_caseta SET estado = :estado, destino = NULL,
          reclamo = CASE WHEN :estado = 'ENVIADA' THEN reclamo ELSE NULL END,
          vence_en = CASE WHEN :estado IN ('FINALIZADA', 'ERROR') THEN UTC_TIMESTAMP(3) ELSE vence_en END
        WHERE id = 1 AND solicitud = :solicitud AND reclamo = :reclamo
          AND (estado = 'RECLAMADA' OR (estado = 'ENVIADA' AND :estado = 'FINALIZADA'))
      `, { replacements: { estado, solicitud, reclamo }, type: QueryTypes.UPDATE, transaction });
      if (!cambios) return; // Duplicado o identificador ajeno: jamás confirmar historial.
      await sequelize.query(`
        UPDATE conmutador_llamadas_seguimiento
        SET estado = :estado,
          confirmado_en = CASE WHEN :estado IN ('ENVIADA','FINALIZADA')
            THEN COALESCE(confirmado_en, UTC_TIMESTAMP(3)) ELSE confirmado_en END
        WHERE solicitud = :solicitud
          AND estado IN ('PENDIENTE','ENVIADA')
      `, { replacements: { estado, solicitud }, type: QueryTypes.UPDATE, transaction });
    });
    return res.sendStatus(204);
  } catch (error) {
    return fallo(res, error);
  }
});

module.exports = router;
