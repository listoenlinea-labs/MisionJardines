const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

const {
    Usuario,
    Rol,
    Casa,
    Condomino,
    VerificacionCuenta,
    SolicitudRol,
    SolicitudCuenta
} = require('../models');
const { invitacion, vigente } = require('../services/viviendas.service');
const { InvitacionCasa } = require('../models');
const emailService = require('../services/email.service');

const EXPIRACION_CODIGO_MINUTOS = 15;
const MAX_INTENTOS_CODIGO = 5;
const ROLES_SOLICITABLES = new Set(['CONDOMINO', 'SEGURIDAD', 'ADMINISTRADOR']);
const ROLES_REVISORES = new Set(['SUPER_ADMIN', 'ADMINISTRADOR']);

function normalizarCorreo(valor) {
    return String(valor || '').trim().toLowerCase();
}

function codigoHash(correo, codigo) {
    return crypto
        .createHash('sha256')
        .update(`${normalizarCorreo(correo)}:${codigo}:${process.env.JWT_SECRET}`)
        .digest('hex');
}

function generarCodigo() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function contrasenaSegura(contrasena) {
    return typeof contrasena === 'string'
        && contrasena.length >= 8
        && /[a-z]/.test(contrasena)
        && /[A-Z]/.test(contrasena)
        && /\d/.test(contrasena);
}

function nombreCompleto(usuario) {
    return [usuario?.nombre, usuario?.apellidoPaterno, usuario?.apellidoMaterno]
        .filter(Boolean)
        .join(' ');
}

function perfilInclude() {
    return [
        { model: Rol, as: 'rol', attributes: ['id', 'nombre', 'descripcion'] },
        { model: Casa, as: 'casa', attributes: ['id', 'numero', 'calle', 'nombre'] }
    ];
}

async function iniciarSesion(req, res) {
    try {
        const correo = req.body.correo?.trim().toLowerCase();
        const contrasena = req.body.contrasena;

        if (!correo || !contrasena) {
            return res.status(400).json({
                ok: false,
                message: 'Correo y contraseña son obligatorios'
            });
        }

        const usuario = await Usuario
            .scope('conContrasena')
            .findOne({
                where: {
                    correo
                },
                include: [
                    {
                        model: Rol,
                        as: 'rol',
                        attributes: [
                            'id',
                            'nombre',
                            'descripcion'
                        ]
                    },
                    {
                        model: Casa,
                        as: 'casa',
                        attributes: [
                            'id',
                            'numero',
                            'calle',
                            'nombre'
                        ]
                    }
                ]
            });

        if (!usuario) {
            return res.status(401).json({
                ok: false,
                message: 'Credenciales incorrectas'
            });
        }

        const contrasenaValida = await bcrypt.compare(
            contrasena,
            usuario.contrasenaHash
        );

        if (!contrasenaValida) {
            return res.status(401).json({
                ok: false,
                message: 'Credenciales incorrectas'
            });
        }

        if (usuario.estatus !== 'ACTIVO') {
            return res.status(403).json({ ok: false, message: usuario.estatus === 'PENDIENTE'
                ? 'Tu cuenta está pendiente de verificación por Administración. Aún no tienes acceso al portal.'
                : 'Tu cuenta no tiene acceso. Contacta a Administración.' });
        }

        const token = jwt.sign(
            {
                usuarioId: usuario.id,
                casaId: usuario.casaId,
                rolId: usuario.rolId,
                rol: usuario.rol.nombre,
                sesionVersion: Number(usuario.sesionVersion || 0)
            },
            process.env.JWT_SECRET,
            {
                expiresIn:
                    process.env.JWT_EXPIRES_IN || '8h'
            }
        );

        await usuario.update({
            ultimoAccesoEn: new Date()
        });

        const usuarioSeguro = usuario.toJSON();

        delete usuarioSeguro.contrasenaHash;

        return res.status(200).json({
            ok: true,
            message: 'Inicio de sesión correcto',
            token,
            usuario: usuarioSeguro
        });
    } catch (error) {
        console.error('Error al iniciar sesión:', error);

        return res.status(500).json({
            ok: false,
            message: 'No fue posible iniciar sesión',
            error:
                process.env.NODE_ENV === 'development'
                    ? error.message
                    : undefined
        });
    }
}

async function obtenerPerfil(req, res) {
    try {
        const usuario = await Usuario.findByPk(
            req.usuario.usuarioId,
            {
                include: [
                    {
                        model: Rol,
                        as: 'rol',
                        attributes: [
                            'id',
                            'nombre',
                            'descripcion'
                        ]
                    },
                    {
                        model: Casa,
                        as: 'casa',
                        attributes: [
                            'id',
                            'numero',
                            'calle',
                            'nombre'
                        ]
                    }
                ]
            }
        );

        if (!usuario) {
            return res.status(404).json({
                ok: false,
                message: 'Usuario no encontrado'
            });
        }

        if (usuario.estatus !== 'ACTIVO') {
            return res.status(403).json({
                ok: false,
                message: 'El usuario ya no tiene acceso'
            });
        }

        const perfil = usuario.toJSON();
        perfil.casaId = req.usuario.casaId;
        perfil.casa = req.usuario.casaId ? await Casa.findByPk(req.usuario.casaId,{attributes:['id','calle','numero','nombre']}) : null;
        return res.status(200).json({ok:true,usuario:perfil});
    } catch (error) {
        console.error('Error al consultar perfil:', error);

        return res.status(500).json({
            ok: false,
            message: 'No fue posible consultar el perfil',
            error:
                process.env.NODE_ENV === 'development'
                    ? error.message
                    : undefined
        });
    }
}

async function listarViviendasRegistro(req,res) { return res.status(403).json({ok:false,message:'El padrón de viviendas solo está disponible para Administración. Indica tu domicilio en el formulario de registro.'}); }

// El alta pública NO verifica ni envía mensajes al correo: únicamente recibe
// solicitudes PENDIENTES para revisión manual de Administración.
async function solicitarRegistro(req, res) {
    const body = req.body || {};
    const correo = normalizarCorreo(body.correo);
    const nombre = String(body.nombre || '').trim();
    const apellidoPaterno = String(body.apellidoPaterno || '').trim();
    const apellidoMaterno = String(body.apellidoMaterno || '').trim();
    const telefono = String(body.telefono || '').trim();
    const contrasena = body.contrasena;
    const tipoCuenta = body.invitacion ? 'CONDOMINO' : String(body.tipoCuenta || 'CONDOMINO').toUpperCase();
    const calle = tipoCuenta === 'CONDOMINO' ? String(body.calle || '').trim() : '';
    const numeroCasa = tipoCuenta === 'CONDOMINO' ? String(body.numeroCasa || '').trim() : '';

    if (!['CONDOMINO', 'SEGURIDAD'].includes(tipoCuenta)) {
        return res.status(400).json({ ok: false, message: 'Tipo de cuenta inválido' });
    }
    if (!correo || correo.length > 150 || !/^\S+@\S+\.\S+$/.test(correo)
        || !nombre || !apellidoPaterno || nombre.length > 100 || apellidoPaterno.length > 100
        || apellidoMaterno.length > 100 || telefono.length > 25) {
        return res.status(400).json({ ok: false, message: 'Revisa tus datos personales y escribe un correo válido' });
    }
    if (tipoCuenta === 'CONDOMINO' && !body.invitacion &&
        (!calle || !numeroCasa || calle.length > 100 || numeroCasa.length > 20)) {
        return res.status(400).json({ ok: false, message: 'Indica calle y número de casa' });
    }
    if (!contrasenaSegura(contrasena) || Buffer.byteLength(contrasena, 'utf8') > 72) {
        return res.status(400).json({ ok: false, message: 'La contraseña debe tener 8 caracteres, mayúscula, minúscula y número' });
    }

    try {
        const contrasenaHash = await bcrypt.hash(contrasena, 12);
        // Usuario y solicitud se crean juntos, o no se crea ninguno.
        await sequelize.transaction(async transaction => {
            // El correo sigue siendo único en usuarios. Una cuenta BAJA puede
            // volver a solicitar autorización sin recuperar su acceso anterior.
            // El lock evita solicitudes simultáneas con el mismo correo.
            const existente = await Usuario.findOne({
                where: { correo },
                attributes: ['id', 'estatus', 'sesionVersion'],
                transaction, lock: transaction.LOCK.UPDATE
            });
            if (existente && existente.estatus !== 'BAJA') {
                throw Object.assign(new Error('Ese correo ya tiene una cuenta o solicitud registrada. Contacta a Administración.'), { status: 409 });
            }
            let invitacionRegistro = null;
            let casa = null;
            if (body.invitacion) {
                invitacionRegistro = await invitacion(body.invitacion, transaction);
                if (normalizarCorreo(invitacionRegistro.correo) !== correo) {
                    throw Object.assign(new Error('Usa el correo indicado en la invitación'), { status: 403 });
                }
                casa = await Casa.findByPk(invitacionRegistro.casaId, {
                    attributes: ['id', 'calle', 'numero'], transaction
                });
                if (!casa) throw Object.assign(new Error('La vivienda de la invitación ya no existe'), { status: 400 });
            }
            const rolBase = await Rol.findOne({ where: { nombre: 'CONDOMINO', activo: true }, transaction });
            if (!rolBase) throw new Error('Rol CONDOMINO no configurado');
            let nuevoUsuario;
            if (existente) {
                // Actualizar la identidad declarada y contraseña SOLO como
                // solicitud pendiente. No se restauran roles ni viviendas.
                await existente.update({
                    casaId: null, rolId: rolBase.id,
                    nombre, apellidoPaterno, apellidoMaterno: apellidoMaterno || null,
                    telefono: telefono || null, contrasenaHash,
                    estatus: 'PENDIENTE', esContactoPrincipal: false,
                    sesionVersion: Number(existente.sesionVersion || 0) + 1,
                    actualizadoEn: new Date()
                }, { transaction });
                nuevoUsuario = existente;
            } else {
                nuevoUsuario = await Usuario.create({
                    casaId: null, rolId: rolBase.id,
                    nombre, apellidoPaterno, apellidoMaterno: apellidoMaterno || null,
                    telefono: telefono || null, correo, contrasenaHash,
                    estatus: 'PENDIENTE', esContactoPrincipal: false, recibeCorreosPago: true
                }, { transaction });
            }
            await SolicitudCuenta.create({
                usuarioId: nuevoUsuario.id, tipoCuenta,
                calle: casa?.calle || (tipoCuenta === 'CONDOMINO' ? calle : null),
                numeroCasa: casa?.numero || (tipoCuenta === 'CONDOMINO' ? numeroCasa : null),
                casaSugeridaId: casa?.id || null,
                tipoVinculo: invitacionRegistro?.tipo === 'RESPONSABLE' ? 'RESPONSABLE' : 'MIEMBRO',
                estatus: 'PENDIENTE'
            }, { transaction });
            // Una invitación no puede utilizarse para registrar dos cuentas.
            if (invitacionRegistro) await invitacionRegistro.update({ aceptadoEn: new Date() }, { transaction });
        });
        return res.status(201).json({
            ok: true, pendienteAprobacion: true,
            message: 'Solicitud recibida. Administración revisará tu identidad y autorizará el acceso. No se enviará ningún correo.'
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ ok: false, message: error.message });
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ ok: false, message: 'Ese correo ya está registrado. Contacta a Administración.' });
        }
        console.error('Error al crear solicitud de registro:', error);
        return res.status(503).json({ ok: false, message: 'No fue posible guardar tu solicitud. Intenta nuevamente o contacta a Administración.' });
    }
}

// Compatibilidad con clientes antiguos: el código por correo ya no participa
// en el alta. No crear cuentas por una ruta de verificación obsoleta.
async function verificarRegistro(req, res) {
    return res.status(410).json({
        ok: false,
        message: 'La verificación por correo ya no se utiliza. Actualiza la página y envía tu solicitud para revisión administrativa.'
    });
}

async function actualizarPerfil(req, res) {
    try {
        const usuario = await Usuario.findByPk(req.usuario.usuarioId);
        if (!usuario) return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
        const nombre = String(req.body.nombre || '').trim();
        const apellidoPaterno = String(req.body.apellidoPaterno || '').trim();
        if (!nombre || !apellidoPaterno) {
            return res.status(400).json({ ok: false, message: 'Nombre y apellido paterno son obligatorios' });
        }
        await usuario.update({
            nombre,
            apellidoPaterno,
            apellidoMaterno: String(req.body.apellidoMaterno || '').trim() || null,
            telefono: String(req.body.telefono || '').trim() || null,
            actualizadoEn: new Date()
        });
        const perfil = await Usuario.findByPk(usuario.id, { include: perfilInclude() });
        return res.json({ ok: true, message: 'Datos personales actualizados', usuario: perfil });
    } catch (error) {
        console.error('Error al actualizar perfil:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible actualizar tus datos' });
    }
}

async function cambiarContrasena(req, res) {
    try {
        const actual = req.body.contrasenaActual;
        const nueva = req.body.contrasenaNueva;
        if (!contrasenaSegura(nueva)) {
            return res.status(400).json({ ok: false, message: 'La nueva contraseña debe tener 8 caracteres, mayúscula, minúscula y número' });
        }
        const usuario = await Usuario.scope('conContrasena').findByPk(req.usuario.usuarioId);
        if (!usuario || !(await bcrypt.compare(actual || '', usuario.contrasenaHash))) {
            return res.status(401).json({ ok: false, message: 'La contraseña actual no es correcta' });
        }
        await usuario.update({ contrasenaHash: await bcrypt.hash(nueva, 12), actualizadoEn: new Date() });
        return res.json({ ok: true, message: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible cambiar la contraseña' });
    }
}

async function solicitarCambioCorreo(req, res) {
    try {
        const correo = normalizarCorreo(req.body.correoNuevo);
        const usuario = await Usuario.scope('conContrasena').findByPk(req.usuario.usuarioId);
        if (!correo || !/^\S+@\S+\.\S+$/.test(correo)) {
            return res.status(400).json({ ok: false, message: 'Escribe un correo válido' });
        }
        if (!usuario || !(await bcrypt.compare(req.body.contrasenaActual || '', usuario.contrasenaHash))) {
            return res.status(401).json({ ok: false, message: 'La contraseña actual no es correcta' });
        }
        if (correo === usuario.correo) return res.status(400).json({ ok: false, message: 'Ese ya es tu correo actual' });
        if (await Usuario.findOne({ where: { correo } })) {
            return res.status(409).json({ ok: false, message: 'Ese correo ya está registrado' });
        }
        const codigo = generarCodigo();
        await VerificacionCuenta.destroy({ where: { tipo: 'CAMBIO_CORREO', usuarioId: usuario.id, consumidoEn: null } });
        await VerificacionCuenta.create({
            tipo: 'CAMBIO_CORREO', usuarioId: usuario.id, casaId: usuario.casaId,
            correo, codigoHash: codigoHash(correo, codigo),
            expiraEn: new Date(Date.now() + EXPIRACION_CODIGO_MINUTOS * 60000)
        });
        await emailService.enviarCodigoVerificacion({ destinatario: correo, codigo, nombre: nombreCompleto(usuario), motivo: 'cambio_correo' });
        return res.status(202).json({ ok: true, message: 'Enviamos el código al nuevo correo', correo });
    } catch (error) {
        console.error('Error al solicitar cambio de correo:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible enviar el código' });
    }
}

async function verificarCambioCorreo(req, res) {
    const correo = normalizarCorreo(req.body.correoNuevo);
    const codigo = String(req.body.codigo || '').trim();
    const transaction = await sequelize.transaction();
    try {
        const verificacion = await VerificacionCuenta.findOne({
            where: { tipo: 'CAMBIO_CORREO', usuarioId: req.usuario.usuarioId, correo, consumidoEn: null },
            order: [['id', 'DESC']], transaction, lock: transaction.LOCK.UPDATE
        });
        if (!verificacion || verificacion.expiraEn <= new Date()) {
            await transaction.rollback();
            return res.status(410).json({ ok: false, message: 'El código venció. Solicita uno nuevo.' });
        }
        if (verificacion.intentos >= MAX_INTENTOS_CODIGO) {
            await transaction.rollback();
            return res.status(429).json({ ok: false, message: 'Código bloqueado. Solicita uno nuevo.' });
        }
        if (!/^\d{6}$/.test(codigo) || verificacion.codigoHash !== codigoHash(correo, codigo)) {
            await verificacion.increment('intentos', { transaction });
            await transaction.commit();
            return res.status(400).json({ ok: false, message: 'El código no es correcto' });
        }
        if (await Usuario.findOne({ where: { correo, id: { [Op.ne]: req.usuario.usuarioId } }, transaction })) {
            await transaction.rollback();
            return res.status(409).json({ ok: false, message: 'Ese correo ya fue registrado' });
        }
        await Usuario.update({ correo, actualizadoEn: new Date() }, { where: { id: req.usuario.usuarioId }, transaction });
        await verificacion.update({ consumidoEn: new Date() }, { transaction });
        await transaction.commit();
        return res.json({ ok: true, message: 'Correo actualizado correctamente', correo });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        console.error('Error al verificar nuevo correo:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible actualizar el correo' });
    }
}

async function crearSolicitudRol(req, res) {
    try {
        const rolSolicitado = String(req.body.rolSolicitado || '').toUpperCase();
        const motivo = String(req.body.motivo || '').trim();
        if (!ROLES_SOLICITABLES.has(rolSolicitado) || motivo.length < 10) {
            return res.status(400).json({ ok: false, message: 'Selecciona un rol y explica el motivo con al menos 10 caracteres' });
        }
        const usuarioActual = await Usuario.findByPk(req.usuario.usuarioId, {
            include: [{ model: Rol, as: 'rol', attributes: ['nombre'] }]
        });
        if (!usuarioActual || usuarioActual.estatus !== 'ACTIVO') {
            return res.status(403).json({ ok: false, message: 'La cuenta no está activa' });
        }
        if (usuarioActual.rol?.nombre === rolSolicitado) {
            return res.status(400).json({ ok: false, message: 'Ya tienes ese rol asignado' });
        }
        if (await SolicitudRol.findOne({ where: { usuarioId: req.usuario.usuarioId, estatus: 'PENDIENTE' } })) {
            return res.status(409).json({ ok: false, message: 'Ya tienes una solicitud pendiente de revisión' });
        }
        const solicitud = await SolicitudRol.create({ usuarioId: req.usuario.usuarioId, rolSolicitado, motivo });
        return res.status(201).json({ ok: true, message: 'Solicitud enviada a administración', solicitud });
    } catch (error) {
        console.error('Error al solicitar rol:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible enviar la solicitud' });
    }
}

async function listarSolicitudesRol(req, res) {
    try {
        const usuarioActual = await Usuario.findByPk(req.usuario.usuarioId, {
            include: [{ model: Rol, as: 'rol', attributes: ['nombre'] }]
        });
        const esRevisor = ROLES_REVISORES.has(usuarioActual?.rol?.nombre);
        const where = esRevisor ? { estatus: 'PENDIENTE' } : { usuarioId: req.usuario.usuarioId };
        const solicitudes = await SolicitudRol.findAll({
            where,
            include: esRevisor ? [{
                model: Usuario, as: 'usuario',
                attributes: ['id', 'nombre', 'apellidoPaterno', 'correo'],
                include: [{ model: Casa, as: 'casa', attributes: ['calle', 'numero'] }]
            }] : [],
            order: [['creadoEn', 'DESC']],
            limit: esRevisor ? 100 : 10
        });
        return res.json({ ok: true, solicitudes, puedeRevisar: esRevisor });
    } catch (error) {
        console.error('Error al listar solicitudes de rol:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible consultar las solicitudes' });
    }
}

async function revisarSolicitudRol(req, res) {
    const revisor = await Usuario.findByPk(req.usuario.usuarioId, {
        include: [{ model: Rol, as: 'rol', attributes: ['nombre'] }]
    });
    if (!revisor || revisor.estatus !== 'ACTIVO' || !ROLES_REVISORES.has(revisor.rol?.nombre)) {
        return res.status(403).json({ ok: false, message: 'No tienes permiso para revisar solicitudes' });
    }
    const accion = String(req.body.accion || '').toUpperCase();
    if (!['APROBAR', 'RECHAZAR'].includes(accion)) {
        return res.status(400).json({ ok: false, message: 'Acción inválida' });
    }
    const transaction = await sequelize.transaction();
    try {
        const solicitud = await SolicitudRol.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!solicitud || solicitud.estatus !== 'PENDIENTE') {
            await transaction.rollback();
            return res.status(404).json({ ok: false, message: 'La solicitud ya no está pendiente' });
        }
        if (String(solicitud.usuarioId) === String(req.usuario.usuarioId)) {
            await transaction.rollback();
            return res.status(403).json({ ok: false, message: 'Otra persona administradora debe revisar tu solicitud' });
        }
        if (accion === 'APROBAR') {
            const rol = await Rol.findOne({ where: { nombre: solicitud.rolSolicitado, activo: true }, transaction });
            if (!rol) throw new Error(`No existe el rol ${solicitud.rolSolicitado}`);
            await Usuario.update({ rolId: rol.id, actualizadoEn: new Date() }, { where: { id: solicitud.usuarioId }, transaction });
        }
        await solicitud.update({
            estatus: accion === 'APROBAR' ? 'APROBADA' : 'RECHAZADA',
            revisadoPorUsuarioId: req.usuario.usuarioId,
            comentarioRevision: String(req.body.comentario || '').trim() || null,
            revisadoEn: new Date()
        }, { transaction });
        await transaction.commit();
        return res.json({ ok: true, message: accion === 'APROBAR' ? 'Rol aprobado. El usuario deberá iniciar sesión nuevamente.' : 'Solicitud rechazada' });
    } catch (error) {
        if (!transaction.finished) await transaction.rollback();
        console.error('Error al revisar solicitud:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible revisar la solicitud' });
    }
}

module.exports = {
    iniciarSesion,
    obtenerPerfil,
    listarViviendasRegistro,
    solicitarRegistro,
    verificarRegistro,
    actualizarPerfil,
    cambiarContrasena,
    solicitarCambioCorreo,
    verificarCambioCorreo,
    crearSolicitudRol,
    listarSolicitudesRol,
    revisarSolicitudRol
};
