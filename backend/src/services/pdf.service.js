const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

function formatearDinero(valor) {
    return Number(valor || 0).toLocaleString(
        'es-MX',
        {
            style: 'currency',
            currency: 'MXN'
        }
    );
}

function formatearFecha(fecha) {
    return new Intl.DateTimeFormat(
        'es-MX',
        {
            dateStyle: 'long'
        }
    ).format(new Date(fecha));
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
            `Recibo_${cuota.folio}.pdf`;

        const rutaArchivo = path.join(
            storagePath,
            nombreArchivo
        );

        const document = new PDFDocument({
            size: 'LETTER',
            margin: 55,
            info: {
                Title: `Recibo ${cuota.folio}`,
                Author:
                    'Administración Misión Jardines'
            }
        });

        const stream = fs.createWriteStream(
            rutaArchivo
        );

        document.pipe(stream);

        document
            .fontSize(18)
            .font('Helvetica-Bold')
            .text(
                'FRACCIONAMIENTO MISIÓN JARDINES',
                {
                    align: 'center'
                }
            );

        document
            .moveDown(0.3)
            .fontSize(13)
            .font('Helvetica')
            .text(
                'Recibo de pago de mantenimiento',
                {
                    align: 'center'
                }
            );

        document.moveDown(1.5);

        document
            .fontSize(11)
            .font('Helvetica-Bold')
            .text(`Folio: ${cuota.folio}`);

        document
            .font('Helvetica')
            .text(
                `Fecha de emisión: ${formatearFecha(
                    cuota.fechaConfirmacion ||
                    cuota.fechaPago ||
                    new Date()
                )}`
            );

        document.moveDown();

        document
            .font('Helvetica-Bold')
            .text('Recibido de:');

        document
            .font('Helvetica')
            .text(
                cuota.nombrePagador ||
                cuota.casa?.usuarios?.[0]?.nombre ||
                'Residente'
            );

        document
            .text(
                `Calle: ${cuota.calleSnapshot ||
                cuota.casa?.calle ||
                ''
                }`
            )
            .text(
                `Casa: ${cuota.numeroCasaSnapshot ||
                cuota.casa?.numeroCasa ||
                ''
                }`
            );

        document.moveDown();

        document
            .font('Helvetica-Bold')
            .text('Concepto del pago:');

        document
            .font('Helvetica')
            .text(
                `Pago de mantenimiento correspondiente a ${cuota.mes} de ${cuota.anio}.`
            );

        document.moveDown();

        document
            .font('Helvetica-Bold')
            .text('Detalle del pago');

        document
            .font('Helvetica')
            .text(
                `Monto pagado: ${formatearDinero(
                    cuota.montoPagado
                )}`
            )
            .text(
                `Forma de pago: ${cuota.formaPago || 'NO ESPECIFICADA'
                }`
            )
            .text(
                `Referencia: ${cuota.referencia || 'Sin referencia'
                }`
            );

        if (cuota.tipoPago) {
            document.text(
                `Tipo de pago: ${cuota.tipoPago}`
            );
        }

        document.moveDown(1.5);

        document
            .fontSize(9)
            .text(
                'El presente comprobante se expide exclusivamente para fines administrativos internos del Fraccionamiento Misión Jardines. No constituye un comprobante fiscal ni sustituye un CFDI, ni implica la liberación de adeudos anteriores o pendientes.',
                {
                    align: 'justify'
                }
            );

        document.moveDown(2);

        document
            .fontSize(11)
            .font('Helvetica-Bold')
            .text('PAGADO', {
                align: 'center'
            });

        document
            .moveDown()
            .font('Helvetica')
            .text(
                'Administración\nFraccionamiento Misión Jardines',
                {
                    align: 'center'
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