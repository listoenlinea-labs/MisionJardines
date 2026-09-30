const jwt = require('jsonwebtoken');
const { Usuario, Rol } = require('../models');
const { canAccess } = require('../../../docs/assets/js/permissions');
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
            attributes: ['id','casaId','rolId','estatus'],
            include: [{ model: Rol, as: 'rol', attributes: ['nombre','activo'] }]
        });
        if (!user || user.estatus !== 'ACTIVO' || !user.rol?.activo) {
            return res.status(403).json({ok:false,message:'El usuario ya no tiene acceso'});
        }
        req.usuario = { ...payload, usuarioId:user.id, casaId:user.casaId, rolId:user.rolId, rol:user.rol.nombre };
        const section = modules[req.baseUrl.split('/').pop()];
        if (section && !canAccess(req.usuario.rol, section)) {
            return res.status(403).json({ok:false,message:'No tienes acceso a esta sección'});
        }

        return next();
    } catch (error) {
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