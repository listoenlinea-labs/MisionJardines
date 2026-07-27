const jwt = require('jsonwebtoken');

function autenticarToken(req, res, next) {
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

        req.usuario = payload;

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