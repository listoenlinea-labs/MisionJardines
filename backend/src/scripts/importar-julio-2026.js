const path = require('path');

/*
 * Cargar variables de entorno antes de importar
 * cualquier archivo que utilice process.env.
 */
const environment = process.env.NODE_ENV || 'development';

require('dotenv').config({
    path: path.resolve(
        process.cwd(),
        `.env.${environment}`
    )
});

const XLSX = require('xlsx');

const sequelize = require('../config/database');

const {
    Casa,
    Cuota
} = require('../models');

const ARCHIVO = path.resolve(
    process.cwd(),
    'data',
    'MENSUAL_JULIO_2026.xlsm'
);

const HOJAS_VALIDAS = [
    'Gardenias',
    'Magnolias',
    'Rosas',
    'Lirios',
    'Jardines',
    'Atotonilco',
    'Valle de Mexico',
    'Guadalajara'
];

const NORMALIZACION_CALLES = {
    Gardenias: 'Misión Gardenias',
    Magnolias: 'Misión Magnolias',
    Rosas: 'Misión Rosas',
    Lirios: 'Misión de Los Lirios',
    Jardines: 'Misión Jardines',
    Atotonilco: 'Atotonilco',
    'Valle de Mexico': 'Av. Valle de México',
    Guadalajara: 'Avenida Guadalajara'
};

function texto(valor) {
    if (
        valor === null ||
        valor === undefined
    ) {
        return '';
    }

    return String(valor).trim();
}

function numero(valor) {
    const resultado = Number(valor);

    return Number.isFinite(resultado)
        ? resultado
        : 0;
}

function fechaExcel(valor) {
    if (!valor) {
        return null;
    }

    if (valor instanceof Date) {
        return valor;
    }

    if (
        typeof valor === 'number' ||
        /^\d{5}$/.test(texto(valor))
    ) {
        const fecha = XLSX.SSF.parse_date_code(
            Number(valor)
        );

        if (!fecha) {
            return null;
        }

        return new Date(
            fecha.y,
            fecha.m - 1,
            fecha.d
        );
    }

    const fecha = new Date(valor);

    return Number.isNaN(fecha.getTime())
        ? null
        : fecha;
}

function normalizarFolio(valor) {
    const folio = texto(valor);

    if (!folio) {
        return null;
    }

    return folio.length <= 50
        ? folio
        : folio.slice(0, 50);
}

function mapearFila(
    nombreHoja,
    fila
) {
    const formatoCorto = [
        'Gardenias',
        'Magnolias',
        'Rosas',
        'Lirios'
    ].includes(nombreHoja);

    if (formatoCorto) {
        const rosasOLirios = [
            'Rosas',
            'Lirios'
        ].includes(nombreHoja);

        return {
            casaExcel: texto(fila.CASA),
            numeroCasa: texto(fila.CASA),

            calle:
                NORMALIZACION_CALLES[
                nombreHoja
                ],

            fechaPago:
                fechaExcel(fila.FECHA),

            pagada:
                numero(fila.PAGADAS) > 0,

            folio:
                normalizarFolio(
                    rosasOLirios
                        ? fila.FOLIO
                        : fila.FOLIO
                ),

            monto:
                numero(fila.MONTO),

            nombre:
                texto(fila.NOMBRE),

            confirmado:
                texto(
                    fila.CONFIRMADO
                ).toUpperCase() ===
                'CONFIRMED',

            pendiente:
                texto(
                    fila.PENDIENTE
                ).toUpperCase() ===
                'PENDING',

            controles:
                texto(fila.CONTROLES),

            tipoPago:
                texto(fila.PAGO),

            observaciones:
                texto(fila.OBSERVACIONES)
        };
    }

    return {
        casaExcel:
            texto(fila.CASA),

        numeroCasa:
            texto(fila.NUMERO) ||
            texto(fila.CASA),

        calle:
            NORMALIZACION_CALLES[
            nombreHoja
            ],

        fechaPago:
            fechaExcel(fila.FECHA),

        pagada:
            numero(fila.PAGADAS) > 0,

        folio:
            normalizarFolio(
                fila.FOLIO
            ),

        monto:
            numero(fila.MONTO),

        nombre:
            texto(fila.NOMBRE),

        confirmado:
            texto(
                fila.CONFIRMADO
            ).toUpperCase() ===
            'CONFIRMED',

        pendiente:
            texto(
                fila.PENDIENTE
            ).toUpperCase() ===
            'PENDING',

        controles:
            texto(fila.CONTROLES),

        tipoPago:
            texto(fila.PAGO),

        observaciones:
            texto(fila.OBSERVACIONES)
    };
}

async function buscarOCrearCasa(
    registro,
    transaction
) {
    const numeroCasa =
        registro.numeroCasa ||
        registro.casaExcel ||
        'SIN-NUMERO';

    let casa = await Casa.findOne({
        where: {
            calle: registro.calle,
            numero: numeroCasa
        },
        transaction
    });

    if (casa) {
        return casa;
    }

    casa = await Casa.create(
        {
            calle: registro.calle,
            numero: numeroCasa,

            nombre:
                registro.nombre ||
                null,

            controles:
                registro.controles ||
                null,

            pago:
                ['ANUAL', 'MENSUAL', 'CONVENIO', 'OTRO']
                    .includes(
                        texto(registro.tipoPago)
                            .toUpperCase()
                    )
                    ? texto(registro.tipoPago)
                        .toUpperCase()
                    : null,

            enRenta: false,

            observaciones: [
                'Registro importado desde julio 2026',

                registro.observaciones ||
                null
            ]
                .filter(Boolean)
                .join(' | ') ||
                null
        },
        {
            transaction
        }
    );

    return casa;
}

async function ejecutar() {
    const workbook =
        XLSX.readFile(ARCHIVO, {
            cellDates: true,
            raw: false
        });

    let importados = 0;
    let actualizados = 0;
    let omitidos = 0;
    let errores = 0;

    for (
        const nombreHoja
        of HOJAS_VALIDAS
    ) {
        const worksheet =
            workbook.Sheets[nombreHoja];

        if (!worksheet) {
            console.warn(
                `No existe la hoja ${nombreHoja}`
            );

            continue;
        }

        const filas =
            XLSX.utils.sheet_to_json(
                worksheet,
                {
                    defval: null,
                    range: 1
                }
            );

        for (
            const fila of filas
        ) {
            const transaction =
                await sequelize.transaction();

            try {
                if (
                    texto(fila.CALLE)
                        .toUpperCase() ===
                    'TOTAL.' ||
                    texto(fila.NUMERO)
                        .toUpperCase() ===
                    'TOTAL.'
                ) {
                    await transaction.rollback();
                    continue;
                }

                const registro =
                    mapearFila(
                        nombreHoja,
                        fila
                    );

                if (
                    !registro.numeroCasa &&
                    !registro.nombre
                ) {
                    omitidos++;
                    await transaction.rollback();
                    continue;
                }

                const casa =
                    await buscarOCrearCasa(
                        registro,
                        transaction
                    );

                const estatusPago =
                    registro.pagada ||
                        registro.confirmado ||
                        registro.monto > 0
                        ? 'PAGADO'
                        : 'PENDIENTE';

                const montoPagado =
                    estatusPago === 'PAGADO'
                        ? registro.monto
                        : 0;

                const montoCuota =
                    registro.monto > 0
                        ? registro.monto
                        : 300;

                const [
                    cuota,
                    creada
                ] = await Cuota.findOrCreate({
                    where: {
                        casaId: casa.id,
                        anio: 2026,
                        mes: 'JULIO'
                    },

                    defaults: {
                        nombrePagador:
                            registro.nombre ||
                            null,

                        numeroCasaSnapshot:
                            registro.numeroCasa,

                        calleSnapshot:
                            registro.calle,

                        montoCuota,
                        montoPagado,

                        saldoPendiente:
                            estatusPago === 'PAGADO'
                                ? 0
                                : montoCuota,

                        formaPago:
                            registro.tipoPago
                                ?.toUpperCase() ===
                                'ANUAL'
                                ? 'OTRO'
                                : null,

                        referencia: null,
                        fechaPago:
                            registro.fechaPago,

                        estatusPago,
                        folio:
                            registro.folio,

                        correoEnviado: false,
                        correoDestino:
                            casa.correo,

                        fechaConfirmacion:
                            estatusPago === 'PAGADO'
                                ? registro.fechaPago
                                : null,

                        observaciones:
                            registro.observaciones ||
                            null,

                        controles:
                            registro.controles ||
                            null,

                        tipoPago:
                            registro.tipoPago ||
                            null,

                        origenImportacion:
                            'MENSUAL_JULIO_2026.xlsm'
                    },

                    transaction
                });

                if (!creada) {
                    await cuota.update(
                        {
                            nombrePagador:
                                registro.nombre ||
                                cuota.nombrePagador,

                            numeroCasaSnapshot:
                                registro.numeroCasa,

                            calleSnapshot:
                                registro.calle,

                            montoCuota,
                            montoPagado,
                            saldoPendiente:
                                estatusPago === 'PAGADO'
                                    ? 0
                                    : montoCuota,

                            fechaPago:
                                registro.fechaPago,

                            estatusPago,

                            folio:
                                cuota.folio ||
                                registro.folio,

                            observaciones:
                                registro.observaciones ||
                                cuota.observaciones,

                            controles:
                                registro.controles ||
                                cuota.controles,

                            tipoPago:
                                registro.tipoPago ||
                                cuota.tipoPago,

                            origenImportacion:
                                'MENSUAL_JULIO_2026.xlsm'
                        },
                        {
                            transaction
                        }
                    );

                    actualizados++;
                } else {
                    importados++;
                }

                await transaction.commit();
            } catch (error) {
                errores++;

                if (!transaction.finished) {
                    await transaction.rollback();
                }

                console.error(
                    `Error en ${nombreHoja}:`,
                    fila,
                    error.message
                );
            }
        }
    }

    console.log({
        importados,
        actualizados,
        omitidos,
        errores
    });
}

sequelize
    .authenticate()
    .then(ejecutar)
    .then(async () => {
        await sequelize.close();
        process.exit(0);
    })
    .catch(async error => {
        console.error(
            'Importación cancelada:',
            error
        );

        await sequelize.close();
        process.exit(1);
    });