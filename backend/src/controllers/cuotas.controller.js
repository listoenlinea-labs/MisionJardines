const path = require('path');
const { Op } = require('sequelize');

const sequelize = require('../config/database');

const {
    Cuota,
    Casa,
    Usuario,
    Condomino
} = require('../models');

const {
    generarSiguienteFolio
} = require('../services/folios.service');

const {
    generarReciboPdf
} = require('../services/pdf.service');

const {
    enviarReciboPorCorreo
} = require('../services/email.service');

const MESES = [
    'ENERO',
    'FEBRERO',
    'MARZO',
    'ABRIL',
    'MAYO',
    'JUNIO',
    'JULIO',
    'AGOSTO',
    'SEPTIEMBRE',
    'OCTUBRE',
    'NOVIEMBRE',
    'DICIEMBRE'
];

const ROLES_ADMINISTRATIVOS = [
    'SUPER_ADMIN',
    'ADMINISTRADOR',
    'MESA_DIRECTIVA'
];

function esAdministrador(req) {
    return ROLES_ADMINISTRATIVOS.includes(
        req.usuario.rol
    );
}

function obtenerInclude() {
    return [
        {
            model: Casa,
            as: 'casa',
            attributes: [
                'id',
                'numero',
                'calle',
                'nombre',
                'correo',
                'telefono',
                'pago',
                'enRenta',
                'controles'
            ],
            include: [
                {
                    model: Usuario,
                    as: 'usuarios',
                    required: false,
                    where: {
                        estatus: 'ACTIVO'
                    },
                    attributes: [
                        'id',
                        'nombre',
                        'apellidoPaterno',
                        'apellidoMaterno',
                        'correo',
                        'telefono',
                        'esContactoPrincipal',
                        'recibeCorreosPago'
                    ]
                },
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
            ]
        },
        {
            model: Usuario,
            as: 'confirmadoPor',
            required: false,
            attributes: [
                'id',
                'nombre',
                'apellidoPaterno'
            ]
        }
    ];
}

async function listarCuotas(req, res) {
    try {
        const anio = Number(
            req.query.anio ||
            new Date().getFullYear()
        );

        const mes = String(
            req.query.mes || ''
        ).trim().toUpperCase();

        const estatus = String(
            req.query.estatus || ''
        ).trim().toUpperCase();

        const where = {
            anio
        };

        if (mes && MESES.includes(mes)) {
            where.mes = mes;
        }

        if (estatus) {
            where.estatusPago = estatus;
        }

        if (!esAdministrador(req)) {
            where.casaId = req.usuario.casaId;
        }

        const cuotas = await Cuota.findAll({
            where,
            include: obtenerInclude(),
            order: [
                [
                    {
                        model: Casa,
                        as: 'casa'
                    },
                    'calle',
                    'ASC'
                ],
                [
                    {
                        model: Casa,
                        as: 'casa'
                    },
                    'numero',
                    'ASC'
                ]
            ]
        });

        return res.json({
            ok: true,
            total: cuotas.length,
            data: cuotas
        });
    } catch (error) {
        console.error(
            'Error al listar cuotas:',
            error
        );

        return res.status(500).json({
            ok: false,
            message:
                'No fue posible consultar las cuotas',
            error:
                process.env.NODE_ENV === 'development'
                    ? error.message
                    : undefined
        });
    }
}

async function crearCuota(req, res) {
    try {
        const {
            casaId,
            anio,
            mes,
            montoCuota,
            observaciones
        } = req.body;

        const mesNormalizado =
            String(mes || '').trim().toUpperCase();

        if (
            !casaId ||
            !anio ||
            !MESES.includes(mesNormalizado)
        ) {
            return res.status(400).json({
                ok: false,
                message:
                    'Casa, año y mes son obligatorios'
            });
        }

        const casa = await Casa.findByPk(casaId, {
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
                        'correo'
                    ]
                }
            ]
        });

        if (!casa) {
            return res.status(404).json({
                ok: false,
                message: 'Casa no encontrada'
            });
        }

        const condominoContacto =
            casa.condominos?.find(
                condomino => condomino.correo
            ) || casa.condominos?.[0];

        const cuota = await Cuota.create({
            casaId,
            anio: Number(anio),
            mes: mesNormalizado,
            montoCuota: Number(montoCuota || 0),
            montoPagado: 0,
            saldoPendiente:
                Number(montoCuota || 0),
            estatusPago: 'PENDIENTE',
            nombrePagador: null,
            numeroCasaSnapshot:
                casa.numero,
            calleSnapshot:
                casa.calle,
            correoDestino:
                condominoContacto?.correo ||
                casa.correo ||
                null,
            observaciones:
                observaciones || null
        });

        return res.status(201).json({
            ok: true,
            message: 'Cuota creada',
            data: cuota
        });
    } catch (error) {
        if (
            error.name ===
            'SequelizeUniqueConstraintError'
        ) {
            return res.status(409).json({
                ok: false,
                message:
                    'La casa ya tiene una cuota registrada para ese periodo'
            });
        }

        console.error(
            'Error al crear cuota:',
            error
        );

        return res.status(500).json({
            ok: false,
            message:
                'No fue posible crear la cuota',
            error:
                process.env.NODE_ENV === 'development'
                    ? error.message
                    : undefined
        });
    }
}

async function actualizarCuota(req, res) {
    try {
        const cuota = await Cuota.findByPk(
            req.params.id
        );

        if (!cuota) {
            return res.status(404).json({
                ok: false,
                message: 'Cuota no encontrada'
            });
        }



        const camposPermitidos = [
            'anio',
            'mes',
            'montoCuota',
            'montoPagado',
            'formaPago',
            'referencia',
            'fechaPago',
            'estatusPago',
            'correoDestino',
            'nombrePagador',
            'observaciones',
            'controles',
            'tipoPago'
        ];

        const cambios = {};

        for (const campo of camposPermitidos) {
            if (
                Object.prototype.hasOwnProperty.call(
                    req.body,
                    campo
                )
            ) {
                cambios[campo] = req.body[campo];
            }
        }

        if (
            Object.prototype.hasOwnProperty.call(
                cambios,
                'anio'
            )
        ) {
            const anio = Number(cambios.anio);

            if (
                !Number.isInteger(anio) ||
                anio < 2000 ||
                anio > 2100
            ) {
                return res.status(400).json({
                    ok: false,
                    message:
                        'El año debe ser un número entre 2000 y 2100'
                });
            }

            cambios.anio = anio;
        }

        if (
            Object.prototype.hasOwnProperty.call(
                cambios,
                'mes'
            )
        ) {
            const mesNormalizado =
                String(cambios.mes || '')
                    .trim()
                    .toUpperCase();

            if (!MESES.includes(mesNormalizado)) {
                return res.status(400).json({
                    ok: false,
                    message:
                        'El mes seleccionado no es válido'
                });
            }

            cambios.mes = mesNormalizado;
        }

        if (
            Object.prototype.hasOwnProperty.call(
                cambios,
                'montoPagado'
            )
        ) {
            const montoPagado =
                Number(cambios.montoPagado);

            if (
                !Number.isFinite(montoPagado) ||
                montoPagado < 0
            ) {
                return res.status(400).json({
                    ok: false,
                    message:
                        'El monto debe ser un número mayor o igual a cero'
                });
            }

            cambios.montoPagado = montoPagado;
        }

        if (
            Object.prototype.hasOwnProperty.call(
                cambios,
                'formaPago'
            )
        ) {
            const formasPermitidas = [
                'EFECTIVO',
                'TRANSFERENCIA',
                'DEPOSITO',
                'TARJETA',
                'CHEQUE',
                'OTRO'
            ];

            if (
                cambios.formaPago !== null &&
                !formasPermitidas.includes(
                    cambios.formaPago
                )
            ) {
                return res.status(400).json({
                    ok: false,
                    message:
                        'La forma de pago no es válida'
                });
            }
        }

        if (
            Object.prototype.hasOwnProperty.call(
                cambios,
                'fechaPago'
            )
        ) {
            if (
                cambios.fechaPago === null ||
                cambios.fechaPago === ''
            ) {
                cambios.fechaPago = null;
            } else {
                const fechaPago =
                    new Date(
                        `${cambios.fechaPago}T12:00:00`
                    );

                if (
                    Number.isNaN(
                        fechaPago.getTime()
                    )
                ) {
                    return res.status(400).json({
                        ok: false,
                        message:
                            'La fecha de pago no es válida'
                    });
                }

                cambios.fechaPago = fechaPago;
            }
        }

        if (
            Object.prototype.hasOwnProperty.call(
                cambios,
                'estatusPago'
            )
        ) {
            const estatusPermitidos = [
                'PENDIENTE',
                'PAGO_PARCIAL',
                'CANCELADO',
                'CONDONADO'
            ];

            if (
                !estatusPermitidos.includes(
                    cambios.estatusPago
                )
            ) {
                return res.status(400).json({
                    ok: false,
                    message:
                        'El estatus no puede asignarse directamente'
                });
            }
        }

        if (
            Object.prototype.hasOwnProperty.call(
                cambios,
                'montoCuota'
            ) ||
            Object.prototype.hasOwnProperty.call(
                cambios,
                'montoPagado'
            )
        ) {
            const montoCuota = Number(
                cambios.montoCuota ??
                cuota.montoCuota
            );

            const montoPagado = Number(
                cambios.montoPagado ??
                cuota.montoPagado
            );

            cambios.saldoPendiente = Math.max(
                montoCuota - montoPagado,
                0
            );
        }

        await cuota.update(cambios);

        return res.json({
            ok: true,
            message: 'Cuota actualizada',
            data: cuota
        });
    } catch (error) {
        if (
            error.name ===
            'SequelizeUniqueConstraintError'
        ) {
            return res.status(409).json({
                ok: false,
                message:
                    'Esta casa ya tiene una cuota registrada para ese año y mes'
            });
        }
        console.error(
            'Error al actualizar cuota:',
            error
        );

        return res.status(500).json({
            ok: false,
            message:
                'No fue posible actualizar la cuota',
            error:
                process.env.NODE_ENV === 'development'
                    ? error.message
                    : undefined
        });
    }
}

async function confirmarPago(req, res) {
    const transaction =
        await sequelize.transaction();

    try {
        const cuota = await Cuota.findByPk(
            req.params.id,
            {
                include: obtenerInclude(),
                transaction,
                lock: transaction.LOCK.UPDATE
            }
        );

        if (!cuota) {
            await transaction.rollback();

            return res.status(404).json({
                ok: false,
                message: 'Cuota no encontrada'
            });
        }

        if (cuota.estatusPago === 'PAGADO') {
            await transaction.rollback();

            return res.status(409).json({
                ok: false,
                message:
                    'La cuota ya se encuentra pagada',
                data: cuota
            });
        }

        const montoPagado = Number(
            req.body.montoPagado ??
            cuota.montoCuota
        );

        if (
            !Number.isFinite(montoPagado) ||
            montoPagado <= 0
        ) {
            await transaction.rollback();

            return res.status(400).json({
                ok: false,
                message:
                    'El monto pagado debe ser mayor que cero'
            });
        }

        const montoCuota = Number(
            cuota.montoCuota
        );

        const estatusPago =
            montoPagado >= montoCuota
                ? 'PAGADO'
                : 'PAGO_PARCIAL';

        let folio = cuota.folio;

        if (
            estatusPago === 'PAGADO' &&
            !folio
        ) {
            folio = await generarSiguienteFolio(
                cuota.anio,
                transaction
            );
        }

        const contactoPrincipal =
            cuota.casa?.usuarios?.find(
                usuario =>
                    usuario.esContactoPrincipal &&
                    usuario.recibeCorreosPago
            ) ||
            cuota.casa?.usuarios?.find(
                usuario =>
                    usuario.recibeCorreosPago
            );

        const condominoContacto =
            cuota.casa?.condominos?.find(
                condomino => condomino.correo
            ) ||
            cuota.casa?.condominos?.[0];

        const correoDestino =
            req.body.correoDestino ||
            cuota.correoDestino ||
            contactoPrincipal?.correo ||
            condominoContacto?.correo ||
            cuota.casa?.correo ||
            null;

        await cuota.update(
            {
                montoPagado,
                saldoPendiente: Math.max(
                    montoCuota - montoPagado,
                    0
                ),
                formaPago:
                    req.body.formaPago ||
                    cuota.formaPago ||
                    'EFECTIVO',
                referencia:
                    req.body.referencia ||
                    cuota.referencia ||
                    null,
                fechaPago:
                    req.body.fechaPago
                        ? new Date(
                            req.body.fechaPago
                        )
                        : new Date(),
                estatusPago,
                folio,
                correoDestino,
                nombrePagador:
                    req.body.nombrePagador ||
                    cuota.nombrePagador ||
                    (
                        contactoPrincipal
                            ? [
                                contactoPrincipal.nombre,
                                contactoPrincipal.apellidoPaterno,
                                contactoPrincipal.apellidoMaterno
                            ]
                                .filter(Boolean)
                                .join(' ')
                            : condominoContacto?.nombreCompleto ||
                              cuota.casa?.nombre ||
                              null
                    ),
                confirmadoPorUsuarioId:
                    req.usuario.usuarioId,
                fechaConfirmacion:
                    new Date()
            },
            {
                transaction
            }
        );

        await transaction.commit();

        const cuotaConfirmada =
            await Cuota.findByPk(
                cuota.id,
                {
                    include: obtenerInclude()
                }
            );

        if (
            cuotaConfirmada.estatusPago ===
            'PAGO_PARCIAL'
        ) {
            return res.json({
                ok: true,
                message:
                    'Pago parcial registrado',
                data: cuotaConfirmada
            });
        }

        const pdf = await generarReciboPdf(
            cuotaConfirmada
        );

        const reciboUrl =
            `${process.env.APP_BASE_URL}/recibos/${encodeURIComponent(
                pdf.nombreArchivo
            )}`;

        await cuotaConfirmada.update({
            reciboPdfUrl: reciboUrl
        });

        let resultadoCorreo = {
            enviado: false,
            motivo: 'No se intentó enviar el correo'
        };

        if (!cuotaConfirmada.correoDestino) {
            resultadoCorreo = {
                enviado: false,
                motivo: 'La vivienda no tiene correo registrado'
            };
        } else if (cuotaConfirmada.correoEnviado) {
            resultadoCorreo = {
                enviado: true,
                motivo: 'El recibo ya había sido enviado'
            };
        } else {
            try {
                resultadoCorreo =
                    await enviarReciboPorCorreo({
                        destinatario:
                            cuotaConfirmada.correoDestino,
                        cuota:
                            cuotaConfirmada,
                        rutaArchivo:
                            pdf.rutaArchivo,
                        reciboUrl
                    });

                if (resultadoCorreo.enviado) {
                    await cuotaConfirmada.update({
                        correoEnviado: true,
                        fechaEnvioCorreo: new Date()
                    });
                }
            } catch (emailError) {
                console.error(
                    'El pago se confirmó, pero falló el correo:',
                    emailError
                );

                resultadoCorreo = {
                    enviado: false,
                    motivo:
                        emailError.message ||
                        'No fue posible enviar el correo'
                };
            }
        }

        return res.json({
            ok: true,
            message:
                resultadoCorreo.enviado
                    ? 'Pago confirmado, recibo generado y correo enviado'
                    : 'Pago confirmado y recibo generado, pero no se envió correo',
            correo: resultadoCorreo,
            data: cuotaConfirmada
        });
    } catch (error) {
        if (
            transaction &&
            !transaction.finished
        ) {
            await transaction.rollback();
        }

        console.error(
            'Error al confirmar pago:',
            error
        );

        return res.status(500).json({
            ok: false,
            message:
                'No fue posible confirmar el pago',
            error:
                process.env.NODE_ENV === 'development'
                    ? error.message
                    : undefined
        });
    }
}

async function reenviarRecibo(req, res) {
    try {
        const cuota = await Cuota.findByPk(
            req.params.id,
            {
                include: obtenerInclude()
            }
        );

        if (
            !cuota ||
            cuota.estatusPago !== 'PAGADO' ||
            !cuota.folio
        ) {
            return res.status(409).json({
                ok: false,
                message:
                    'La cuota todavía no tiene un recibo válido'
            });
        }

        const nombreArchivo =
            `Recibo_${cuota.folio}.pdf`;

        const rutaArchivo = path.resolve(
            process.cwd(),
            'storage',
            'recibos',
            nombreArchivo
        );

        const correoDestino =
            req.body.correoDestino ||
            cuota.correoDestino;

        const resultado =
            await enviarReciboPorCorreo({
                destinatario:
                    correoDestino,
                cuota,
                rutaArchivo,
                reciboUrl:
                    cuota.reciboPdfUrl
            });

        if (resultado.enviado) {
            await cuota.update({
                correoDestino,
                correoEnviado: true,
                fechaEnvioCorreo:
                    new Date()
            });
        }

        return res.json({
            ok: true,
            message:
                'Recibo enviado nuevamente',
            data: cuota
        });
    } catch (error) {
        console.error(
            'Error al reenviar recibo:',
            error
        );

        return res.status(500).json({
            ok: false,
            message:
                'No fue posible reenviar el recibo',
            error:
                process.env.NODE_ENV === 'development'
                    ? error.message
                    : undefined
        });
    }
}

async function eliminarCuota(
    req,
    res
) {
    try {
        const cuota =
            await Cuota.findByPk(
                req.params.id
            );

        if (!cuota) {
            return res.status(404).json({
                ok: false,
                message:
                    'Cuota no encontrada'
            });
        }

        await cuota.destroy();

        return res.json({
            ok: true,
            message:
                'Cuota eliminada correctamente'
        });
    } catch (error) {
        console.error(
            'Error al eliminar cuota:',
            error
        );

        return res.status(500).json({
            ok: false,
            message:
                'No fue posible eliminar la cuota',
            error:
                process.env.NODE_ENV ===
                    'development'
                    ? error.message
                    : undefined
        });
    }
}

module.exports = {
    listarCuotas,
    crearCuota,
    actualizarCuota,
    confirmarPago,
    reenviarRecibo,
    eliminarCuota
};
