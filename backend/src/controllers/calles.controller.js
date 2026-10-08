const { Casa } = require('../models');

const listarCalles = async (req, res) => {
    try {
        const resultados = await Casa.findAll({
            attributes: ['calleCorrecta'],

            group: ['calleCorrecta'],

            order: [
                ['calleCorrecta', 'ASC']
            ],

            raw: true
        });

        const calles = resultados.map(item => item.calleCorrecta);

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