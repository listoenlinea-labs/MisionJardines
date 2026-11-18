'use strict';
const {createCipheriv,createDecipheriv,randomBytes,createHash}=require('node:crypto');
const db=require('../config/database');
const {QueryTypes}=require('sequelize');
const parser=require('./comprobante-parser');
const {reconocerImagen}=require('./comprobante-lector.service');
const {REGLAMENTO_VERSION}=require('./casa-club-acceso-publico.service');
const free=require('./whatsapp-presupuesto-cero.service');
const privateFlow=require('./whatsapp-bot-privado.service');
const vinculos=require('./whatsapp-bot-vinculos.service');
const identidad=require('./whatsapp-bot-identidad.service');
const {fechaISO:fechaFlexible}=require('./whatsapp-bot-fechas.service');
const calendario=require('./whatsapp-casa-club-calendario.service');
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
 return expired&&!['PAGO_CLUB','REVISION_CLUB','PAGO_COMPROBANTE','PAGO_TIPO','ESPERANDO_VINCULO'].includes(row.estado)?
  {state:'MENU',ctx:{}}:{state:row.estado,ctx:unseal(row.contexto)};
}
async function save(phone,state,ctx={}){
 await db.query('INSERT INTO whatsapp_bot_sesiones(remitente,estado,contexto) VALUES(:phone,:state,:ctx) ON DUPLICATE KEY UPDATE estado=VALUES(estado),contexto=VALUES(contexto),actualizado_en=NOW()',
 {replacements:{phone,state,ctx:seal(ctx)}});
}
async function send(phone,text){return free.send(phone,text);}
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
 if(!s.ctx.casaId||!await vinculos.verificar(phone,s.ctx.casaId))
  return privateFlow.enlace(phone,'PAGO_COMPROBANTE',
   {tipo:'CASA_CLUB',reservaId:s.ctx.id,casaId:s.ctx.casaId});
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
 await save(phone,x.comprobante?'REVISION_CLUB':'PAGO_CLUB',
  {...s.ctx,lastInboundAt:new Date().toISOString()});
 return send(phone,'🟡 *'+x.folio+' en revisión.* '+
  (x.comprobante?.estado==='PENDIENTE_VALIDACION'?'El comprobante fue recibido; Titan todavía no confirma el depósito.':
   'Aún falta registrar y verificar el comprobante.')+
  '\nEscribe ESTADO para consultar nuevamente. Si aún no has enviado el comprobante, puedes mandar la foto en este chat.');
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
 if(!s.ctx.casaId||!await vinculos.verificar(phone,s.ctx.casaId))
  return privateFlow.enlace(phone,'PAGO_COMPROBANTE',
   {tipo:'CASA_CLUB',reservaId:s.ctx.id,casaId:s.ctx.casaId});
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
async function mostrarMenu(phone){
 return free.list(phone,'🌿 *Misión Jardines*\nSelecciona un trámite tocando una opción:',
  'Ver opciones',[
   {id:'MENU_RESERVAR',title:'Reservar Casa Club'},
   {id:'MENU_ADEUDOS',title:'Revisar mis deudas'},
   {id:'MENU_PAGOS',title:'Reportar un pago'},
   {id:'MENU_VISITAS',title:'Registrar una visita'}
  ]);
}
async function pedirFecha(phone){
 try{
  if(await calendario.enviar(phone,save))return true;
 }catch(e){
  // El bot nunca afirma disponibilidad si la fuente del calendario falló.
  // Recuperación: sigue vigente la captura manual existente.
  console.warn('[WhatsApp Bot] Calendario no disponible:',String(e.message||e).slice(0,120));
 }
 await save(phone,'FECHA',{});
 return free.buttons(phone,'🏡 ¿Qué fecha deseas reservar? Puedes escribir 20/04/2027, 20 de abril de 2027 o diciembre 13 de 2026. El calendario interactivo no está disponible en este momento.',
  [{id:'FECHA_MANUAL',title:'Escribir fecha'},{id:'MENU',title:'Menú'}]);
}
async function mostrarReglamentoAuto(phone,ctx){
 const auth=await vinculos.verificar(phone);
 if(!auth)return privateFlow.enlace(phone,'REGLAMENTO_AUTO',{date:ctx.date});
 if(!ctx?.date||!fechaFlexible(ctx.date))return pedirFecha(phone);
 // Solo la sesión autorizada aporta calle y número. Nunca se resuelven
 // a partir de un teléfono no verificado ni se muestran a extraños.
 return mostrarReglamento(phone,{
  date:ctx.date,
  street:auth.casa.calleCorrecta||auth.casa.calle,
  house:String(auth.casa.numero),
  casaId:auth.casaId
 });
}
async function mostrarReglamento(phone,ctx){
 const auth=await vinculos.verificar(phone,ctx.casaId);
 if(!auth)return privateFlow.enlace(phone,'REGLAMENTO',ctx);
 await save(phone,'REGLAMENTO',{...ctx,reglamentoVersion:REGLAMENTO_VERSION});
 return free.buttons(phone,'📜 *Lectura y aceptación obligatoria*\nLee el reglamento oficial y todas sus condiciones en:\n'+
  HOME+'reglamento-casa-club.html\n\nSin aceptar el reglamento vigente no se enviará ninguna solicitud.',
  [{id:'CLUB_ACEPTAR',title:'Acepto reglamento'},{id:'MENU',title:'Menú'}]);
}
async function handle(message){
 const phone=String(message.from||'');
 if(!/^\d{8,32}$/.test(phone))return;
 const t=message.type;
 const text=String(t==='text'?message.text?.body||'':
  t==='interactive'?(message.interactive?.list_reply?.id||message.interactive?.button_reply?.id||''):'').trim().slice(0,400);
 const word=norm(text);
 // $0 preventivo: cuando quedan menos de 25 respuestas, desviar una sola vez
 // por usuario al portal, antes de seguir procesando trámites.
 // Si se pierde la tabla del presupuesto, no enviar nada (fail closed).
 const balance=await free.usage();
 let s=await load(phone);
 if(balance.used>=free.SOFT_CAP){
  if(s.state==='LIMITE_GRATIS')return false;
  await save(phone,'LIMITE_GRATIS',{});
  return send(phone,free.fallback);
 }
 if(s.state==='LIMITE_GRATIS'){
  await save(phone,'MENU',{});s={state:'MENU',ctx:{}};
 }
 if(['MENU','MENÚ','INICIO','CANCELAR','0'].includes(word)){
  await save(phone,'MENU',{});return mostrarMenu(phone);
 }
 if(word==='CERRAR SESION'||word==='CERRAR SESIÓN'){
  await vinculos.desvincular(phone);await save(phone,'MENU',{});
  return mostrarMenu(phone);
 }
 if(word==='MENU_RESERVAR'||(s.state==='MENU'&&['1','RESERVAR','CASA CLUB'].includes(word))){
  return pedirFecha(phone);
 }
 if(word==='MENU_ADEUDOS'||(s.state==='MENU'&&['2','DEUDAS'].includes(word)))
  return privateFlow.empezar(phone,'ADEUDOS');
 if(word==='MENU_PAGOS'||(s.state==='MENU'&&['3','PAGO'].includes(word)))
  return privateFlow.empezar(phone,'PAGO_TIPO');
 if(word==='MENU_VISITAS'||(s.state==='MENU'&&['4','VISITA'].includes(word)))
  return privateFlow.empezar(phone,'VISITA_NOMBRE');
 if(['ESPERANDO_VINCULO','IDENTIFICAR_CALLE','IDENTIFICAR_CASA',
   'PAGO_TIPO','PAGO_PROYECTOS','PAGO_RESERVAS',
   'PAGO_COMPROBANTE','VISITA_NOMBRE','VISITA_TIPO','VISITA_FECHA',
   'VISITA_HORA','VISITA_CONFIRMAR'].includes(s.state)){
  return privateFlow.manejar(phone,s,word,text,message);
 }
 if(s.state==='MENU')return mostrarMenu(phone);
 if(s.state==='FECHA'){
  if(word==='FECHA_REINTENTAR')return pedirFecha(phone);
  if(word==='FECHA_MANUAL')return send(phone,'✏️ Escribe la fecha como DD/MM/AAAA, 20 de abril de 2027, diciembre 13 de 2026 o AAAA-MM-DD.');
  const flowReply=message.type==='interactive'&&message.interactive?.type==='nfm_reply';
  const date=flowReply?calendario.fechaRespuesta(message,s.ctx):fechaFlexible(text);
  if(flowReply&&!date)return free.buttons(phone,
   'Este calendario ya venció, se utilizó o la fecha no es válida. Vuelve a abrirlo para seleccionar otra fecha.',
   [{id:'FECHA_REINTENTAR',title:'Abrir calendario'},{id:'FECHA_MANUAL',title:'Escribir fecha'},{id:'MENU',title:'Menú'}]);
  if(!date||date<=today()||new Date(date+'T12:00:00Z')-new Date(today()+'T12:00:00Z')>365*86400000)
   return free.buttons(phone,'Selecciona una fecha válida desde mañana y dentro de los próximos 365 días.',
    [{id:'FECHA_REINTENTAR',title:'Abrir calendario'},{id:'FECHA_MANUAL',title:'Escribir fecha'},{id:'MENU',title:'Menú'}]);
  // El completion consume el token; no confiar en pantallas antiguas.
  if(flowReply)await save(phone,'FECHA',{});
  try{
   const info=await api('publico/fechas?desde='+date+'&hasta='+date);
   if(!info.disponibilidadVerificada)return free.buttons(phone,'No se pudo verificar la disponibilidad completa. No se ha reservado ninguna fecha.',
    [{id:'FECHA_REINTENTAR',title:'Abrir calendario'},{id:'FECHA_MANUAL',title:'Escribir fecha'},{id:'MENU',title:'Menú'}]);
   if(info.ocupadas?.some(r=>r.fecha===date))return free.buttons(phone,'❌ La fecha '+date+' ya no está disponible. Selecciona otra fecha.',
    [{id:'FECHA_REINTENTAR',title:'Abrir calendario'},{id:'FECHA_MANUAL',title:'Escribir fecha'},{id:'MENU',title:'Menú'}]);
   // Reconocimiento automático: no pedir calle/casa si el WhatsApp
   // corresponde a un usuario registrado. Sin login HTTPS, nunca revelar
   // adeudos, identidad ni datos personales de ninguna vivienda.
   const auth=await vinculos.verificar(phone);
   if(auth)return mostrarReglamentoAuto(phone,{date});
   const match=await identidad.reconocer(phone);
   if(match.tipo!=='desconocido'){
    return privateFlow.enlace(phone,'REGLAMENTO_AUTO',{date});
   }
   const streets=(await api('publico/domicilios')).opciones||[];
   if(!streets.length)throw Error('Sin catálogo de calles');
   await save(phone,'CALLE',{date,streets});
   return free.list(phone,'✅ '+date+' aparece disponible. Selecciona tu calle:',
    'Elegir calle',streets.slice(0,10).map((x,i)=>({id:'CALLE_'+i,title:x})));
  }catch(e){return free.buttons(phone,'No pude comprobar la disponibilidad de esa fecha. Inténtalo de nuevo.',
    [{id:'FECHA_REINTENTAR',title:'Abrir calendario'},{id:'FECHA_MANUAL',title:'Escribir fecha'},{id:'MENU',title:'Menú'}]);}
 }
 if(s.state==='CALLE'){
  const options=s.ctx.streets||[];
  const index=/^CALLE_(\d+)$/.exec(word);
  const street=index?options[Number(index[1])]:/^\d{1,2}$/.test(text)?options[Number(text)-1]:options.find(x=>norm(x)===word);
  if(!street)return free.list(phone,'Selecciona una calle de la lista:', 'Elegir calle',
   options.slice(0,10).map((x,i)=>({id:'CALLE_'+i,title:x})));
  await save(phone,'CASA',{date:s.ctx.date,street});
  return send(phone,'Seleccionaste *'+street+'*. ¿Cuál es el número de tu casa?');
 }
 if(s.state==='CASA'){
  if(!/^[\w -]{1,20}$/.test(text))return send(phone,'Escribe el número de casa válido.');
  try{
   const houses=(await api('publico/domicilios?calle='+encodeURIComponent(s.ctx.street))).opciones||[];
   if(!houses.some(x=>norm(x)===word))return send(phone,'Verifica el número de vivienda indicado.');
   const {Op}=require('sequelize');
   const {Casa}=require('../models');
   const found=await Casa.findAll({where:{numero:text,
     [Op.or]:[{calle:s.ctx.street},{calleCorrecta:s.ctx.street}]},attributes:['id'],limit:2});
   if(found.length!==1)return send(phone,'No se pudo verificar esa vivienda. Revisa los datos con Administración.');
   const ctx={date:s.ctx.date,street:s.ctx.street,house:text,casaId:Number(found[0].id)};
   return mostrarReglamento(phone,ctx);
  }catch(e){return send(phone,'No pude comprobar esa vivienda. Intenta de nuevo más tarde.');}
 }
 if(s.state==='REGLAMENTO'){
  const auth=await vinculos.verificar(phone,s.ctx.casaId);
  if(!auth)return privateFlow.enlace(phone,'REGLAMENTO',s.ctx);
  if(s.ctx.reglamentoVersion!==REGLAMENTO_VERSION)return mostrarReglamento(phone,s.ctx);
  if(word!=='CLUB_ACEPTAR'&&word!=='ACEPTO')return mostrarReglamento(phone,s.ctx);
  if(!auth.correo||!auth.nombre)
   return send(phone,'Actualiza el nombre y correo de tu cuenta en el portal antes de solicitar Casa Club.');
  try{
   const result=await api('publico/solicitudes',{
    fecha:s.ctx.date,calle:s.ctx.street,numero:s.ctx.house,solicitante:auth.nombre,
    correo:auth.correo,telefono:/^521\d{10}$/.test(phone)?'52'+phone.slice(3):phone,
    propietario:false,motivo:'Solicitud de cuenta vinculada desde WhatsApp',aceptaReglamento:true
   });
   await save(phone,'PAGO_CLUB',{id:result.data?.id,casaId:auth.casaId,date:s.ctx.date});
   return free.buttons(phone,'🟡 *Reserva apartada provisionalmente.* Enviamos los datos de transferencia y el enlace privado al correo registrado de la cuenta vinculada con esta vivienda. La reservación solo se confirma al validar el banco.',
    [{id:'PAGO_SUBIR',title:'Subir comprobante'},{id:'MENU',title:'Menú'}]);
  }catch(e){
   // Nunca devolver motivos de deuda o datos de una reservación personal.
   return free.buttons(phone,'No se pudo completar la solicitud. Verifica tu cuenta y el calendario o consulta a Administración.',
    [{id:'MENU_RESERVAR',title:'Otra fecha'},{id:'MENU',title:'Menú'}]);
  }
 }
 if(s.state==='PAGO_CLUB'||s.state==='REVISION_CLUB'){
  const auth=await vinculos.verificar(phone,s.ctx.casaId);
  const ctx={tipo:'CASA_CLUB',reservaId:s.ctx.id,casaId:s.ctx.casaId};
  if(!auth)return privateFlow.enlace(phone,'PAGO_COMPROBANTE',ctx);
  if(word==='PAGO_SUBIR'||t==='image'){
   await save(phone,'PAGO_COMPROBANTE',ctx);
   return t==='image'?privateFlow.subir(phone,{ctx},message):privateFlow.pedirComprobante(phone);
  }
  return free.buttons(phone,'Tu solicitud continúa pendiente de pago o revisión bancaria. Puedes subir el comprobante desde aquí cuando estés listo.',
   [{id:'PAGO_SUBIR',title:'Subir comprobante'},{id:'MENU',title:'Menú'}]);
 }

 await save(phone,'MENU',{});return mostrarMenu(phone);
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
 const delivered=await send(phone,'✅ *¡Reservación de Casa Club confirmada!*'+
  '\nFolio: '+x.folio+'\nFecha: '+x.fecha+
  '\nTitan confirmó el depósito. Tu solicitud ha quedado completada.');
 if(!delivered)return false;
 await save(phone,'MENU',{});
 return true;
}
module.exports={handle,send,load,save,status,notifyIfConfirmed,dateISO:fechaFlexible,MENU,mostrarMenu,mostrarReglamento,mostrarReglamentoAuto};
