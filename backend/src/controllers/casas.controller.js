const { Casa } = require('../models');

async function obtenerCasas(req, res) {
    try {
        const casas = await Casa.findAll({
            order: [
                ['calle', 'ASC'],
                ['numeroCasa', 'ASC']
            ]
        });

        return res.status(200).json({
            ok: true,
            total: casas.length,
            data: casas
        });
    } catch (error) {
        console.error('Error al consultar casas:', error);

        return res.status(500).json({
            ok: false,
            message: 'No fue posible consultar las casas',
            error:
                process.env.NODE_ENV === 'development'
                    ? error.message
                    : undefined
        });
    }
}

module.exports = {
    obtenerCasas
};