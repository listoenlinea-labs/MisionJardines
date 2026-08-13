const { Casa } = require('../models');

const listarCalles = async (req, res) => {
    try {
        const resultados = await Casa.findAll({
            attributes: ['calle'],

            group: ['calle'],

            order: [
                ['calle', 'ASC']
            ],

            raw: true
        });

        const calles = resultados.map(item => item.calle);

        return res.status(200).json({
            ok: true,
            total: calles.length,
            calles
        });

    } catch (error) {
        console.error('Error al obtener calles:', error);

        return res.status(500).json({
            ok: false,
            message: 'Error al obtener las calles'
        });
    }
};

module.exports = {
    listarCalles
};