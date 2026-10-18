const email = require('./email.service');
function configuracion() {
    try { email.validarConfiguracionSmtp(); }
    catch { throw Object.assign(new Error('Configura SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD y SMTP_FROM_EMAIL antes de enviar invitaciones por correo.'), { status: 503 }); }
    let url;
    try { url = new URL(process.env.AUTO_USERS_FRONTEND_URL || process.env.FRONTEND_APP_URL || 'https://listoenlinea-labs.github.io/MisionJardines'); }
    catch { throw Object.assign(new Error('Revisa la URL pública de invitaciones.'), { status: 503 }); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Object.assign(new Error('La URL pública de invitaciones debe usar HTTPS sin credenciales ni parámetros.'), { status: 503 });
    return { frontend: url.href.replace(/\/$/, '') };
}
const correoValido = value => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(value || '')) && String(value).length <= 150;
async function enviarInvitacion({ correo, nombre, domicilio, enlace }) {
    configuracion();
    if (!correoValido(correo)) throw Object.assign(new Error('Corrige el correo antes de enviar la invitación.'), { status: 400 });
    return email.enviarInvitacionPreregistro({ destinatario: correo, nombre, domicilio, enlace });
}
module.exports = { configuracion, correoValido, enviarInvitacion };
