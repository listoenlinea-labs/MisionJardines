const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const PUBLIC_LOGO_URL =
    process.env.RECEIPT_LOGO_URL ||
    'https://listoenlinea-labs.github.io/MisionJardines/assets/images/logo-mision-jardines.png';

function money(value) {
    return Number(value || 0).toLocaleString('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function dateMX(value) {
    return new Intl.DateTimeFormat('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/Mexico_City'
    }).format(new Date(value || Date.now()));
}

function localLogoPath() {
    const candidates = [
        process.env.RECEIPT_LOGO_PATH,
        path.resolve(__dirname, '../../../docs/assets/images/logo-mision-jardines.png'),
        path.resolve(process.cwd(), 'docs', 'assets', 'images', 'logo-mision-jardines.png'),
        path.resolve(process.cwd(), '..', 'docs', 'assets', 'images', 'logo-mision-jardines.png')
    ].filter(Boolean);

    return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

async function resolveLogo() {
    const local = localLogoPath();
    if (local) return local;

    try {
        const response = await fetch(PUBLIC_LOGO_URL, {
            headers: { 'User-Agent': 'MisionJardines-Backend' },
            signal: AbortSignal.timeout(6000)
        });

        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        return buffer.length ? buffer : null;
    } catch (error) {
        console.warn('[Recibos] No fue posible cargar el logo oficial:', error.message);
        return null;
    }
}

function line(doc, y) {
    doc.save()
        .lineWidth(0.7)
        .strokeColor('#909090')
        .moveTo(46, y)
        .lineTo(566, y)
        .stroke()
        .restore();
}

function field(doc, label, value, x, y, width = 500) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111')
        .text(label + ':', x, y, { continued: true, width })
        .font('Helvetica')
        .text(' ' + (value || ''));
}

function paymentConcept(pago) {
    if (pago.tipoPago === 'EXTRAORDINARIO') {
        const concept =
            pago.cuotaExtraordinaria?.concepto ||
            pago.concepto ||
            'Cuota extraordinaria';

        return 'Pago extraordinario correspondiente a ' + concept;
    }

    return pago.concepto ||
        ('Pago de mantenimiento correspondiente al mes de ' +
        new Intl.DateTimeFormat('es-MX', {
            month: 'long',
            timeZone: 'America/Mexico_City'
        }).format(new Date()).toUpperCase());
}

function drawLogoFallback(doc) {
    doc.roundedRect(48, 27, 130, 42, 3)
        .fill('#0B4A24');

    doc.font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#FFFFFF')
        .text('Misión Jardines', 56, 42, {
            width: 114,
            align: 'center'
        });
}

function drawReceipt(doc, pago, logo) {
    const folio = pago.reciboFolio || pago.folioReporte;
    const isExtra = pago.tipoPago === 'EXTRAORDINARIO';

    // Marco exterior y cuerpo como el template de referencia.
    doc.rect(14, 18, 584, 756)
        .lineWidth(0.55)
        .strokeColor('#B8B8B8')
        .stroke();

    if (logo) {
        try {
            doc.image(logo, 48, 24, {
                fit: [136, 58],
                align: 'left',
                valign: 'center'
            });
        } catch (error) {
            console.warn('[Recibos] Logo inválido, usando fallback:', error.message);
            drawLogoFallback(doc);
        }
    } else {
        drawLogoFallback(doc);
    }

    doc.rect(36, 86, 540, 676)
        .lineWidth(1)
        .strokeColor('#222222')
        .stroke();

    // Título y subtítulo: centrados sobre todo el ancho del cuerpo.
    doc.font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#111111')
        .text('FRACCIONAMIENTO MISIÓN JARDINES', 54, 110, {
            width: 504,
            align: 'center'
        });

    doc.font('Helvetica-Bold')
        .fontSize(11)
        .text(
            isExtra
                ? 'Recibo de pago extraordinario'
                : 'Recibo de pago de mantenimiento',
            54,
            142,
            {
                width: 504,
                align: 'center'
            }
        );

    line(doc, 169);

    field(doc, 'Folio', folio, 46, 188);
    field(
        doc,
        'Fecha de emisión',
        dateMX(pago.fechaEmisionRecibo || Date.now()),
        46,
        205
    );

    line(doc, 231);

    doc.font('Helvetica-Bold')
        .fontSize(10)
        .text('Recibido de:', 46, 251);

    field(doc, 'Nombre', pago.nombreReportante || 'Residente', 46, 269);
    field(doc, 'Calle', pago.calleSnapshot || '', 46, 286);
    field(doc, 'Número', pago.numeroCasaSnapshot || '', 46, 303);

    line(doc, 337);

    doc.font('Helvetica-Bold')
        .fontSize(10)
        .text('Concepto del pago:', 46, 358);

    doc.font('Helvetica')
        .fontSize(10)
        .text(paymentConcept(pago), 46, 376, {
            width: 520,
            lineGap: 1
        });

    line(doc, 420);

    doc.font('Helvetica-Bold')
        .fontSize(10)
        .text('Detalle del pago', 46, 441, {
            width: 520,
            align: 'center'
        });

    doc.font('Helvetica-Bold')
        .fontSize(10)
        .text('Concepto', 62, 476)
        .text('Monto', 182, 476);

    const detailLabel = isExtra ? 'Extraordinario' : 'Mantenimiento';

    doc.font('Helvetica')
        .fontSize(10)
        .text(detailLabel, 46, 505)
        .text(money(pago.monto) + ' MXN', 149, 505);

    line(doc, 534);

    field(doc, 'Forma de pago', 'Transferencia / Depósito', 46, 554);
    field(doc, 'Referencia', pago.folioOperacion || 'Sin referencia', 46, 572);

    line(doc, 606);

    doc.font('Helvetica')
        .fontSize(8.5)
        .text(
            'El presente comprobante de pago se expide exclusivamente para fines administrativos internos del Fraccionamiento Misión Jardines. No constituye un comprobante fiscal ni sustituye a un Comprobante Fiscal Digital por Internet (CFDI), ni implica la liberación de adeudos anteriores o pendientes.',
            44,
            625,
            {
                width: 524,
                align: 'justify',
                lineGap: 2
            }
        );

    line(doc, 688);

    doc.font('Helvetica-Bold')
        .fontSize(10)
        .text('Atentamente:', 46, 706, {
            width: 520,
            align: 'center'
        });

    doc.font('Helvetica')
        .fontSize(9.5)
        .text('Administración', 46, 724, {
            width: 520,
            align: 'center'
        })
        .text('Fraccionamiento Misión Jardines', 46, 739, {
            width: 520,
            align: 'center'
        });
}

async function generarReciboPagoReportado(pago) {
    const logo = await resolveLogo();

    return new Promise((resolve, reject) => {
        const folio = pago.reciboFolio || pago.folioReporte;
        const fileName = 'Recibo_' + folio + '.pdf';
        const chunks = [];

        const doc = new PDFDocument({
            size: 'LETTER',
            margins: { top: 0, right: 0, bottom: 0, left: 0 },
            info: {
                Title: 'Recibo ' + folio,
                Author: 'Administración Misión Jardines',
                Subject: pago.tipoPago === 'EXTRAORDINARIO'
                    ? 'Recibo de pago extraordinario'
                    : 'Recibo de pago de mantenimiento'
            }
        });

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('error', reject);
        doc.on('end', () => {
            resolve({
                fileName,
                mimeType: 'application/pdf',
                buffer: Buffer.concat(chunks)
            });
        });

        drawReceipt(doc, pago, logo);
        doc.end();
    });
}

module.exports = { generarReciboPagoReportado };
