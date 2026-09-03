const nodemailer = require('nodemailer');

let transportadorCompartido = null;

function validarConfiguracionSmtp() {
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
                'Falta la variable ' + variable
            );
        }
    }
}

function crearTransportador() {
    validarConfiguracionSmtp();

    if (transportadorCompartido) {
        return transportadorCompartido;
    }

    transportadorCompartido =
        nodemailer.createTransport({
            pool: true,
            maxConnections: 2,
            maxMessages: 50,
            host: process.env.SMTP_HOST,
            port: Number(
                process.env.SMTP_PORT
            ),
            secure:
                String(
                    process.env.SMTP_SECURE
                ).toLowerCase() === 'true',
            connectionTimeout: 15000,
            greetingTimeout: 10000,
            socketTimeout: 30000,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });

    return transportadorCompartido;
}

function escaparHtml(valor) {
    return String(valor || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function esperar(milisegundos) {
    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                milisegundos
            )
    );
}

async function enviarConReintento(
    transportador,
    opciones
) {
    let ultimoError;

    for (
        let intento = 1;
        intento <= 2;
        intento += 1
    ) {
        try {
            return await transportador.sendMail(
                opciones
            );
        } catch (error) {
            ultimoError = error;

            if (intento < 2) {
                await esperar(750);
            }
        }
    }

    throw ultimoError;
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
            motivo:
                'La vivienda no tiene correo registrado'
        };
    }

    const transportador = crearTransportador();
    const casa =
        cuota.numeroCasaSnapshot ||
        cuota.casa?.numero ||
        '';
    const calle =
        cuota.calleSnapshot ||
        cuota.casa?.calle ||
        '';
    const nombre =
        cuota.nombrePagador ||
        cuota.casa?.condominos?.[0]?.nombreCompleto ||
        'residente';
    const monto =
        Number(
            cuota.montoPagado || 0
        ).toLocaleString(
            'es-MX',
            {
                style: 'currency',
                currency: 'MXN'
            }
        );

    await enviarConReintento(
        transportador,
        {
            from: {
                name:
                    process.env.SMTP_FROM_NAME ||
                    'Administración Misión Jardines',
                address:
                    process.env.SMTP_FROM_EMAIL
            },
            to: destinatario,
            subject:
                'Recibo de mantenimiento ' +
                cuota.mes +
                ' - ' +
                cuota.folio,
            text:
                'Hola ' + nombre + ',\\n\\n' +
                'Se confirma el pago de mantenimiento.\\n\\n' +
                'Folio: ' + cuota.folio + '\\n' +
                'Periodo: ' + cuota.mes + ' de ' + cuota.anio + '\\n' +
                'Casa: ' + casa + '\\n' +
                'Calle: ' + calle + '\\n' +
                'Monto: ' + monto + '\\n' +
                'Forma de pago: ' + (cuota.formaPago || 'No especificada') + '\\n' +
                'Referencia: ' + (cuota.referencia || 'Sin referencia') + '\\n\\n' +
                'Puede descargar su recibo aquí:\\n' +
                reciboUrl + '\\n\\n' +
                'Gracias,\\nAdministración\\nFraccionamiento Misión Jardines',
            html:
                '<div style="margin:0;padding:32px;background:#f6f7fb;font-family:Arial,sans-serif;color:#27324a">' +
                    '<div style="max-width:620px;margin:auto;background:#ffffff;border:1px solid #e4e7ee;border-radius:18px;overflow:hidden">' +
                        '<div style="padding:24px 30px;background:#27324a;color:#ffffff">' +
                            '<div style="font-size:12px;letter-spacing:1.3px;color:#ffc58f;font-weight:700">MISIÓN JARDINES</div>' +
                            '<h1 style="font-size:24px;margin:8px 0 0">Pago confirmado</h1>' +
                        '</div>' +
                        '<div style="padding:28px 30px">' +
                            '<p style="font-size:15px;line-height:1.6;margin-top:0">Hola <strong>' + escaparHtml(nombre) + '</strong>, su pago de mantenimiento fue registrado correctamente.</p>' +
                            '<table style="width:100%;border-collapse:collapse;margin:22px 0;background:#fff8f1;border-radius:12px">' +
                                '<tr><td style="padding:10px 14px;color:#6c7588">Folio</td><td style="padding:10px 14px;text-align:right;font-weight:700">' + escaparHtml(cuota.folio) + '</td></tr>' +
                                '<tr><td style="padding:10px 14px;color:#6c7588">Periodo</td><td style="padding:10px 14px;text-align:right;font-weight:700">' + escaparHtml(cuota.mes + ' ' + cuota.anio) + '</td></tr>' +
                                '<tr><td style="padding:10px 14px;color:#6c7588">Vivienda</td><td style="padding:10px 14px;text-align:right;font-weight:700">' + escaparHtml(calle + ' · Casa ' + casa) + '</td></tr>' +
                                '<tr><td style="padding:10px 14px;color:#6c7588">Monto pagado</td><td style="padding:10px 14px;text-align:right;font-size:18px;color:#278451;font-weight:700">' + escaparHtml(monto) + '</td></tr>' +
                            '</table>' +
                            '<p style="font-size:14px;line-height:1.6;color:#68738a">El comprobante oficial se encuentra adjunto en formato PDF. También puede consultarlo en el siguiente enlace:</p>' +
                            '<p style="text-align:center;margin:26px 0">' +
                                '<a href="' + escaparHtml(reciboUrl) + '" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#f28a2a;color:#ffffff;text-decoration:none;font-weight:700">Ver comprobante</a>' +
                            '</p>' +
                            '<p style="font-size:13px;color:#8a92a3;margin-bottom:0">Administración<br>Fraccionamiento Misión Jardines</p>' +
                        '</div>' +
                    '</div>' +
                '</div>',
            attachments: [
                {
                    filename:
                        'Recibo_' +
                        cuota.folio +
                        '.pdf',
                    path: rutaArchivo
                }
            ]
        }
    );

    return {
        enviado: true
    };
}

module.exports = {
    enviarReciboPorCorreo,
    validarConfiguracionSmtp
};
