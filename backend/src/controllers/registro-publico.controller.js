const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../config/database');
const { Usuario, Rol, Casa, VerificacionCuenta } = require('../models');
const SolicitudRegistro = require('../models/SolicitudRegistro');
const { enviarCodigoVerificacion } = require('../services/email.service');
const { vincular } = require('../services/viviendas.service');

const LIMITE_INTENTOS = 5;
const EXPIRACION = 15 * 60 * 1000;
const rolesAprobables = new Set(['CONDOMINO', 'SEGURIDAD', 'ADMINISTRADOR']);
const limpiar = (value, max = 150) => String(value || '').trim().slice(0, max);
const correoNormalizado = value => limpiar(value).toLowerCase();
const validoCorreo = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const codigoHash = (correo, codigo) => crypto.createHash('sha256')
  .update(correo + ':' + codigo + ':' + process.env.JWT_SECRET).digest('hex');
const errorHttp = (status, message) => Object.assign(new Error(message), { status });

async function viviendasDisponibles(req, res) {
  try {
    const casas = await Casa.findAll({
      attributes: ['id', 'calle', 'numero'],
      order: [['calle', 'ASC'], ['numero', 'ASC']]
    });
    return res.json({ ok: true, casas });
  } catch (error) {
    console.error('Error listando viviendas para registro:', error);
    return res.status(503).json({ ok: false, message: 'No fue posible consultar las viviendas' });
  }
}

async function solicitarAlta(req, res) {
  try {
    const body = req.body || {};
    const correo = correoNormalizado(body.correo);
    const nombre = limpiar(body.nombre, 100);
    const apellidoPaterno = limpiar(body.apellidoPaterno, 100);
    const apellidoMaterno = limpiar(body.apellidoMaterno, 100);
    const telefono = limpiar(body.telefono, 25);
    const esSeguridad = body.esSeguridad === true;
    const casaId = esSeguridad ? null : Number(body.casaId);
    const password = body.contrasena;
    if (!validoCorreo(correo) || !nombre || !apellidoPaterno || nombre.length < 2 || apellidoPaterno.length < 2) {
      throw errorHttp(400, 'Ingresa nombre, apellido y correo válidos');
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 72 ||
        !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      throw errorHttp(400, 'La contraseña requiere 8 a 72 caracteres, mayúscula, minúscula y número');
    }
    if (!esSeguridad && (!Number.isSafeInteger(casaId) || casaId <= 0)) {
      throw errorHttp(400, 'Selecciona tu calle y número de casa');
    }
    if (!esSeguridad && !(await Casa.findByPk(casaId, { attributes: ['id'] }))) {
      throw errorHttp(400, 'La vivienda seleccionada no existe');
    }
    if (await Usuario.findOne({ where: { correo }, attributes: ['id'] })) {
      throw errorHttp(409, 'Este correo ya tiene una cuenta. Inicia sesión o contacta a administración.');
    }
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const datosJson = JSON.stringify({
      registroPublico: true, nombre, apellidoPaterno,
      apellidoMaterno: apellidoMaterno || null, telefono: telefono || null,
      esSeguridad, contrasenaHash: await bcrypt.hash(password, 12)
    });
    await VerificacionCuenta.destroy({ where: { correo, tipo: 'REGISTRO', consumidoEn: null } });
    const verification = await VerificacionCuenta.create({
      correo, tipo: 'REGISTRO', casaId, datosJson,
      codigoHash: codigoHash(correo, codigo),
      expiraEn: new Date(Date.now() + EXPIRACION)
    });
    try {
      await enviarCodigoVerificacion({ destinatario: correo, codigo, nombre, motivo: 'registro' });
    } catch (mailError) {
      await verification.destroy();
      throw mailError;
    }
    return res.status(202).json({
      ok: true, message: 'Enviamos un código a tu correo. Después de verificarlo, administración revisará tu solicitud.'
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, message: error.message });
    console.error('Error al solicitar alta pública:', error);
    return res.status(503).json({ ok: false, message: 'No pudimos enviar la verificación. Intenta nuevamente más tarde.' });
  }
}

async function verificarAlta(req, res) {
  const correo = correoNormalizado(req.body?.correo);
  const codigo = limpiar(req.body?.codigo, 12);
  if (!validoCorreo(correo) || !/^\d{6}$/.test(codigo)) {
    return res.status(400).json({ ok: false, message: 'Escribe tu correo y el código de seis dígitos' });
  }
  const transaction = await db.transaction();
  try {
    const row = await VerificacionCuenta.findOne({
      where: { correo, tipo: 'REGISTRO', consumidoEn: null },
      order: [['id', 'DESC']], transaction, lock: transaction.LOCK.UPDATE
    });
    if (!row || new Date(row.expiraEn) <= new Date()) throw errorHttp(410, 'El código venció. Solicita uno nuevo.');
    const datos = JSON.parse(row.datosJson || '{}');
    if (datos.registroPublico !== true) throw errorHttp(400, 'Código de registro no válido para este formulario');
    if (row.intentos >= LIMITE_INTENTOS) throw errorHttp(429, 'Demasiados intentos. Solicita un nuevo código.');
    if (row.codigoHash !== codigoHash(correo, codigo)) {
      await row.increment('intentos', { transaction });
      await transaction.commit();
      return res.status(400).json({ ok: false, message: 'Código incorrecto' });
    }
    const rolBase = await Rol.findOne({ where: { nombre: 'CONDOMINO', activo: true }, transaction });
    if (!rolBase) throw new Error('Rol CONDOMINO no configurado');
    if (await Usuario.findOne({ where: { correo }, transaction })) throw errorHttp(409, 'El correo ya está registrado');
    const user = await Usuario.create({
      nombre: datos.nombre, apellidoPaterno: datos.apellidoPaterno,
      apellidoMaterno: datos.apellidoMaterno, telefono: datos.telefono,
      correo, contrasenaHash: datos.contrasenaHash,
      casaId: datos.esSeguridad ? null : row.casaId,
      rolId: rolBase.id, estatus: 'PENDIENTE',
      esContactoPrincipal: false, recibeCorreosPago: true
    }, { transaction });
    await SolicitudRegistro.create({
      usuarioId: user.id, casaId: datos.esSeguridad ? null : row.casaId,
      tipoSolicitado: datos.esSeguridad ? 'SEGURIDAD' : 'CONDOMINO', estatus: 'PENDIENTE'
    }, { transaction });
    await row.update({
      consumidoEn: new Date(), datosJson: null, codigoHash: crypto.randomBytes(32).toString('hex')
    }, { transaction });
    await transaction.commit();
    return res.status(201).json({
      ok: true, message: 'Correo verificado. Tu cuenta quedó pendiente de autorización por Administración. Aún no puedes iniciar sesión.'
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.status) return res.status(error.status).json({ ok: false, message: error.message });
    console.error('Error verificando alta pública:', error);
    return res.status(503).json({ ok: false, message: 'No fue posible registrar la solicitud' });
  }
}

async function listarSolicitudes(req, res) {
  try {
    const solicitudes = await SolicitudRegistro.findAll({
      where: { estatus: 'PENDIENTE' },
      order: [['creadoEn', 'ASC']], limit: 200
    });
    const ids = solicitudes.map(s => s.usuarioId);
    const usuarios = ids.length ? await Usuario.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ['id', 'nombre', 'apellidoPaterno', 'apellidoMaterno', 'correo', 'telefono', 'estatus']
    }) : [];
    const casasIds = solicitudes.map(s => s.casaId).filter(Boolean);
    const casas = casasIds.length ? await Casa.findAll({
      where: { id: { [Op.in]: casasIds } }, attributes: ['id', 'calle', 'numero']
    }) : [];
    const byUser = new Map(usuarios.map(u => [String(u.id), u]));
    const byHouse = new Map(casas.map(c => [String(c.id), c]));
    return res.json({ ok: true, solicitudes: solicitudes.map(row => ({
      id: row.id, usuarioId: row.usuarioId, tipoSolicitado: row.tipoSolicitado,
      creadoEn: row.creadoEn, casaId: row.casaId,
      casa: byHouse.get(String(row.casaId)) || null,
      usuario: byUser.get(String(row.usuarioId)) || null
    })) });
  } catch (error) {
    console.error('Error obteniendo solicitudes públicas:', error);
    return res.status(503).json({ ok: false, message: 'No fue posible consultar las solicitudes' });
  }
}

async function revisarSolicitud(req, res) {
  const accion = limpiar(req.body?.accion, 10).toUpperCase();
  const rolDeseado = limpiar(req.body?.rol, 30).toUpperCase();
  const comentario = limpiar(req.body?.comentario, 600);
  if (!['APROBAR', 'RECHAZAR'].includes(accion) ||
      (accion === 'APROBAR' && !rolesAprobables.has(rolDeseado))) {
    return res.status(400).json({ ok: false, message: 'Selecciona una acción y un rol válidos' });
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ ok: false, message: 'Solicitud inválida' });
  const transaction = await db.transaction();
  try {
    const solicitud = await SolicitudRegistro.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!solicitud || solicitud.estatus !== 'PENDIENTE') throw errorHttp(409, 'Solicitud inexistente o ya revisada');
    const usuario = await Usuario.findByPk(solicitud.usuarioId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!usuario || usuario.estatus !== 'PENDIENTE') throw errorHttp(409, 'La cuenta ya no está pendiente');
    if (String(usuario.id) === String(req.usuario.usuarioId)) throw errorHttp(403, 'No puedes aprobar tu propia cuenta');
    let casaId = null;
    if (accion === 'APROBAR') {
      if (rolDeseado === 'CONDOMINO') {
        casaId = Number(req.body.casaId || solicitud.casaId);
        if (!Number.isSafeInteger(casaId) || casaId < 1 || !(await Casa.findByPk(casaId, { transaction, attributes: ['id'] }))) {
          throw errorHttp(400, 'Confirma la vivienda antes de aprobar a un condómino');
        }
      }
      const rol = await Rol.findOne({ where: { nombre: rolDeseado, activo: true }, transaction });
      if (!rol) throw errorHttp(409, 'El rol seleccionado no está configurado');
      await usuario.update({ rolId: rol.id, casaId, estatus: 'ACTIVO', actualizadoEn: new Date() }, { transaction });
      if (rolDeseado === 'CONDOMINO') {
        await vincular({ usuarioId: usuario.id, casaId, tipo: 'MIEMBRO', actorId: req.usuario.usuarioId, transaction });
      }
    } else {
      await usuario.update({ estatus: 'BAJA', actualizadoEn: new Date() }, { transaction });
    }
    await solicitud.update({
      estatus: accion === 'APROBAR' ? 'APROBADA' : 'RECHAZADA',
      rolAsignado: accion === 'APROBAR' ? rolDeseado : null,
      revisadoPorUsuarioId: req.usuario.usuarioId, comentarioRevision: comentario || null,
      revisadoEn: new Date()
    }, { transaction });
    await transaction.commit();
    return res.json({
      ok: true,
      message: accion === 'APROBAR' ? 'Cuenta autorizada. Ya puede iniciar sesión.' : 'Solicitud rechazada.'
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    if (error.status) return res.status(error.status).json({ ok: false, message: error.message });
    console.error('Error revisando alta pública:', error);
    return res.status(503).json({ ok: false, message: 'No fue posible revisar la cuenta' });
  }
}

module.exports = { viviendasDisponibles, solicitarAlta, verificarAlta, listarSolicitudes, revisarSolicitud };
