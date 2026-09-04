const { Casa, Condomino, PermisoAcceso } = require('../models');

const obtenerCasas = async (req, res) => {
    try {
        const esSeguridad = req.usuario.rol === 'SEGURIDAD';
        const include = [
            {
                model: PermisoAcceso,
                as: 'permisosAcceso',
                required: false,
                attributes: ['pluma', 'porton1', 'porton2', 'porton3']
            }
        ];

        if (!esSeguridad) {
            include.push({
                model: Condomino,
                as: 'condominos',
                required: false,
                where: { activo: true },
                attributes: ['id', 'nombreCompleto', 'telefono', 'correo', 'fechaRegistro']
            });
        }

        const casas = await Casa.findAll({
            attributes: esSeguridad
                ? ['id', 'calle', 'numero']
                : [
                    'id', 'calle', 'numero', 'nombre', 'controles', 'pago',
                    'enRenta', 'telefono', 'correo', 'observaciones'
                ],
            include,
            order: [['calle', 'ASC'], ['numero', 'ASC']]
        });

        return res.status(200).json({ ok: true, total: casas.length, casas });
    } catch (error) {
        console.error('Error al obtener casas:', error);
        return res.status(500).json({ ok: false, message: 'Error al obtener las casas' });
    }
};

const actualizarAccesosCasa = async (req, res) => {
    const acceso = req.body?.acceso;
    const habilitado = req.body?.habilitado;
    const campos = {
        pluma: 'pluma',
        porton1: 'porton1',
        porton2: 'porton2',
        porton3: 'porton3'
    };

    if (!campos[acceso] || typeof habilitado !== 'boolean') {
        return res.status(400).json({ ok: false, message: 'Acceso o estado inválido' });
    }

    try {
        const casa = await Casa.findByPk(req.params.id);
        if (!casa) return res.status(404).json({ ok: false, message: 'Vivienda no encontrada' });

        const [permisos] = await PermisoAcceso.findOrCreate({
            where: { casaId: casa.id },
            defaults: {
                casaId: casa.id,
                pluma: true,
                porton1: true,
                porton2: true,
                porton3: true,
                actualizadoPorUsuarioId: req.usuario.usuarioId
            }
        });

        await permisos.update({
            [campos[acceso]]: habilitado,
            actualizadoPorUsuarioId: req.usuario.usuarioId,
            actualizadoEn: new Date()
        });

        return res.json({
            ok: true,
            message: habilitado ? 'Acceso otorgado' : 'Acceso bloqueado',
            data: {
                id: casa.id,
                calle: casa.calle,
                numero: casa.numero,
                permisosAcceso: {
                    pluma: permisos.pluma,
                    porton1: permisos.porton1,
                    porton2: permisos.porton2,
                    porton3: permisos.porton3
                }
            }
        });
    } catch (error) {
        console.error('Error al actualizar accesos de vivienda:', error);
        return res.status(500).json({
            ok: false,
            message: 'No fue posible actualizar los accesos de la vivienda'
        });
    }
};

module.exports = { obtenerCasas, actualizarAccesosCasa };
