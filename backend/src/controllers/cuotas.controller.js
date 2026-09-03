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

function prepararCambiosCuota(cuota, datos = {}) {
    const camposPermitidos = [
        'anio', 'mes', 'montoCuota', 'montoPagado', 'formaPago',
        'referencia', 'fechaPago', 'estatusPago', 'correoDestino',
        'nombrePagador', 'observaciones', 'controles', 'tipoPago'
    ];
    const cambios = {};

    for (const campo of camposPermitidos) {
        if (Object.prototype.hasOwnProperty.call(datos, campo)) {
            cambios[campo] = datos[campo];
        }
    }

    if (!Object.keys(cambios).length) {
        const error = new Error('No se enviaron campos para actualizar');
        error.status = 400;
        throw error;
    }

    if (Object.prototype.hasOwnProperty.call(cambios, 'anio')) {
        cambios.anio = Number(cambios.anio);
        if (!Number.isInteger(cambios.anio) || cambios.anio < 2000 || cambios.anio > 2100) {
            const error = new Error('El año debe ser un número entre 2000 y 2100');
            error.status = 400;
            throw error;
        }
    }

    if (Object.prototype.hasOwnProperty.call(cambios, 'mes')) {
        cambios.mes = String(cambios.mes || '').trim().toUpperCase();
        if (!MESES.includes(cambios.mes)) {
            const error = new Error('El mes seleccionado no es válido');
            error.status = 400;
            throw error;
        }
    }

    for (const campo of ['montoCuota', 'montoPagado']) {
        if (Object.prototype.hasOwnProperty.call(cambios, campo)) {
            cambios[campo] = Number(cambios[campo]);
            if (!Number.isFinite(cambios[campo]) || cambios[campo] < 0) {
                const error = new Error('Los montos deben ser números mayores o iguales a cero');
                error.status = 400;
                throw error;
            }
        }
    }

    if (Object.prototype.hasOwnProperty.call(cambios, 'formaPago')) {
        const formas = ['EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'TARJETA', 'CHEQUE', 'OTRO'];
        if (cambios.formaPago !== null && !formas.includes(cambios.formaPago)) {
            const error = new Error('La forma de pago no es válida');
            error.status = 400;
            throw error;
        }
    }

    if (Object.prototype.hasOwnProperty.call(cambios, 'fechaPago')) {
        if (cambios.fechaPago === null || cambios.fechaPago === '') {
            cambios.fechaPago = null;
        } else {
            const fecha = new Date(`${cambios.fechaPago}T12:00:00`);
            if (Number.isNaN(fecha.getTime())) {
                const error = new Error('La fecha de pago no es válida');
                error.status = 400;
                throw error;
            }
            cambios.fechaPago = fecha;
        }
    }

    if (Object.prototype.hasOwnProperty.call(cambios, 'estatusPago')) {
        const estatus = ['PENDIENTE', 'PAGO_PARCIAL', 'CANCELADO', 'CONDONADO'];
        if (!estatus.includes(cambios.estatusPago)) {
            const error = new Error('El estatus no puede asignarse directamente');
            error.status = 400;
            throw error;
        }
    }

    if ('montoCuota' in cambios || 'montoPagado' in cambios) {
        cambios.saldoPendiente = Math.max(
            Number(cambios.montoCuota ?? cuota.montoCuota) -
            Number(cambios.montoPagado ?? cuota.montoPagado),
            0
        );
    }

    return cambios;
}

async function actualizarCuotasLote(req, res) {
    const operaciones = Array.isArray(req.body?.operaciones) ? req.body.operaciones : [];
    if (!operaciones.length || operaciones.length > 500) {
        return res.status(400).json({
            ok: false,
            message: 'Envía entre 1 y 500 cuotas para guardar'
        });
    }

    const ids = operaciones.map(item => Number(item.id));
    if (ids.some(id => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
        return res.status(400).json({ ok: false, message: 'La lista contiene identificadores inválidos o repetidos' });
    }

    const transaction = await sequelize.transaction();
    try {
        const cuotas = await Cuota.findAll({
            where: { id: { [Op.in]: ids } },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        const porId = new Map(cuotas.map(cuota => [Number(cuota.id), cuota]));
        if (porId.size !== ids.length) {
            const error = new Error('Una o más cuotas ya no existen');
            error.status = 404;
            throw error;
        }

        for (const operacion of operaciones) {
            const cuota = porId.get(Number(operacion.id));
            if (operacion.version && cuota.actualizadoEn) {
                const esperada = new Date(operacion.version).getTime();
                const actual = new Date(cuota.actualizadoEn).getTime();
                if (Number.isFinite(esperada) && Number.isFinite(actual) && esperada !== actual) {
                    const error = new Error(`La cuota ${cuota.id} fue modificada por otra persona. Recarga antes de guardar.`);
                    error.status = 409;
                    throw error;
                }
            }
            await cuota.update(prepararCambiosCuota(cuota, operacion.cambios), { transaction });
        }

        await transaction.commit();
        return res.json({ ok: true, message: `${operaciones.length} cuota(s) guardada(s)`, total: operaciones.length });
    } catch (error) {
        await transaction.rollback();
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ ok: false, message: 'Una casa ya tiene una cuota para ese periodo' });
        }
        console.error('Error al actualizar cuotas en lote:', error);
        return res.status(error.status || 500).json({
            ok: false,
            message: error.status ? error.message : 'No fue posible guardar las cuotas'
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

        let resultadoCorreo = {
            enviado: false,
            motivo: 'No se intentó enviar el correo'
        };
        let reciboGenerado = false;

        try {
            if (cuotaConfirmada.correoEnviado) {
                const pdf = await prepararRecibo(
                    cuotaConfirmada
                );
                reciboGenerado = true;
                resultadoCorreo = {
                    enviado: true,
                    motivo:
                        'El recibo ya había sido enviado',
                    reciboUrl: pdf.reciboUrl
                };
            } else {
                resultadoCorreo =
                    await enviarReciboCuota(
                        cuotaConfirmada,
                        cuotaConfirmada.correoDestino
                    );
                reciboGenerado = Boolean(
                    resultadoCorreo.reciboUrl
                );
            }
        } catch (reciboError) {
            console.error(
                'El pago se confirmó, pero el recibo quedó pendiente:',
                reciboError
            );

            resultadoCorreo = {
                enviado: false,
                motivo:
                    reciboError.message ||
                    'No fue posible generar o enviar el recibo'
            };
        }

        return res.json({
            ok: true,
            message:
                resultadoCorreo.enviado
                    ? 'Pago confirmado, recibo generado y correo enviado'
                    : reciboGenerado
                        ? 'Pago confirmado y recibo generado; el correo quedó pendiente'
                        : 'Pago confirmado; el recibo quedó pendiente y puede reintentarse',
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

function construirUrlRecibo(nombreArchivo) {
    const appBaseUrl = String(
        process.env.APP_BASE_URL || ''
    ).replace(/\/$/, '');

    if (!appBaseUrl) {
        const error = new Error(
            'Falta la variable APP_BASE_URL para publicar los recibos'
        );
        error.status = 500;
        throw error;
    }

    return `${appBaseUrl}/recibos/${encodeURIComponent(
        nombreArchivo
    )}`;
}

async function prepararRecibo(cuota) {
    if (
        !cuota ||
        cuota.estatusPago !== 'PAGADO'
    ) {
        const error = new Error(
            'La cuota todavía no está pagada'
        );
        error.status = 409;
        throw error;
    }

    if (!cuota.folio) {
        const transaction =
            await sequelize.transaction();

        try {
            const cuotaBloqueada =
                await Cuota.findByPk(
                    cuota.id,
                    {
                        transaction,
                        lock:
                            transaction.LOCK.UPDATE
                    }
                );

            if (!cuotaBloqueada) {
                const error = new Error(
                    'La cuota ya no existe'
                );
                error.status = 404;
                throw error;
            }

            if (!cuotaBloqueada.folio) {
                const folio =
                    await generarSiguienteFolio(
                        cuotaBloqueada.anio,
                        transaction
                    );

                await cuotaBloqueada.update(
                    {
                        folio,
                        fechaConfirmacion:
                            cuotaBloqueada.fechaConfirmacion ||
                            cuotaBloqueada.fechaPago ||
                            new Date()
                    },
                    {
                        transaction
                    }
                );
            }

            await transaction.commit();
            cuota.set({
                folio:
                    cuotaBloqueada.folio,
                fechaConfirmacion:
                    cuotaBloqueada.fechaConfirmacion
            });
        } catch (error) {
            if (!transaction.finished) {
                await transaction.rollback();
            }
            throw error;
        }
    }

    /*
     * Se regenera usando el mismo folio. Esto recupera automáticamente
     * archivos eliminados y mantiene el formato vigente del recibo.
     */
    const pdf = await generarReciboPdf(cuota);
    const reciboUrl = construirUrlRecibo(
        pdf.nombreArchivo
    );

    if (cuota.reciboPdfUrl !== reciboUrl) {
        await cuota.update({
            reciboPdfUrl: reciboUrl
        });
    }

    return {
        ...pdf,
        reciboUrl
    };
}

async function enviarReciboCuota(
    cuota,
    correoSolicitado
) {
    const usuarioContacto =
        cuota.casa?.usuarios?.find(
            usuario =>
                usuario.esContactoPrincipal &&
                usuario.recibeCorreosPago
        ) ||
        cuota.casa?.usuarios?.find(
            usuario => usuario.recibeCorreosPago
        ) ||
        cuota.casa?.usuarios?.find(
            usuario => usuario.esContactoPrincipal
        ) ||
        cuota.casa?.usuarios?.[0];

    const condominoContacto =
        cuota.casa?.condominos?.find(
            condomino => condomino.correo
        );

    const correoDestino = String(
        correoSolicitado ||
        cuota.correoDestino ||
        usuarioContacto?.correo ||
        condominoContacto?.correo ||
        cuota.casa?.correo ||
        ''
    ).trim();

    const pdf = await prepararRecibo(cuota);

    if (!correoDestino) {
        return {
            enviado: false,
            motivo:
                'La vivienda no tiene correo registrado',
            reciboUrl: pdf.reciboUrl
        };
    }
    const resultado = await enviarReciboPorCorreo({
        destinatario: correoDestino,
        cuota,
        rutaArchivo: pdf.rutaArchivo,
        reciboUrl: pdf.reciboUrl
    });

    if (resultado.enviado) {
        await cuota.update({
            correoDestino,
            reciboPdfUrl: pdf.reciboUrl,
            correoEnviado: true,
            fechaEnvioCorreo: new Date()
        });
    }

    return {
        ...resultado,
        reciboUrl: pdf.reciboUrl,
        correoDestino
    };
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
            cuota.estatusPago !== 'PAGADO'
        ) {
            return res.status(409).json({
                ok: false,
                message:
                    'La cuota todavía no tiene un recibo válido'
            });
        }

        const correoDestino =
            req.body.correoDestino ||
            cuota.correoDestino;

        const resultado = await enviarReciboCuota(
            cuota,
            correoDestino
        );

        return res.json({
            ok: true,
            message:
                resultado.enviado
                    ? 'Recibo enviado correctamente'
                    : resultado.motivo,
            correo: resultado,
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

async function enviarRecibosLote(req, res) {
    const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.map(Number)
        : [];

    if (
        !ids.length ||
        ids.length > 500 ||
        ids.some(
            id =>
                !Number.isInteger(id) ||
                id <= 0
        ) ||
        new Set(ids).size !== ids.length
    ) {
        return res.status(400).json({
            ok: false,
            message:
                'Selecciona entre 1 y 500 cuotas pagadas sin repetir'
        });
    }

    try {
        const cuotas = await Cuota.findAll({
            where: {
                id: {
                    [Op.in]: ids
                },
                estatusPago: 'PAGADO'
            },
            include: obtenerInclude(),
            order: [
                ['calleSnapshot', 'ASC'],
                ['numeroCasaSnapshot', 'ASC']
            ]
        });

        const cuotasPorId = new Map(
            cuotas.map(
                cuota => [
                    Number(cuota.id),
                    cuota
                ]
            )
        );
        const resultados = [];

        /*
         * Envío secuencial intencional: evita que el proveedor SMTP
         * bloquee una ráfaga grande y permite reportar cada resultado.
         */
        for (const id of ids) {
            const cuota = cuotasPorId.get(id);

            if (!cuota) {
                resultados.push({
                    id,
                    enviado: false,
                    motivo:
                        'La cuota no existe o no está pagada'
                });
                continue;
            }

            try {
                const resultado =
                    await enviarReciboCuota(
                        cuota,
                        cuota.correoDestino
                    );

                resultados.push({
                    id,
                    folio: cuota.folio,
                    casa:
                        cuota.numeroCasaSnapshot ||
                        cuota.casa?.numero ||
                        '',
                    correo:
                        resultado.correoDestino ||
                        cuota.correoDestino ||
                        null,
                    enviado:
                        resultado.enviado,
                    motivo:
                        resultado.motivo ||
                        null
                });
            } catch (error) {
                console.error(
                    `Error al enviar recibo de cuota ${id}:`,
                    error
                );

                resultados.push({
                    id,
                    folio: cuota.folio,
                    enviado: false,
                    motivo:
                        error.message ||
                        'No fue posible enviar el recibo'
                });
            }
        }

        const enviados = resultados.filter(
            resultado => resultado.enviado
        ).length;
        const fallidos =
            resultados.length - enviados;

        return res.json({
            ok: true,
            message:
                `Proceso terminado: ${enviados} enviado(s) y ${fallidos} pendiente(s)`,
            resumen: {
                solicitados: ids.length,
                enviados,
                fallidos
            },
            resultados
        });
    } catch (error) {
        console.error(
            'Error al enviar recibos en lote:',
            error
        );

        return res.status(500).json({
            ok: false,
            message:
                'No fue posible procesar el envío masivo de recibos',
            error:
                process.env.NODE_ENV ===
                    'development'
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
    actualizarCuotasLote,
    confirmarPago,
    reenviarRecibo,
    enviarRecibosLote,
    eliminarCuota
};
