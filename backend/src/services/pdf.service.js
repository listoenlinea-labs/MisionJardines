const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function formatearDinero(valor) {
    return Number(valor || 0).toLocaleString(
        'es-MX',
        {
            style: 'currency',
            currency: 'MXN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }
    );
}

function formatearFecha(fecha) {
    return new Intl.DateTimeFormat(
        'es-MX',
        {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'America/Mexico_City'
        }
    ).format(new Date(fecha));
}

function resolverRutaLogo() {
    const candidatos = [
        process.env.RECEIPT_LOGO_PATH,
        path.resolve(
            __dirname,
            '../../../docs/assets/images/logo-mision-jardines.png'
        ),
        path.resolve(
            process.cwd(),
            'docs',
            'assets',
            'images',
            'logo-mision-jardines.png'
        ),
        path.resolve(
            process.cwd(),
            '..',
            'docs',
            'assets',
            'images',
            'logo-mision-jardines.png'
        )
    ].filter(Boolean);

    return candidatos.find(
        candidato => fs.existsSync(candidato)
    ) || null;
}

function escribirCampo(
    document,
    etiqueta,
    valor,
    x,
    y,
    width = 540
) {
    document
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#111111')
        .text(
            etiqueta + ':',
            x,
            y,
            {
                continued: true,
                width
            }
        )
        .font('Helvetica')
        .text(' ' + (valor || ''));
}

function dibujarLinea(
    document,
    y
) {
    document
        .save()
        .lineWidth(0.7)
        .strokeColor('#909090')
        .moveTo(32, y)
        .lineTo(580, y)
        .stroke()
        .restore();
}

function generarReciboPdf(cuota) {
    return new Promise((resolve, reject) => {
        const storagePath = path.resolve(
            process.cwd(),
            'storage',
            'recibos'
        );

        fs.mkdirSync(storagePath, {
            recursive: true
        });

        const nombreArchivo =
            'Recibo_' + cuota.folio + '.pdf';

        const rutaArchivo = path.join(
            storagePath,
            nombreArchivo
        );

        const document = new PDFDocument({
            size: 'LETTER',
            margins: {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0
            },
            info: {
                Title: 'Recibo ' + cuota.folio,
                Author:
                    'Administración Misión Jardines',
                Subject:
                    'Recibo de pago de mantenimiento'
            }
        });

        const stream = fs.createWriteStream(
            rutaArchivo
        );

        document.pipe(stream);

        document
            .rect(11, 15, 590, 762)
            .lineWidth(0.6)
            .strokeColor('#B9B9B9')
            .stroke();

        document
            .rect(24, 70, 564, 707)
            .lineWidth(1)
            .strokeColor('#222222')
            .stroke();

        const logoPath = resolverRutaLogo();

        if (logoPath) {
            document.image(
                logoPath,
                36,
                20,
                {
                    cover: [
                        130,
                        44
                    ],
                    align: 'center',
                    valign: 'center'
                }
            );
        } else {
            document
                .roundedRect(
                    36,
                    20,
                    130,
                    44,
                    3
                )
                .fill('#0B4A24')
                .font('Helvetica-Bold')
                .fontSize(13)
                .fillColor('#FFFFFF')
                .text(
                    'Misión Jardines',
                    43,
                    35,
                    {
                        width: 116,
                        align: 'center'
                    }
                );
        }

        document
            .font('Helvetica-Bold')
            .fontSize(14)
            .fillColor('#111111')
            .text(
                'FRACCIONAMIENTO MISIÓN JARDINES',
                170,
                90,
                {
                    width: 385,
                    align: 'center'
                }
            );

        document
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(
                'Recibo de pago de mantenimiento',
                170,
                119,
                {
                    width: 385,
                    align: 'center'
                }
            );

        dibujarLinea(
            document,
            142
        );

        escribirCampo(
            document,
            'Folio',
            cuota.folio,
            32,
            163
        );

        escribirCampo(
            document,
            'Fecha de emisión',
            formatearFecha(
                cuota.fechaConfirmacion ||
                cuota.fechaPago ||
                new Date()
            ),
            32,
            179
        );

        dibujarLinea(
            document,
            199
        );

        document
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(
                'Recibido de:',
                32,
                219
            );

        escribirCampo(
            document,
            'Nombre',
            cuota.nombrePagador ||
            cuota.casa?.usuarios?.[0]?.nombre ||
            cuota.casa?.condominos?.[0]?.nombreCompleto ||
            'Residente',
            32,
            235
        );

        escribirCampo(
            document,
            'Calle',
            cuota.calleSnapshot ||
            cuota.casa?.calle ||
            '',
            32,
            251
        );

        escribirCampo(
            document,
            'Número',
            cuota.numeroCasaSnapshot ||
            cuota.casa?.numero ||
            '',
            32,
            267
        );

        dibujarLinea(
            document,
            297
        );

        document
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(
                'Concepto del pago:',
                32,
                317
            );

        document
            .font('Helvetica')
            .fontSize(10)
            .text(
                'Pago de mantenimiento correspondiente al mes de ',
                32,
                334,
                {
                    continued: true
                }
            )
            .font('Helvetica-Bold')
            .text(
                String(
                    cuota.mes || ''
                ).toUpperCase()
            );

        dibujarLinea(
            document,
            366
        );

        document
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(
                'Detalle del pago',
                32,
                387,
                {
                    width: 548,
                    align: 'center'
                }
            );

        document
            .font('Helvetica-Bold')
            .text(
                'Concepto',
                47,
                419
            )
            .text(
                'Monto',
                154,
                419
            );

        document
            .font('Helvetica')
            .text(
                'Mantenimiento',
                32,
                446
            )
            .text(
                formatearDinero(
                    cuota.montoPagado
                ) + ' MXN',
                122,
                446
            );

        dibujarLinea(
            document,
            471
        );

        escribirCampo(
            document,
            'Forma de pago',
            cuota.formaPago ||
            'No especificada',
            32,
            490
        );

        escribirCampo(
            document,
            'Referencia',
            cuota.referencia ||
            'Sin referencia',
            32,
            507
        );

        dibujarLinea(
            document,
            539
        );

        document
            .font('Helvetica')
            .fontSize(9)
            .text(
                'El presente comprobante de pago se expide exclusivamente para fines administrativos internos del Fraccionamiento Misión Jardines, de conformidad con el Código Civil del Estado de Jalisco. No constituye un comprobante fiscal ni sustituye a un Comprobante Fiscal Digital por Internet (CFDI), ni implica la liberación de adeudos anteriores o pendientes.',
                29,
                559,
                {
                    width: 554,
                    align: 'justify',
                    lineGap: 2
                }
            );

        dibujarLinea(
            document,
            638
        );

        document
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(
                'Atentamente:',
                32,
                658,
                {
                    width: 548,
                    align: 'center'
                }
            );

        document
            .font('Helvetica')
            .fontSize(10)
            .text(
                'Administración',
                32,
                685,
                {
                    width: 548,
                    align: 'center'
                }
            )
            .text(
                'Fraccionamiento Misión Jardines',
                32,
                701,
                {
                    width: 548,
                    align: 'center'
                }
            );

        dibujarLinea(
            document,
            710
        );

        document
            .font('Helvetica-Bold')
            .fontSize(10)
            .text(
                'Sello:',
                32,
                727,
                {
                    width: 548,
                    align: 'center'
                }
            );

        document
            .font('Helvetica-BoldOblique')
            .fontSize(13)
            .text(
                'PAGADO',
                32,
                750,
                {
                    width: 548,
                    align: 'center',
                    underline: true
                }
            );

        document.end();

        stream.on('finish', () => {
            resolve({
                rutaArchivo,
                nombreArchivo
            });
        });

        stream.on('error', reject);
        document.on('error', reject);
    });
}

module.exports = {
    generarReciboPdf
};
