function configuracion() {
    const required = ['AUTO_USERS_FRONTEND_URL', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_API_VERSION', 'WHATSAPP_INVITACION_TEMPLATE'];
    if (required.some(name => !process.env[name])) throw Object.assign(new Error('Configura el remitente, la plantilla de WhatsApp Business y la URL de invitaciones antes de enviar.'), { status: 503 });
    const url = new URL(process.env.AUTO_USERS_FRONTEND_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Object.assign(new Error('La URL pública de invitaciones debe ser HTTPS y no contener credenciales ni parámetros.'), { status: 503 });
    if (!/^v\d+\.\d+$/.test(process.env.WHATSAPP_API_VERSION) || !/^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID)) throw Object.assign(new Error('Revisa la configuración de WhatsApp Business.'), { status: 503 });
    return { frontend: url.href.replace(/\/$/, '') };
}
function telefonoWhatsApp(value) {
    const digits = String(value || '').replace(/\D/g, '');
    // Only one Mexican number or an explicit international number, not lists/extensions.
    if (!/^[+\d\s().-]+$/.test(String(value || ''))) return null;
    if (digits.length === 10) return '52' + digits;
    return digits.length >= 11 && digits.length <= 15 && !digits.startsWith('0') ? digits : null;
}
async function enviarInvitacion({ telefono, nombre, domicilio, enlace }) {
    configuracion();
    const to = telefonoWhatsApp(telefono);
    if (!to) throw Object.assign(new Error('El teléfono no es un número válido de WhatsApp.'), { status: 400 });
    const response = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { Authorization: 'Bearer ' + process.env.WHATSAPP_ACCESS_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: {
            name: process.env.WHATSAPP_INVITACION_TEMPLATE,
            language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'es_MX' },
            components: [{ type: 'body', parameters: [nombre, domicilio, enlace].map(text => ({ type: 'text', text })) }]
        } })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.messages?.[0]?.id) throw Object.assign(new Error('WhatsApp no aceptó el mensaje. Revisa remitente, destinatario y plantilla en Meta.'), { status: 502 });
    return data.messages[0].id; // Provider acceptance is not proof of delivery/read.
}
module.exports = { configuracion, telefonoWhatsApp, enviarInvitacion };
