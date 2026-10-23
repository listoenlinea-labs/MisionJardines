'use strict';
// Sólo lectura. El correo bancario es evidencia secundaria: la aprobación exige
// IMAP TLS, remitente autorizado autenticado, clave, monto, fecha y terminación receptora.
const {createHash}=require('node:crypto');
const {leerBuzon}=require('./correo-bancario-mail.service');
const normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const clave=value=>normal(value).replace(/[^A-Z0-9]/g,'');
const centavos=value=>Math.round(Number(value||0)*100);
const suffix=value=>String(value||'').replace(/\D/g,'').slice(-4);
function convertirTexto(html){
 return String(html||'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<\/(?:p|div|tr|td|li)>|<br\s*\/?\s*>/gi,'\n')
  .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&[a-z]+;|&#\d+;/gi,' ')
  .replace(/\r/g,'').slice(0,50000);
}
const mesNumero={ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12};
function fechaDeAviso(text){
 const s=normal(text);
 let m=s.match(/\b(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(20\d{2})\b/);
 let day,month,year;
 if(m){day=+m[1];month=+m[2];year=+m[3];}
 else {
  m=s.match(/\b(\d{1,2})\s*(?:[\/.\-]|DE\s+|\s+)(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC)[A-Z]*\s*(?:[\/.\-]|DE\s+|\s+)(20\d{2})\b/);
  if(!m)return '';
  day=+m[1];month=mesNumero[m[2]==='SET'?'SEP':m[2]];year=+m[3];
 }
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()+1!==month||date.getUTCDate()!==day)return '';
 return year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}
function datosAviso(mensaje,config=process.env){
 const remitente=String(mensaje?.from?.emailAddress?.address||'').trim().toLowerCase();
 const emisor=String(config.PAGOS_BANK_FROM_ADDRESS||'').trim().toLowerCase();
 const administrador=String(config.PAGOS_BANK_FORWARD_FROM_ADDRESS||'').trim().toLowerCase();
 const asunto=normal(mensaje?.subject);
 const asuntoExigido=normal(config.PAGOS_BANK_MAIL_SUBJECT||'Notificación Banco Azteca');
 const headers=mensaje?.internetMessageHeaders||[];
 const autenticacion=headers.filter(h=>String(h.name).toLowerCase()==='authentication-results').map(h=>String(h.value||'')).join(' ');
 // En un reenvío se autentica al administrador expresamente autorizado,
 // sin exigir que el encabezado exterior siga perteneciendo al banco.
 // El texto «De: Banco…» del cuerpo no puede autorizar a otro remitente.
 const origen=emisor&&remitente===emisor?'BANCO':administrador&&remitente===administrador?'ADMINISTRADOR':'';
 const dominio=origen?remitente.split('@')[1]||'':'';
 const autorizado=Boolean(origen&&asunto.includes(asuntoExigido)&&dominio
  &&/\bdmarc=pass\b/i.test(autenticacion)
  &&/\bdkim=pass\b/i.test(autenticacion)
  &&new RegExp('header\\.from='+dominio.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:\\s|;|$)','i').test(autenticacion));
 const body=convertirTexto(mensaje?.body?.content||'');
 const upper=normal(body);
 const claveMatch=upper.match(/\bCLAVE\s+DE\s+RASTREO\s*[:#=\-]?\s*([A-Z0-9][A-Z0-9\s-]{10,100})/);
 const tracking=claveMatch?clave(claveMatch[1].split(/\b(?:CONSULTA|VERIFICA|REFERENCIA|CONCEPTO|TIPO|FECHA|HORA)\b/)[0].split('\n')[0]):'';
 // El encabezado y el importe viven en filas HTML distintas. Admitir
 // espacios/saltos entre ellos sin saltar a Comisión, Saldo u otro campo.
 const montos=[...new Set([...upper.matchAll(/\bRECIBISTE\s+DE\s+(?:OTRO\s+BANCO|OTRA\s+CUENTA)\s*\$\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?)(?![\d.,])/g)]
  .map(match=>Number(match[1].replace(/,/g,''))))];
 const monto=montos.length===1&&Number.isFinite(montos[0])?montos[0]:null;
 const cuentas=[...new Set([...upper.matchAll(/\bA\s+TU\s+CUENTA\s*\*{2,}\s*(\d{3,4})(?!\d)/g)].map(m=>m[1]))];
 const cuenta=cuentas.length===1?cuentas[0]:'';
 const fecha=fechaDeAviso(upper);
 const conceptoMatch=upper.match(/\bCONCEPTO\s*[:\-]?\s*([^\n]{2,150})/);
 const concepto=conceptoMatch?conceptoMatch[1].trim():'';
 const id=String(mensaje?.id||'');
 const limite=Number(config.PAGOS_BANK_MAIL_MAX_DIAS||7);
 const received=Date.parse(mensaje?.receivedDateTime||'');
 const reciente=Number.isFinite(received)&&Date.now()-received<=Math.min(14,Math.max(1,limite))*86400000
  &&received<=Date.now()+300000;
 return {autorizado,origenVerificado:autorizado?origen:null,tracking:tracking.length>=12&&tracking.length<=90?tracking:'',monto,cuenta,fecha,concepto,id,reciente};
}
function perteneceAVivienda(pago,noticia){
 const casa=pago?.casa;
 const concepto=' '+normal(noticia?.concepto).replace(/[^A-Z0-9]+/g,' ')+' ';
 const calle=normal(casa?.calleCorrecta||casa?.calle).replace(/[^A-Z0-9]+/g,' ').trim();
 const numero=String(casa?.numero||'').trim();
 if(!calle||!numero||!concepto.trim())return false;
 return concepto.includes(' '+calle+' '+numero+' ')
  || concepto.includes(' '+calle+' CASA '+numero+' ');
}
function coincideCuenta(detectada,esperada){
 // Cuatro dígitos visibles deben coincidir completos; nunca reducir una
 // terminación distinta a tres. Solo se admite la máscara de 3/4 del aviso.
 return /^\d{4}$/.test(esperada)&&/^\d{3,4}$/.test(String(detectada||''))&&esperada.endsWith(detectada);
}
function corresponde(pago,noticia,config=process.env){
 const cuenta=suffix(config.PAGOS_DESTINO_ULTIMOS4||'4409');
 return Boolean(noticia.autorizado&&noticia.reciente&&noticia.id&&noticia.tracking
  &&clave(pago?.folioOperacion)===noticia.tracking&&coincideCuenta(noticia.cuenta,cuenta)
  &&cuenta.length===4&&noticia.fecha===String(pago?.fechaOperacion).slice(0,10)
  &&Number.isFinite(noticia.monto)&&centavos(noticia.monto)===centavos(pago?.monto)
  &&perteneceAVivienda(pago,noticia));
}
function configurado(env=process.env){
 return env.PAGOS_BANK_AUTO_VALIDATE==='true'
  &&Boolean(env.PAGOS_IMAP_HOST&&env.PAGOS_IMAP_MAILBOX&&env.PAGOS_IMAP_PASSWORD&&env.PAGOS_IMAP_AUTH_SERVER
    &&(String(env.PAGOS_BANK_FROM_ADDRESS||'').trim()||String(env.PAGOS_BANK_FORWARD_FROM_ADDRESS||'').trim())&&env.PAGOS_DESTINO_ULTIMOS4);
}
async function obtenerAvisos(){
 if(!configurado())return [];
 const messages=await leerBuzon({
  mailbox:String(process.env.PAGOS_IMAP_MAILBOX||'').trim(),
  password:String(process.env.PAGOS_IMAP_PASSWORD||''),
  dias:Number(process.env.PAGOS_BANK_MAIL_MAX_DIAS)||7
 });
 return messages.map(msg=>datosAviso(msg));
}
function huellaMensaje(messageId,mailbox=process.env.PAGOS_IMAP_MAILBOX){
 return createHash('sha256').update(String(mailbox||'').toLowerCase()+':'+String(messageId)).digest('hex');
}
module.exports={datosAviso,corresponde,perteneceAVivienda,configurado,obtenerAvisos,huellaMensaje,fechaDeAviso};
