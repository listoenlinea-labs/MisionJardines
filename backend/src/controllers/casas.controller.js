const { Casa, Condomino } = require('../models');

const obtenerCasas = async (req, res) => {
    try {
        const casas = await Casa.findAll({
            attributes: [
                'id',
                'calle',
                'numero',
                'nombre',
                'controles',
                'pago',
                'enRenta',
                'telefono',
                'correo',
                'observaciones'
            ],

            include: [
                {
                    model: Condomino,
                    as: 'condominos',
                    required: false,
                    where: {
                        activo: true
                    },
                    attributes: [
                        'id',
                        'nombreCompleto',
                        'telefono',
                        'correo',
                        'fechaRegistro'
                    ]
                }
            ],

            order: [
                ['calle', 'ASC'],
                ['numero', 'ASC']
            ]
        });

        return res.status(200).json({
            ok: true,
            total: casas.length,
            casas
        });

    } catch (error) {
        console.error('Error al obtener casas:', error);

        return res.status(500).json({
            ok: false,
            message: 'Error al obtener las casas'
        });
    }
};

module.exports = {
    obtenerCasas
};
