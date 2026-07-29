const { Calle } = require('../models');

async function listarCalles(req, res) {
    try {
        const calles = await Calle.findAll({
            where: {
                activo: true
            },
            order: [
                ['nombre', 'ASC']
            ]
        });

        return res.json({
            ok: true,
            total: calles.length,
            data: calles
        });
    } catch (error) {
        console.error(
            'Error al listar calles:',
            error
        );

        return res.status(500).json({
            ok: false,
            message:
                'No fue posible consultar las calles',
            error:
                process.env.NODE_ENV === 'development'
                    ? error.message
                    : undefined
        });
    }
}

module.exports = {
    listarCalles
};