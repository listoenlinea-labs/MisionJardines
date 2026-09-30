const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

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

function logoPath() {
    const candidates = [
        process.env.RECEIPT_LOGO_PATH,
        path.resolve(__dirname, '../../../docs/assets/images/logo-mision-jardines.png'),
        path.resolve(process.cwd(), 'docs', 'assets', 'images', 'logo-mision-jardines.png'),
        path.resolve(process.cwd(), '..', 'docs', 'assets', 'images', 'logo-mision-jardines.png')
    ].filter(Boolean);
    return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function line(doc, y) {
    doc.save().lineWidth(0.7).strokeColor('#909090').moveTo(32, y).lineTo(580, y).stroke().restore();
}

function field(doc, label, value, x, y, width = 540) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111')
        .text(label + ':', x, y, { continued: true, width })
        .font('Helvetica').text(' ' + (value || ''));
}

function paymentConcept(pago) {
    if (pago.tipoPago === 'EXTRAORDINARIO') {
        const concept = pago.cuotaExtraordinaria?.concepto || pago.concepto || 'Cuota extraordinaria';
        return 'Pago extraordinario correspondiente a ' + concept;
    }
    const date = new Date(String(pago.fechaOperacion) + 'T12:00:00');
    const month = new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: 'America/Mexico_City' })
        .format(date).toUpperCase();
    return 'Pago de mantenimiento correspondiente al mes de ' + month;
}

function generarReciboPagoReportado(pago) {
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

        doc.rect(11, 15, 590, 762).lineWidth(0.6).strokeColor('#B9B9B9').stroke();
        doc.rect(24, 70, 564, 707).lineWidth(1).strokeColor('#222222').stroke();

        const logo = logoPath();
        if (logo) {
            doc.image(logo, 36, 20, { cover: [130, 44], align: 'center', valign: 'center' });
        } else {
            doc.roundedRect(36, 20, 130, 44, 3).fill('#0B4A24')
                .font('Helvetica-Bold').fontSize(13).fillColor('#FFFFFF')
                .text('Misión Jardines', 43, 35, { width: 116, align: 'center' });
        }

        doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111')
            .text('FRACCIONAMIENTO MISIÓN JARDINES', 170, 90, { width: 385, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(10)
            .text(
                pago.tipoPago === 'EXTRAORDINARIO'
                    ? 'Recibo de pago extraordinario'
                    : 'Recibo de pago de mantenimiento',
                170, 119, { width: 385, align: 'center' }
            );

        line(doc, 142);
        field(doc, 'Folio', folio, 32, 163);
        field(doc, 'Fecha de emisión', dateMX(pago.fechaEmisionRecibo || Date.now()), 32, 179);
        line(doc, 199);

        doc.font('Helvetica-Bold').fontSize(10).text('Recibido de:', 32, 219);
        field(doc, 'Nombre', pago.nombreReportante || 'Residente', 32, 235);
        field(doc, 'Calle', pago.calleSnapshot || '', 32, 251);
        field(doc, 'Número', pago.numeroCasaSnapshot || '', 32, 267);
        line(doc, 297);

        doc.font('Helvetica-Bold').fontSize(10).text('Concepto del pago:', 32, 317);
        doc.font('Helvetica').fontSize(10).text(paymentConcept(pago), 32, 334, { width: 540 });
        line(doc, 366);

        doc.font('Helvetica-Bold').fontSize(10)
            .text('Detalle del pago', 32, 387, { width: 548, align: 'center' });
        doc.font('Helvetica-Bold').text('Concepto', 47, 419).text('Monto', 154, 419);

        const detailLabel = pago.tipoPago === 'EXTRAORDINARIO' ? 'Extraordinario' : 'Mantenimiento';
        doc.font('Helvetica').text(detailLabel, 32, 446)
            .text(money(pago.monto) + ' MXN', 122, 446);

        line(doc, 471);
        field(doc, 'Forma de pago', 'Transferencia / Depósito', 32, 490);
        field(doc, 'Referencia', pago.folioOperacion || 'Sin referencia', 32, 507);
        line(doc, 539);

        doc.font('Helvetica').fontSize(9)
            .text(
                'El presente comprobante de pago se expide exclusivamente para fines administrativos internos del Fraccionamiento Misión Jardines. No constituye un comprobante fiscal ni sustituye a un Comprobante Fiscal Digital por Internet (CFDI), ni implica la liberación de adeudos anteriores o pendientes.',
                29, 559, { width: 554, align: 'justify', lineGap: 2 }
            );

        line(doc, 638);
        doc.font('Helvetica-Bold').fontSize(10)
            .text('Atentamente:', 32, 658, { width: 548, align: 'center' });
        doc.font('Helvetica').fontSize(10)
            .text('Administración', 32, 685, { width: 548, align: 'center' })
            .text('Fraccionamiento Misión Jardines', 32, 701, { width: 548, align: 'center' });

        line(doc, 710);
        doc.font('Helvetica-Bold').fontSize(10)
            .text('Sello:', 32, 727, { width: 548, align: 'center' });
        doc.font('Helvetica-BoldOblique').fontSize(13)
            .text(
                pago.estatus === 'VALIDADO' ? 'PAGADO' : 'PAGO REPORTADO',
                32, 750, { width: 548, align: 'center', underline: true }
            );

        doc.end();
    });
}

module.exports = { generarReciboPagoReportado };
