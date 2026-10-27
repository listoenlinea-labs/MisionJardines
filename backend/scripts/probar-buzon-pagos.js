'use strict';
// Diagnóstico sin modificar pagos, etiquetas ni mensajes del buzón.
// No imprime contraseñas, identificadores bancarios ni contenidos de correo.
const path=require('node:path');
require('dotenv').config({path:path.resolve(__dirname,'../.env.'+(process.env.NODE_ENV||'development'))});
const {leerBuzon}=require('../src/services/correo-bancario-mail.service');
const banco=require('../src/services/banco-correo.service');
async function main(){
 const host=process.env.PAGOS_IMAP_HOST,mailbox=process.env.PAGOS_IMAP_MAILBOX;
 const password=process.env.PAGOS_IMAP_PASSWORD;
 if(!host||!mailbox||!password)throw Error('Faltan PAGOS_IMAP_HOST, PAGOS_IMAP_MAILBOX o PAGOS_IMAP_PASSWORD');
 console.log('[Diagnóstico] Probando conexión TLS e inicio de sesión del buzón configurado');
 const messages=await leerBuzon({mailbox,password,dias:Math.min(7,Number(process.env.PAGOS_BANK_MAIL_MAX_DIAS)||7)});
 const parsed=messages.map(m=>banco.datosAviso(m));
 console.log('[Diagnóstico] Conexión y lectura: OK');
 console.log('[Diagnóstico] Correos recientes encontrados:',messages.length);
 console.log('[Diagnóstico] Avisos con remitente/asunto autorizados (sin autenticar):',parsed.filter(m=>m.autorizado).length);
 console.log('[Diagnóstico] Reenvíos con From del administrador (sin autenticar):',parsed.filter(m=>m.autorizado&&m.origenVerificado==='ADMINISTRADOR').length);
 console.log('[Diagnóstico] Avisos con clave, monto, fecha y cuenta:',parsed.filter(m=>m.autorizado&&m.tracking&&Number.isFinite(m.monto)&&m.fecha&&m.cuenta).length);
 // Separar extracción de autenticación: un reenvío puede contener datos
 // legibles pero carecer de autenticación bancaria. Mostrar solo cantidades.
 console.log('[Diagnóstico] Mensajes con datos completos, sin considerar autenticación:',parsed.filter(m=>m.tracking&&Number.isFinite(m.monto)&&m.fecha&&m.cuenta).length);
 console.log('[Diagnóstico] Mensajes sin clave de rastreo reconocible:',parsed.filter(m=>!m.tracking).length);
 console.log('[Diagnóstico] Mensajes sin terminación de cuenta reconocible (3 o 4 dígitos):',parsed.filter(m=>!m.cuenta).length);
 console.log('[Diagnóstico] El concepto del aviso es informativo; no se exige calle ni número de vivienda.');
 console.log('[Diagnóstico] No se actualizó ningún pago, TAG o mensaje.');
 if(!parsed.some(m=>m.autorizado))
  console.warn('[Diagnóstico] Sin avisos autorizados; revisar PAGOS_BANK_FORWARD_FROM_ADDRESS y el asunto. El origen se comprueba solo por From, sin DKIM/DMARC.');
}
main().catch(error=>{console.error('[Diagnóstico] Error:',error.message);process.exitCode=1});
