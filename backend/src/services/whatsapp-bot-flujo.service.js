'use strict';
const {createCipheriv,createDecipheriv,randomBytes,createHash}=require('node:crypto');
const db=require('../config/database');
const {QueryTypes}=require('sequelize');
const parser=require('./comprobante-parser');
const {reconocerImagen}=require('./comprobante-lector.service');
const HOME='https://listoenlinea-labs.github.io/MisionJardines/';
const MENU='🌿 *Misión Jardines*\n\nElige una opción:\n1. Reservar Casa Club\n2. Revisar mis deudas\n3. Reportar un pago\n4. Registrar una visita\n\nResponde con un número o escribe *MENÚ*.';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const secret=()=>{const s=process.env.WHATSAPP_BOT_SESSION_SECRET||'';if(s.length<32)throw Error('Falta WHATSAPP_BOT_SESSION_SECRET');return createHash('sha256').update(s).digest();};
function seal(ctx){const iv=randomBytes(12),cy=createCipheriv('aes-256-gcm',secret(),iv);
 return Buffer.concat([iv,cy.update(JSON.stringify(ctx),'utf8'),cy.final(),cy.getAuthTag()]).toString('base64');}
function unseal(data){if(!data)return {};const b=Buffer.from(String(data),'base64');
 if(b.length<29)throw Error('Sesión inválida');
 const d=createDecipheriv('aes-256-gcm',secret(),b.subarray(0,12));d.setAuthTag(b.subarray(b.length-16));
 return JSON.parse(Buffer.concat([d.update(b.subarray(12,b.length-16)),d.final()]).toString('utf8'));}
async function load(phone){
 const [row]=await db.query('SELECT estado,contexto,actualizado_en FROM whatsapp_bot_sesiones WHERE remitente=:phone LIMIT 1',
 {replacements:{phone},type:QueryTypes.SELECT});
 if(!row)return {state:'MENU',ctx:{}};
 const expired=Date.now()-new Date(row.actualizado_en).getTime()>30*60*1000;
 return expired&&!['PAGO_CLUB','REVISION_CLUB'].includes(row.estado)?
  {state:'MENU',ctx:{}}:{state:row.estado,ctx:unseal(row.contexto)};
}
async function save(phone,state,ctx={}){
 await db.query('INSERT INTO whatsapp_bot_sesiones(remitente,estado,contexto) VALUES(:phone,:state,:ctx) ON DUPLICATE KEY UPDATE estado=VALUES(estado),contexto=VALUES(contexto),actualizado_en=NOW()',
 {replacements:{phone,state,ctx:seal(ctx)}});
}
async function send(phone,text){
 const response=await fetch('https://graph.facebook.com/'+process.env.WHATSAPP_GRAPH_VERSION+'/'+process.env.WHATSAPP_PHONE_NUMBER_ID+'/messages',
 {method:'POST',headers:{Authorization:'Bearer '+process.env.WHATSAPP_ACCESS_TOKEN,'Content-Type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',to:phone,type:'text',text:{body:String(text).slice(0,4000),preview_url:false}}),
  signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('WhatsApp no pudo entregar respuesta: '+response.status);
}
async function api(path,body){
 const url=new URL('/api/casa-club/'+path,process.env.APP_BASE_URL||'https://api-misionjardines.listoenlinea.host');
 const res=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 const obj=await res.json().catch(()=>({}));
 if(!res.ok||obj.ok===false)throw Error(obj.message||'Casa Club no disponible');
 return obj;
}
function dateISO(v){
 const t=String(v||'').trim();
 let x=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
 if(!x){const y=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(t);if(!y)return '';x=[null,y[3],y[2],y[1]];}
 const v2=x[1]+'-'+x[2].padStart(2,'0')+'-'+x[3].padStart(2,'0');
 const d=new Date(v2+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v2?v2:'';
}
async function status(phone,s){
 if(!s.ctx.id||!s.ctx.token)return send(phone,'No hay una solicitud activa en esta conversación. Escribe MENÚ.');
 const x=(await api('publico/comprobante/estado',{reservaId:s.ctx.id,claveAcceso:s.ctx.token})).data;
 if(x.estatusReserva==='APROBADA'&&x.pagado){
  await save(phone,'MENU',{});
  return send(phone,'✅ *Tu reserva ya fue confirmada y completada.*\nFolio: '+x.folio+
   '\nFecha: '+x.fecha+'\nTitan validó y registró el pago.');
 }
 if(['RECHAZADA','CANCELADA'].includes(x.estatusReserva)){
  await save(phone,'MENU',{});return send(phone,'La reservación '+x.folio+' está '+x.estatusReserva.toLowerCase()+'. Escribe MENÚ para comenzar.');
 }
 await save(phone,'REVISION_CLUB',s.ctx);
 return send(phone,'🟡 *'+x.folio+' en revisión.* '+
  (x.comprobante?.estado==='PENDIENTE_VALIDACION'?'El comprobante fue recibido; Titan todavía no confirma el depósito.':
   'Aún falta registrar y verificar el comprobante.')+
  '\nEscribe ESTADO cuando quieras consultar nuevamente.');
}
async function getMedia(mediaId){
 if(!/^\d{5,32}$/.test(mediaId||''))throw Error('Adjunto inválido');
 const headers={Authorization:'Bearer '+process.env.WHATSAPP_ACCESS_TOKEN};
 const meta=await fetch('https://graph.facebook.com/'+process.env.WHATSAPP_GRAPH_VERSION+'/'+mediaId,
  {headers,signal:AbortSignal.timeout(10000)});
 if(!meta.ok)throw Error('Meta no entregó datos del archivo');
 const info=await meta.json(),mime=String(info.mime_type||'');
 if(!['image/jpeg','image/png','image/webp'].includes(mime)||Number(info.file_size)>900000)
  throw Error('Envía una foto JPG/PNG menor a 900 KB o utiliza el enlace privado del correo para PDF e imágenes grandes.');
 const mediaURL=new URL(info.url);
 if(mediaURL.origin!=='https://lookaside.fbsbx.com')throw Error('Origen de media inesperado');
 const media=await fetch(mediaURL,{headers,signal:AbortSignal.timeout(15000)});
 if(!media.ok)throw Error('La fotografía no está disponible');
 const b=Buffer.from(await media.arrayBuffer());
 if(!b.length||b.length>900000)throw Error('Fotografía demasiado grande');
 return 'data:'+mime+';base64,'+b.toString('base64');
}
async function upload(phone,s,message){
 try{
  if(message.type!=='image')throw Error('Envía una fotografía JPG/PNG; para PDF usa el enlace privado del correo.');
  const img=await getMedia(message.image?.id);
  const data=parser.extract(await reconocerImagen(img));
  if(!data.date||!data.time||!data.amount)throw Error('No pude leer con claridad monto, fecha y hora de esta imagen.');
  // La referencia sin identificar jamás sirve para acreditar: Titan es quien valida.
  const folio=data.claveRastreo||data.folio||data.referencia||
   'SINREF-'+createHash('sha256').update(message.id).digest('hex').slice(0,20);
  await api('publico/comprobante',{reservaId:s.ctx.id,claveAcceso:s.ctx.token,
   folioOperacion:folio,fechaOperacion:data.date,horaOperacion:data.time,
   monto:Number(data.amount),comprobanteData:img,comprobanteNombre:'WhatsApp.jpg',
   comprobanteMime:img.slice(5,img.indexOf(';'))});
  await save(phone,'REVISION_CLUB',{...s.ctx,lastInboundAt:new Date().toISOString()});
  return send(phone,'✅ *Comprobante recibido y registrado para revisión.* Titan debe verificar el depósito antes de confirmar la fecha. Escribe *ESTADO* para consultar.');
 }catch(e){return send(phone,'No pude registrar el comprobante automáticamente: '+String(e.message).slice(0,220)+
  '\nTu solicitud sigue pendiente. Puedes cargarlo en el enlace privado: '+s.ctx.link);}
}
async function handle(message){
 const phone=String(message.from||'');
 if(!/^\d{8,32}$/.test(phone))return;
 const t=message.type;
 const text=String(t==='text'?message.text?.body||'':
  t==='interactive'?(message.interactive?.list_reply?.id||message.interactive?.button_reply?.id||''):'').trim().slice(0,400);
 const word=norm(text);
 let s=await load(phone);
 if(['MENU','MENÚ','INICIO','CANCELAR','0'].includes(word)){await save(phone,'MENU',{});return send(phone,MENU);}
 if(['PAGO_CLUB','REVISION_CLUB'].includes(s.state)&&word==='ESTADO')return status(phone,s);
 if(s.state==='MENU'){
  if(word==='1'||word==='RESERVAR'||word==='CASA CLUB'){
   await save(phone,'FECHA',{});return send(phone,'🏡 ¿Qué día deseas reservar Casa Club? Escribe DD/MM/AAAA (por ejemplo 25/11/2026).');
  }
  if(word==='2')return send(phone,'🔐 Para consultar tus deudas personales y descargar tu PDF, inicia sesión de forma segura en '+
   HOME+'app.html?page=pagos.html\nNo envíes tu contraseña por WhatsApp. El enlace de sesión para recibir el PDF aquí se incorporará después.');
  if(word==='3')return send(phone,'🔐 Para reportar pagos de mantenimiento o proyectos, abre '+
   HOME+'app.html?page=pagos.html\nTu comprobante se verificará con OCR y Titan; no se acredita automáticamente al subirlo.');
  if(word==='4')return send(phone,'🔐 Para registrar una visita, primero valida tu identidad en '+
   HOME+'app.html?page=visitas.html\nLa autorización directa en el chat requiere vincular la cuenta con seguridad.');
  return send(phone,MENU);
 }
 if(s.state==='FECHA'){
  const date=dateISO(text);
  if(!date||date<=today()||new Date(date+'T12:00:00Z')-new Date(today()+'T12:00:00Z')>365*86400000)
   return send(phone,'Escribe una fecha válida desde mañana y dentro de los próximos 365 días (DD/MM/AAAA).');
  try{
   const info=await api('publico/fechas?desde='+date+'&hasta='+date);
   if(!info.disponibilidadVerificada)return send(phone,'No pude verificar disponibilidad contra el calendario. Intenta de nuevo después.');
   if(info.ocupadas?.some(r=>r.fecha===date))return send(phone,'❌ El '+date+' no está disponible. Escribe otra fecha para revisar.');
   const streets=(await api('publico/domicilios')).opciones||[];
   if(!streets.length)throw Error('Sin catálogo de calles');
   await save(phone,'CALLE',{date,streets});
   return send(phone,'✅ '+date+' aparece disponible. Elige una calle:\n'+streets.map((x,i)=>(i+1)+'. '+x).join('\n'));
  }catch(e){return send(phone,'No pude verificar esa fecha: '+e.message);}
 }
 if(s.state==='CALLE'){
  const options=s.ctx.streets||[];
  const street=/^\d{1,2}$/.test(text)?options[Number(text)-1]:options.find(x=>norm(x)===word);
  if(!street)return send(phone,'Escribe uno de los números de calle que aparecen en la lista.');
  await save(phone,'CASA',{date:s.ctx.date,street});
  return send(phone,'Seleccionaste *'+street+'*. ¿Cuál es el número de tu casa?');
 }
 if(s.state==='CASA'){
  if(!/^[\w -]{1,20}$/.test(text))return send(phone,'Escribe un número de vivienda válido.');
  try{
   const houses=(await api('publico/domicilios?calle='+encodeURIComponent(s.ctx.street))).opciones||[];
   if(!houses.some(x=>norm(x)===word))return send(phone,'No encontré esa casa en la calle seleccionada. Verifica el número.');
   await save(phone,'NOMBRE',{...s.ctx,house:text});
   return send(phone,'¿Cuál es el nombre completo de quien solicita la reserva?');
  }catch(e){return send(phone,'No pude verificar la vivienda. Intenta nuevamente.');}
 }
 if(s.state==='NOMBRE'){
  if(text.length<4||text.length>180)return send(phone,'Escribe el nombre y apellido de quien solicita.');
  await save(phone,'CORREO',{...s.ctx,name:text});
  return send(phone,'¿A qué correo enviamos tu confirmación y enlace de pago privado?');
 }
 if(s.state==='CORREO'){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)||text.length>150)
   return send(phone,'Escribe un correo electrónico válido.');
  await save(phone,'REGLAMENTO',{...s.ctx,email:text.toLowerCase()});
  return send(phone,'📜 Debes leer el reglamento antes de solicitar: '+HOME+
   'reglamento-casa-club.html\n\nSi estás de acuerdo, escribe *ACEPTO*.');
 }
 if(s.state==='REGLAMENTO'){
  if(word!=='ACEPTO')return send(phone,'Escribe *ACEPTO* solo después de leer el reglamento o MENÚ para cancelar.');
  try{
   const result=await api('publico/solicitudes',{fecha:s.ctx.date,calle:s.ctx.street,numero:s.ctx.house,
    solicitante:s.ctx.name,correo:s.ctx.email,
    telefono:/^521\d{10}$/.test(phone)?'52'+phone.slice(3):phone,propietario:false,
    motivo:'Reservación solicitada desde WhatsApp',aceptaReglamento:true});
   const link=result.data?.pago?.enlaceCarga;
   const token=link?decodeURIComponent(new URL(link).hash.split('=').slice(1).join('=')).split('.').at(-1):'';
   if(!result.data?.id||!/^[a-f0-9]{64}$/.test(token)){
    await save(phone,'MENU',{});
    return send(phone,'Tu solicitud fue registrada, pero no pude abrir su enlace de pago en el chat. Revisa el correo que acabamos de enviarte antes de intentar otra reserva.');
   }
   await save(phone,'PAGO_CLUB',{id:result.data.id,token,link,date:s.ctx.date,lastInboundAt:new Date().toISOString()});
   const price=Number(result.data.pago?.monto||0).toLocaleString('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0});
   return send(phone,'🟡 *Reserva apartada provisionalmente*\nFolio: CC-'+result.data.id+
    '\nFecha: '+s.ctx.date+'\nTotal a transferir: '+price+
    '\n\nPuedes subir *ahora mismo* una foto de tu comprobante en este chat. '+
    'Si el archivo es PDF o no se lee, utiliza el enlace privado enviado a tu correo.\n' +
    'La fecha se confirma únicamente cuando Titan valida el pago.');
  }catch(e){await save(phone,'MENU',{});return send(phone,'No se pudo completar la reserva: '+e.message+
   '\nSi recibiste un correo de solicitud, consulta ese enlace antes de reintentarlo.');}
 }
 if(s.state==='PAGO_CLUB'){
  if(t==='image'||t==='document')return upload(phone,s,message);
  return send(phone,'Envía la foto del comprobante, escribe *ESTADO* o *MENÚ*. También puedes utilizar el enlace del correo.');
 }
 if(s.state==='REVISION_CLUB')return send(phone,'El comprobante sigue en revisión bancaria. Escribe *ESTADO* para consultar o *MENÚ* para comenzar.');
 await save(phone,'MENU',{});return send(phone,MENU);
}
// Notificación automática: solo si el vecino escribió dentro de las
// últimas 24 horas, para no infringir la ventana de mensajes de Meta.
// Fuera de esa ventana se requiere plantilla aprobada o nuevo mensaje.
async function notifyIfConfirmed(phone){
 const s=await load(phone);
 if(s.state!=='REVISION_CLUB'||!s.ctx.id||!s.ctx.token)return false;
 const last=new Date(s.ctx.lastInboundAt||'').getTime();
 if(!Number.isFinite(last)||Date.now()-last>23*60*60*1000)return false;
 const x=(await api('publico/comprobante/estado',{reservaId:s.ctx.id,claveAcceso:s.ctx.token})).data;
 if(x.estatusReserva!=='APROBADA'||!x.pagado)return false;
 await send(phone,'✅ *¡Reservación de Casa Club confirmada!*'+
  '\nFolio: '+x.folio+'\nFecha: '+x.fecha+
  '\nTitan confirmó el depósito. Tu solicitud ha quedado completada.');
 await save(phone,'MENU',{});
 return true;
}
module.exports={handle,send,load,save,status,notifyIfConfirmed,dateISO,MENU};
