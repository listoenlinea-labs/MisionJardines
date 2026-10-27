'use strict';
// Sólo lectura. El correo bancario es evidencia secundaria: la aprobación exige
// IMAP TLS, From autorizado (sin autenticar), identificador, monto, fecha y destino.
const {createHash}=require('node:crypto');
const {leerBuzon}=require('./correo-bancario-mail.service');
const { equivaleFechaSpei }=require('./fecha-operativa-spei.service');
const idsBanco=require('./identificadores-bancarios.service');
const normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const clave=value=>normal(value).replace(/[^A-Z0-9]/g,'');
const centavos=value=>Math.round(Number(value||0)*100);
const suffix=value=>String(value||'').replace(/\D/g,'').slice(-4);
function convertirTexto(html){
 return String(html||'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<\/(?:p|div|tr|td|li)>|<br\s*\/?\s*>/gi,'\n')
  .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"')
  .replace(/&#0*36;|&#x0*24;|&dollar;/gi,'$')
  .replace(/&[a-z]+;|&#(?:\d+|x[0-9a-f]+);/gi,' ')
  .replace(/\r/g,'').slice(0,200000);
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
function fechaBancaria(text){
 const s=normal(text);
 // El encabezado «Enviado» del reenvío no es la fecha del depósito.
 // Leer solo la sección entre el importe recibido y la cuenta receptora.
 if(!/\bRECIBISTE\s+DE\s+(?:OTRO\s+BANCO|OTRA\s+CUENTA)\b/.test(s))return '';
 const bloques=[...s.matchAll(/\bRECIBISTE\s+DE\s+(?:OTRO\s+BANCO|OTRA\s+CUENTA)\b([\s\S]{0,600}?)\bA\s+TU\s+CUENTA\b/g)];
 const fechas=bloques.map(m=>fechaDeAviso(m[1]));
 if(!fechas.length||fechas.some(f=>!f))return '';
 const unicas=new Set(fechas);
 return unicas.size===1?[...unicas][0]:'';
}
// Extraer exclusivamente valores etiquetados; jamás inferir una referencia
// de los últimos dígitos de la cuenta, de la fecha o de la descripción.
function valorEtiquetado(texto,etiqueta,patron){
 const lines=String(texto||'').split(/\n/).map(x=>x.trim().replace(/\s+/g,' ')).filter(Boolean);
 const found=new Set();
 // Las palabras en leyendas genéricas no cuentan como campos: exigir que la
 // etiqueta sea el encabezado de la línea/celda del correo.
 const encabezado=new RegExp('^\\s*'+etiqueta.source,etiqueta.flags.replace('g',''));
 for(let i=0;i<lines.length;i++){
  const match=lines[i].match(encabezado);
  if(!match)continue;
  const rest=lines[i].slice(match[0].length).replace(/^\s*[:#=.-]\s*/,'');
  // Los templates de Titan pueden poner etiqueta y valor en celdas distintas.
  for(const candidate of [rest,lines[i+1]||'',lines[i+2]||'']){
   const m=candidate.match(patron);
   if(m){found.add(m[1]);break}
   // Nunca saltar a otra etiqueta (CLAVE, CONCEPTO, BANCO, etc.) buscando dígitos.
   if(candidate&&/[A-Z]/.test(candidate))break;
  }
 }
 return found.size===1?[...found][0]:'';
}
// Reconocer únicamente el importe recibido; nunca comisión, saldo o cuenta.
// Si hay más de un abono diferente, no interpretar un importe ambiguo.
function montoRecibido(texto){
 const s=normal(texto).replace(/\u00a0/g,' ');
 const intro=/\bRECIBISTE\s+DE\s+(?:OTRO\s+BANCO|OTRA\s+CUENTA)\s*(?:[:=-]\s*)?(?:\$\s*|MXN\s*\$?\s*)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?!\d)/g;
 const label=/(?:^|\n)\s*(?:MONTO|IMPORTE)\s+(?:RECIBIDO|DEPOSITADO|ABONADO)\s*[:=-]?\s*(?:\$\s*|MXN\s*\$?\s*)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?!\d)/gm;
 const cents=new Set();
 for(const re of [intro,label])for(const m of s.matchAll(re)){
  const n=Math.round(Number(m[1].replace(/,/g,''))*100)+Number((m[2]||'').padEnd(2,'0'));
  if(Number.isSafeInteger(n)&&n>0&&n<=10000000000)cents.add(n);
 }
 return cents.size===1?[...cents][0]/100:null;
}
function datosAviso(mensaje,config=process.env){
 const remitente=String(mensaje?.from?.emailAddress?.address||'').trim().toLowerCase();
 const administrador=String(config.PAGOS_BANK_FORWARD_FROM_ADDRESS||'').trim().toLowerCase();
 const asunto=normal(mensaje?.subject);
 const asuntoExigido=normal(config.PAGOS_BANK_MAIL_SUBJECT||'Notificación Banco Azteca');
 // Confianza explícita solicitada: solo From exacto del administrador.
 // No autentica la identidad; el remitente puede falsificarse.
 const autorizado=Boolean(administrador&&remitente===administrador&&asunto.includes(asuntoExigido));
 const origen=autorizado?'ADMINISTRADOR':'';
 const body=convertirTexto(mensaje?.body?.content||'');
 const upper=normal(body);
 const claveMatch=upper.match(/\bCLAVE\s+DE\s+RASTREO\s*[:#=\-]?\s*([A-Z0-9][A-Z0-9\s-]{10,100})/);
 const tracking=claveMatch?clave(claveMatch[1].split(/\b(?:CONSULTA|VERIFICA|REFERENCIA|CONCEPTO|TIPO|FECHA|HORA)\b/)[0].split('\n')[0]):'';
 const referencia=valorEtiquetado(upper,/\bREFERENCIA(?:\s+NUMERICA)?\b/,/^\s*(\d{5,20})(?!\d)(?:\s|$)/);
 const folio=valorEtiquetado(upper,/\bFOLIO(?:\s+DE\s+OPERACION)?\b/,/^\s*([A-Z0-9-]{5,90})(?:\s|$)/);
 // El encabezado y el importe viven en filas HTML distintas. Admitir
 // espacios/saltos entre ellos sin saltar a Comisión, Saldo u otro campo.
 const monto=montoRecibido(upper);
 const cuentas=[...new Set([...upper.matchAll(/\bA\s+TU\s+CUENTA\s*\*{2,}\s*(\d{3,4})(?!\d)/g)].map(m=>m[1]))];
 const cuenta=cuentas.length===1?cuentas[0]:'';
 const fecha=fechaBancaria(upper);
 const conceptoMatch=upper.match(/\bCONCEPTO\s*[:\-]?\s*([^\n]{2,150})/);
 const concepto=conceptoMatch?conceptoMatch[1].trim():'';
 const id=String(mensaje?.id||'');
 const limite=Number(config.PAGOS_BANK_MAIL_MAX_DIAS||7);
 const received=Date.parse(mensaje?.receivedDateTime||'');
 const reciente=Number.isFinite(received)&&Date.now()-received<=Math.min(14,Math.max(1,limite))*86400000
  &&received<=Date.now()+300000;
 return {autorizado,origenVerificado:autorizado?origen:null,tracking:tracking.length>=12&&tracking.length<=90?tracking:'',referencia,folio,monto,cuenta,fecha,concepto,id,reciente};
}
function coincideCuenta(detectada,esperada){
 // Cuatro dígitos visibles deben coincidir completos; nunca reducir una
 // terminación distinta a tres. Solo se admite la máscara de 3/4 del aviso.
 return /^\d{4}$/.test(esperada)&&/^\d{3,4}$/.test(String(detectada||''))&&esperada.endsWith(detectada);
}
// Las comprobaciones de negocio son separadas para que el diagnóstico
// distinga un identificador ausente de una fecha/cuenta no coincidente.
// Solo devuelven booleanos: nunca valores bancarios ni datos personales.
function chequeosAviso(pago,noticia,config=process.env){
 const cuenta=suffix(config.PAGOS_DESTINO_ULTIMOS4||'4409');
 const fechaOperacion=String(pago?.fechaOperacion||'').slice(0,10);
 return {
  autenticado:Boolean(noticia?.autorizado),
  reciente:Boolean(noticia?.reciente),
  mensaje:Boolean(noticia?.id),
  cuenta:cuenta.length===4&&coincideCuenta(noticia?.cuenta,cuenta),
  fecha:Boolean(noticia?.fecha&&(noticia.fecha===fechaOperacion
   ||equivaleFechaSpei(fechaOperacion,noticia.fecha,pago?.horaOperacion)
   ||equivaleFechaSpei(noticia.fecha,fechaOperacion,pago?.horaOperacion))),
  importe:Number.isFinite(noticia?.monto)&&centavos(noticia.monto)===centavos(pago?.monto)
 };
}
function coincideDatosBancarios(pago,noticia,config=process.env){
 return Object.values(chequeosAviso(pago,noticia,config)).every(Boolean);
}
function corresponde(pago,noticia,config=process.env){
 return coincideDatosBancarios(pago,noticia,config) && idsBanco.coinciden(pago,noticia);
}
function configurado(env=process.env){
 return env.PAGOS_BANK_AUTO_VALIDATE==='true'
  &&Boolean(env.PAGOS_IMAP_HOST&&env.PAGOS_IMAP_MAILBOX&&env.PAGOS_IMAP_PASSWORD
    &&String(env.PAGOS_BANK_FORWARD_FROM_ADDRESS||'').trim()&&env.PAGOS_DESTINO_ULTIMOS4);
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
module.exports={datosAviso,montoRecibido,corresponde,coincideDatosBancarios,chequeosAviso,configurado,obtenerAvisos,huellaMensaje,fechaDeAviso};
