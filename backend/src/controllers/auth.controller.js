const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
    Usuario,
    Rol,
    Casa
} = require('../models');

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
                            'codigoCasa',
                            'numeroCasa',
                            'calle'
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

        if (usuario.estatus !== 'ACTIVO') {
            return res.status(403).json({
                ok: false,
                message: `El usuario se encuentra ${usuario.estatus.toLowerCase()}`
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

        const token = jwt.sign(
            {
                usuarioId: usuario.id,
                casaId: usuario.casaId,
                rolId: usuario.rolId,
                rol: usuario.rol.nombre
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
                            'codigoCasa',
                            'numeroCasa',
                            'calle'
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

        return res.status(200).json({
            ok: true,
            usuario
        });
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

module.exports = {
    iniciarSesion,
    obtenerPerfil
};