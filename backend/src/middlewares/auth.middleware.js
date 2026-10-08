const jwt = require('jsonwebtoken');
const { Usuario, Rol } = require('../models');
const { seleccionarCasa } = require('../services/viviendas.service');
const { canAccess } = require('../config/permissions');
const modules = { casas:'bases_datos.html', cuotas:'cuotas.html', eventos:'calendario.html', accesos:'seguridad.html', visitas:'visitas.html', dashboard:'index.html', pagos:'pagos.html', conexion:'conexion.html' };

async function autenticarToken(req, res, next) {
    const authorizationHeader = req.headers.authorization;

    if (!authorizationHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
            ok: false,
            message: 'Token de acceso requerido'
        });
    }

    const token = authorizationHeader.slice(7);

    try {
        const payload = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        const user = await Usuario.findByPk(payload.usuarioId, {
            attributes: ['id','casaId','rolId','estatus','sesionVersion'],
            include: [{ model: Rol, as: 'rol', attributes: ['nombre','activo'] }]
        });
        if (!user || user.estatus !== 'ACTIVO' || !user.rol?.activo) {
            return res.status(403).json({ok:false,message:'El usuario ya no tiene acceso'});
        }
        // Cuenta reactivada: rechazar JWT emitidos antes de la baja, aunque vuelvan a estar ACTIVA.
        if (Number(payload.sesionVersion || 0) !== Number(user.sesionVersion || 0)) {
            return res.status(401).json({ok:false,message:'Esta sesión fue revocada. Inicia sesión nuevamente.'});
        }
        req.usuario = { ...payload, usuarioId:user.id, casaId:user.casaId, rolId:user.rolId, rol:user.rol.nombre };
        const section = modules[req.baseUrl.split('/').pop()];
        if (section && !canAccess(req.usuario.rol, section)) {
            return res.status(403).json({ok:false,message:'No tienes acceso a esta sección'});
        }

        // Account/household management remains reachable after membership revocation.
        const identityOnly = req.baseUrl.endsWith('/viviendas') || (req.baseUrl.endsWith('/auth') && req.path !== '/perfil');
        req.usuario.casaId = await seleccionarCasa(user.id, identityOnly ? undefined : req.headers['x-casa-id']);
        const scoped = ['cuotas','pagos','eventos','busqueda'].includes(req.baseUrl.split('/').pop());
        if (scoped && !req.usuario.casaId && !['SUPER_ADMIN','ADMINISTRADOR','SEGURIDAD','MESA_DIRECTIVA','MANTENIMIENTO'].includes(req.usuario.rol)) {
            return res.status(403).json({ok:false,message:'No tienes una vivienda activa. Revisa Mis viviendas.'});
        }
        return next();
    } catch (error) {
        if (error.status) return res.status(error.status).json({ok:false,message:error.message});
        if (!['TokenExpiredError','JsonWebTokenError','NotBeforeError'].includes(error.name)) {
            console.error('Error verificando sesión:', error.message);
            return res.status(503).json({ok:false,message:'No fue posible verificar el acceso. Inténtalo nuevamente.'});
        }
        return res.status(401).json({
            ok: false,
            message:
                error.name === 'TokenExpiredError'
                    ? 'La sesión ha expirado'
                    : 'Token inválido'
        });
    }
}

module.exports = {
    autenticarToken
};