const nodemailer = require('nodemailer');

function crearTransportador() {
    const requiredVariables = [
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_USER',
        'SMTP_PASSWORD',
        'SMTP_FROM_EMAIL'
    ];

    for (const variable of requiredVariables) {
        if (!process.env[variable]) {
            throw new Error(
                `Falta la variable ${variable}`
            );
        }
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure:
            String(process.env.SMTP_SECURE)
                .toLowerCase() === 'true',

        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
        }
    });
}

async function enviarReciboPorCorreo({
    destinatario,
    cuota,
    rutaArchivo,
    reciboUrl
}) {
    if (!destinatario) {
        return {
            enviado: false,
            motivo: 'La vivienda no tiene correo registrado'
        };
    }

    const transportador = crearTransportador();

    await transportador.sendMail({
        from: {
            name:
                process.env.SMTP_FROM_NAME ||
                'Administración Misión Jardines',

            address:
                process.env.SMTP_FROM_EMAIL
        },

        to: destinatario,

        subject:
            `Recibo de mantenimiento ${cuota.mes} - ${cuota.folio}`,

        text:
            `Hola,

Se confirma el pago de mantenimiento.

Folio: ${cuota.folio}
Periodo: ${cuota.mes} de ${cuota.anio}
Casa: ${cuota.numeroCasaSnapshot || cuota.casa?.numeroCasa || ''}
Calle: ${cuota.calleSnapshot || cuota.casa?.calle || ''}
Monto: $${Number(cuota.montoPagado || 0).toFixed(2)} MXN
Forma de pago: ${cuota.formaPago || 'No especificada'}
Referencia: ${cuota.referencia || 'Sin referencia'}

Puedes descargar el recibo aquí:
${reciboUrl}

Gracias,
Administración
Fraccionamiento Misión Jardines`,

        attachments: [
            {
                filename: `Recibo_${cuota.folio}.pdf`,
                path: rutaArchivo
            }
        ]
    });

    return {
        enviado: true
    };
}

module.exports = {
    enviarReciboPorCorreo
};