function autorizarRoles(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({
                ok: false,
                message: 'Usuario no autenticado'
            });
        }

        if (!rolesPermitidos.includes(req.usuario.rol)) {
            return res.status(403).json({
                ok: false,
                message: 'No tienes permiso para realizar esta acción'
            });
        }

        return next();
    };
}

module.exports = {
    autorizarRoles
};