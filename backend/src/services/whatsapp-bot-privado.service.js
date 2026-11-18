'use strict';
const {createHash}=require('node:crypto');
const {Op}=require('sequelize');
const {Casa}=require('../models');
const identidad=require('./whatsapp-bot-identidad.service');
const db=require('../config/database');
const {ReservaCasaClub}=require('../models');
const {estadoCargos}=require('./cargos-extraordinarios.service');
const {fechaISO}=require('./whatsapp-bot-fechas.service');
const {reconocerImagen}=require('./comprobante-lector.service');
const parser=require('./comprobante-parser');
const links=require('./whatsapp-bot-vinculos.service');
const free=require('./whatsapp-presupuesto-cero.service');
const say=(p,t)=>free.send(p,t);
const buttons=(p,t,items)=>free.buttons(p,t,items);
const list=(p,t,items)=>free.list(p,t,'Seleccionar',items);
const save=(p,s,c)=>require('./whatsapp-bot-flujo.service').save(p,s,c);
const volver=[{id:'MENU',title:'Menú'}];
const authFor=(phone,ctx={})=>links.verificar(phone,ctx.casaId||null);
async function enlace(phone,next,ctx={}){
 const url=await links.enlace(phone);
 await save(phone,'ESPERANDO_VINCULO',{next,...ctx});
 return buttons(phone,'🔐 Para este trámite inicia sesión de forma segura en:\n'+url+
  '\n\nEscribe tu correo (mayúsculas o minúsculas) y tu contraseña exacta SOLO en esa página HTTPS, nunca en el chat. El enlace vence en 10 minutos.',
  [{id:'VINCULO_CONTINUAR',title:'Ya ingresé'},...volver]);
}
async function callesPublicas(){
 const url=new URL('/api/casa-club/publico/domicilios',
  process.env.APP_BASE_URL||'https://api-misionjardines.listoenlinea.host');
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('No se pudo cargar el catálogo público');
 const datos=await response.json();
 if(datos?.ok!==true||!Array.isArray(datos.opciones))throw Error('Catálogo no disponible');
 return datos.opciones.filter(x=>typeof x==='string'&&x.length<=100);
}
async function domicilioDesconocido(phone,next){
 // Una persona sin número registrado primero indica la dirección, pero
 // nunca puede ver información privada ni registrar una visita hasta autenticarse.
 const calles=await callesPublicas();
 if(!calles.length)return say(phone,'La identificación de viviendas no está disponible. Consulta a Administración.');
 await save(phone,'IDENTIFICAR_CALLE',{next,calles});
 return list(phone,'No encontramos un número asociado a una cuenta activa. Selecciona tu calle y después verifica tu identidad para continuar:',
  calles.slice(0,10).map((calle,i)=>({id:'IDENT_CALLE_'+i,title:calle})));
}
async function empezar(phone,kind){
 const auth=await links.verificar(phone);
 if(auth)return continuar(phone,{next:kind},auth);
 const found=await identidad.reconocer(phone);
 if(found.tipo==='desconocido')return domicilioDesconocido(phone,kind);
 // Número registrado: se omite calle y número, se solicita únicamente
 // vinculación HTTPS (si ya expiró). Una coincidencia telefónica NO autoriza.
 return enlace(phone,kind,found.tipo==='unico'?{casaId:found.casaId}:{});
}
async function continuar(phone,ctx,auth){
 if(ctx.next==='REGLAMENTO')return require('./whatsapp-bot-flujo.service').mostrarReglamento(phone,ctx);
 if(ctx.next==='ADEUDOS')return deudas(phone,auth);
 if(ctx.next==='PAGO_TIPO')return pagoTipos(phone);
 if(ctx.next==='VISITA_NOMBRE')return visitas(phone,auth);
 if(ctx.next==='PAGO_COMPROBANTE'){
  await save(phone,'PAGO_COMPROBANTE',ctx);
  return pedirComprobante(phone);
 }
 return require('./whatsapp-bot-flujo.service').mostrarMenu(phone);
}
async function manejarVinculacion(phone,s,word){
 if(word==='VINCULO_REENVIAR')return enlace(phone,s.ctx.next,s.ctx);
 if(['CONTINUAR','VINCULO_CONTINUAR','YA INGRESE','YA INGRESÉ'].includes(word)){
  const auth=await authFor(phone,s.ctx);
  if(auth)return continuar(phone,s.ctx,auth);
 }
 return buttons(phone,'Todavía falta confirmar la vinculación con una cuenta autorizada. Si el enlace venció, solicita uno nuevo.',
  [{id:'VINCULO_CONTINUAR',title:'Ya ingresé'},{id:'VINCULO_REENVIAR',title:'Nuevo enlace'},...volver]);
}
async function deudas(phone,auth){
 const {deudaPdf}=require('./whatsapp-bot-pdf.service');
 const pdf=await deudaPdf(auth);
 const entregado=await free.document(phone,pdf.buffer,'Estado_adeudos_Mision_Jardines.pdf',
  'Estado de adeudos privado de tu vivienda');
 if(!entregado)return false;
 await save(phone,'MENU',{});
 return buttons(phone,'✅ Te envié tu estado de adeudos en PDF. Los comprobantes en revisión no son pagos confirmados.',
  [{id:'MENU_PAGOS',title:'Reportar pago'},...volver]);
}
async function pagoTipos(phone){
 await save(phone,'PAGO_TIPO',{});
 return buttons(phone,'Selecciona el tipo de comprobante que deseas registrar:',
 [{id:'PAGO_MANT',title:'Mantenimiento'},{id:'PAGO_PROYECTO',title:'Proyectos'},
 {id:'PAGO_CLUB_TIPO',title:'Casa Club'}]);
}
const pedirComprobante=phone=>buttons(phone,'📎 Envía una foto JPG/PNG legible (máximo 900 KB). Puedes regresar a esta opción incluso si cerraste WhatsApp o el bot reinició.\nEl comprobante quedará EN REVISIÓN hasta la conciliación con Titan.',
 [{id:'PAGO_SUBIR',title:'Subir comprobante'},...volver]);
async function proyectos(phone,auth,page=0){
 const cargos=(await estadoCargos(auth.casaId)).filter(x=>Number(x.montoDisponible)>0);
 if(!cargos.length)return buttons(phone,'No hay cargos de proyectos disponibles para registrar.',volver);
 const start=page*9,items=cargos.slice(start,start+9).map(x=>({
  id:'CARGO_'+x.id,title:String(x.concepto||'Proyecto').slice(0,24),
  description:'Concepto de proyecto '+x.id
 }));
 if(cargos.length>start+9)items.push({id:'CARGOS_MAS_'+(page+1),title:'Más proyectos'});
 await save(phone,'PAGO_PROYECTOS',{casaId:auth.casaId});
 return list(phone,'Selecciona el proyecto de tu comprobante:',items);
}
async function casaClubPago(phone,auth){
 const rows=await ReservaCasaClub.findAll({where:{casaId:auth.casaId,
  estatus:{[Op.in]:['PENDIENTE','APROBADA']},pagado:false,
  fechaBloqueada:{[Op.ne]:null}},attributes:['id'],order:[['id','DESC']],limit:10});
 if(!rows.length)return buttons(phone,'No hay una solicitud vigente de Casa Club disponible para adjuntar comprobante.',
  [{id:'MENU_RESERVAR',title:'Reservar Casa Club'},...volver]);
 if(rows.length===1){
  await save(phone,'PAGO_COMPROBANTE',{tipo:'CASA_CLUB',reservaId:rows[0].id,casaId:auth.casaId});
  return pedirComprobante(phone);
 }
 await save(phone,'PAGO_RESERVAS',{casaId:auth.casaId});
 return list(phone,'Elige tu solicitud de Casa Club (cuenta verificada):',
  rows.map(x=>({id:'RESERVA_'+x.id,title:'Solicitud CC-'+x.id})));
}
async function getImage(id){
 if(!/^\d{5,32}$/.test(String(id||'')))throw Error('Adjunto inválido');
 const headers={Authorization:'Bearer '+process.env.WHATSAPP_ACCESS_TOKEN};
 const meta=await fetch('https://graph.facebook.com/'+process.env.WHATSAPP_GRAPH_VERSION+'/'+id,
  {headers,signal:AbortSignal.timeout(10000)});
 if(!meta.ok)throw Error('Meta no entregó datos de la foto');
 const info=await meta.json();
 if(!['image/jpeg','image/png','image/webp'].includes(info.mime_type)||Number(info.file_size)>900000)
  throw Error('Se requiere una foto JPG/PNG menor a 900 KB. Para PDF usa el portal de Pagos.');
 const url=new URL(info.url);
 if(url.origin!=='https://lookaside.fbsbx.com')throw Error('Origen de archivo inesperado');
 const data=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
 if(!data.ok)throw Error('No fue posible descargar la foto');
 const buffer=Buffer.from(await data.arrayBuffer());
 if(!buffer.length||buffer.length>900000)throw Error('Foto demasiado grande');
 return 'data:'+info.mime_type+';base64,'+buffer.toString('base64');
}
async function registrar(auth,body){
 const url=new URL(process.env.APP_BASE_URL||'https://api-misionjardines.listoenlinea.host');
 const req={body,usuario:{rol:'CONDOMINO',usuarioId:auth.usuarioId,casaId:auth.casaId},
  headers:{host:url.host},get:()=>url.host,protocol:'https'};
 const res={statusCode:200,data:null,status(code){this.statusCode=code;return this;},
  json(data){this.data=data;return this;}};
 await require('../controllers/pagos.controller').reportarPago(req,res);
 if(res.statusCode>=400||res.data?.ok!==true)
  throw Error(String(res.data?.message||'No se pudo registrar el pago').slice(0,220));
 return res.data.data;
}
async function subir(phone,s,message){
 const auth=await authFor(phone,s.ctx);
 if(!auth)return enlace(phone,'PAGO_COMPROBANTE',s.ctx);
 if(message.type!=='image')
  return say(phone,'Envía una foto JPG/PNG. Para archivos PDF utiliza el portal autenticado.');
 try{
  const image=await getImage(message.image?.id);
  const fields=parser.extract(await reconocerImagen(image));
  if(!fields.date||!fields.time||!fields.amount)
   throw Error('No pude leer correctamente el monto, la fecha y la hora');
  const folio=fields.claveRastreo||fields.folio||fields.referencia||
    'SINREF-'+createHash('sha256').update(message.id).digest('hex').slice(0,20);
  const tipo=s.ctx.tipo;
  const result=await registrar(auth,{
   tipoPago:tipo,folioOperacion:folio,fechaOperacion:fields.date,
   horaOperacion:fields.time,monto:Number(fields.amount),
   comprobanteData:image,comprobanteNombre:'WhatsApp.jpg',
   comprobanteMime:image.slice(5,image.indexOf(';')),
   ...(tipo==='EXTRAORDINARIO'?{cargoExtraordinarioId:s.ctx.cargoId}:{}),
   ...(tipo==='CASA_CLUB'?{reservaCasaClubId:s.ctx.reservaId}:{})
  });
  if(result?.id)await db.query(
   'INSERT IGNORE INTO whatsapp_bot_pagos (pago_id,remitente,usuario_id,casa_id) VALUES(:id,:phone,:user,:house)',
   {replacements:{id:result.id,phone,user:auth.usuarioId,house:auth.casaId}}
  );
  await save(phone,'PAGO_TIPO',{});
  return buttons(phone,'✅ Comprobante registrado EN REVISIÓN. Titan debe confirmar el depósito antes de aprobarlo. Cuando se acredite, se enviará el recibo si la conversación sigue abierta.',
   [{id:'MENU_PAGOS',title:'Otro pago'},...volver]);
 }catch(e){
  return buttons(phone,'No pude registrar el comprobante: '+String(e.message||'Error de registro').slice(0,220)+
   '\nEl pago NO está acreditado. Puedes volver a intentar sin transferir de nuevo.',
   [{id:'PAGO_SUBIR',title:'Reintentar'},...volver]);
 }
}
async function visitas(phone,auth){
 await save(phone,'VISITA_NOMBRE',{casaId:auth.casaId});
 return say(phone,'🚗 Escribe el nombre completo de la persona que deseas registrar como visitante.');
}
async function registrarVisita(phone,s){
 const auth=await authFor(phone,s.ctx);
 if(!auth)return enlace(phone,'VISITA_NOMBRE',{casaId:s.ctx.casaId});
 const req={usuario:{rol:'CONDOMINO',usuarioId:auth.usuarioId,casaId:auth.casaId},
  body:{nombreVisitante:s.ctx.nombre,autorizadoPor:auth.nombre,
   fechaProgramada:s.ctx.fecha,horaProgramada:s.ctx.hora||null,tipo:s.ctx.tipo}};
 const res={statusCode:200,data:null,status(code){this.statusCode=code;return this;},
  json(data){this.data=data;return this;}};
 await require('../controllers/visitas.controller').create(req,res);
 if(res.statusCode>=400||res.data?.ok!==true)
  return buttons(phone,'No fue posible registrar la visita.',volver);
 await save(phone,'MENU',{});
 return buttons(phone,'✅ Visita registrada en Seguridad. Código: '+String(res.data.data?.codigo||'No disponible'),
  [{id:'MENU_VISITAS',title:'Otra visita'},...volver]);
}
async function manejar(phone,s,word,text,message){
 if(s.state==='IDENTIFICAR_CALLE'){
  const options=s.ctx.calles||[];
  const picked=/^IDENT_CALLE_(\d+)$/.exec(word);
  const calle=picked?options[Number(picked[1])]:options.find(x=>
   String(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()===word);
  if(!calle)return list(phone,'Elige una calle de la lista:',
   options.slice(0,10).map((x,i)=>({id:'IDENT_CALLE_'+i,title:x})));
  await save(phone,'IDENTIFICAR_CASA',{next:s.ctx.next,calle});
  return say(phone,'Escribe el número de tu casa. Después verificaremos que tengas permiso para gestionarla.');
 }
 if(s.state==='IDENTIFICAR_CASA'){
  if(!/^[a-zA-Z0-9 -]{1,20}$/.test(text))
   return say(phone,'Escribe un número de vivienda válido.');
  const rows=await Casa.findAll({where:{numero:text,
   [Op.or]:[{calle:s.ctx.calle},{calleCorrecta:s.ctx.calle}]},
   attributes:['id'],limit:2});
  if(rows.length!==1)return say(phone,'No se pudo identificar esa vivienda. Verifica los datos con Administración.');
  return enlace(phone,s.ctx.next,{casaId:Number(rows[0].id)});
 }
 if(s.state==='ESPERANDO_VINCULO')return manejarVinculacion(phone,s,word);
 if(s.state==='PAGO_TIPO'){
  const auth=await links.verificar(phone);
  if(!auth)return enlace(phone,'PAGO_TIPO');
  if(word==='PAGO_MANT'||word==='MANTENIMIENTO'){
   await save(phone,'PAGO_COMPROBANTE',{tipo:'MANTENIMIENTO',casaId:auth.casaId});
   return pedirComprobante(phone);
  }
  if(word==='PAGO_PROYECTO'||word==='PROYECTOS')return proyectos(phone,auth);
  if(word==='PAGO_CLUB_TIPO'||word==='CASA CLUB')return casaClubPago(phone,auth);
  return pagoTipos(phone);
 }
 if(s.state==='PAGO_PROYECTOS'){
  const auth=await authFor(phone,s.ctx);
  if(!auth)return enlace(phone,'PAGO_TIPO');
  const choice=/^CARGO_(\d+)$/.exec(word);
  if(choice){
   const cargos=await estadoCargos(auth.casaId);
   if(!cargos.some(x=>String(x.id)===choice[1]&&Number(x.montoDisponible)>0))
    return proyectos(phone,auth);
   await save(phone,'PAGO_COMPROBANTE',{tipo:'EXTRAORDINARIO',cargoId:Number(choice[1]),casaId:auth.casaId});
   return pedirComprobante(phone);
  }
  const page=/^CARGOS_MAS_(\d+)$/.exec(word);
  return proyectos(phone,auth,page?Number(page[1]):0);
 }
 if(s.state==='PAGO_RESERVAS'){
  const auth=await authFor(phone,s.ctx);
  if(!auth)return enlace(phone,'PAGO_TIPO');
  const choice=/^RESERVA_(\d+)$/.exec(word);
  if(!choice)return casaClubPago(phone,auth);
  const row=await ReservaCasaClub.findOne({where:{id:Number(choice[1]),casaId:auth.casaId,
   estatus:{[Op.in]:['PENDIENTE','APROBADA']},pagado:false,fechaBloqueada:{[Op.ne]:null}}});
  if(!row)return casaClubPago(phone,auth);
  await save(phone,'PAGO_COMPROBANTE',{tipo:'CASA_CLUB',reservaId:row.id,casaId:auth.casaId});
  return pedirComprobante(phone);
 }
 if(s.state==='PAGO_COMPROBANTE'){
  if(!await authFor(phone,s.ctx))return enlace(phone,'PAGO_COMPROBANTE',s.ctx);
  return message.type==='image'?subir(phone,s,message):pedirComprobante(phone);
 }
 if(s.state==='VISITA_NOMBRE'){
  const auth=await authFor(phone,s.ctx);
  if(!auth)return enlace(phone,'VISITA_NOMBRE',s.ctx);
  if(text.length<3||text.length>150)return say(phone,'Escribe un nombre de visitante válido.');
  await save(phone,'VISITA_TIPO',{...s.ctx,nombre:text});
  return list(phone,'Selecciona tipo de visitante:',
   ['FAMILIAR','AMISTAD','PROVEEDOR','SERVICIO','REPARTIDOR','OTRO']
    .map(x=>({id:'VISITA_'+x,title:x.charAt(0)+x.slice(1).toLowerCase()})));
 }
 if(s.state==='VISITA_TIPO'){
  const type=/^VISITA_(FAMILIAR|AMISTAD|PROVEEDOR|SERVICIO|REPARTIDOR|OTRO)$/.exec(word);
  if(!type)return say(phone,'Selecciona el tipo de visita desde la lista.');
  await save(phone,'VISITA_FECHA',{...s.ctx,tipo:type[1]});
  return say(phone,'¿Qué día llegará? Escribe 20/11/2026 o 20 de noviembre de 2026.');
 }
 if(s.state==='VISITA_FECHA'){
  const date=fechaISO(text);
  const hoy=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const days=(Date.parse(date+'T12:00:00Z')-Date.parse(hoy+'T12:00:00Z'))/86400000;
  if(!date||!Number.isFinite(days)||days<0||days>90)return say(phone,'Escribe una fecha válida dentro de los próximos 90 días.');
  await save(phone,'VISITA_HORA',{...s.ctx,fecha:date});
  return buttons(phone,'Escribe la hora aproximada de llegada (HH:MM), o elige Sin hora.',
   [{id:'VISITA_SIN_HORA',title:'Sin hora'},...volver]);
 }
 if(s.state==='VISITA_HORA'){
  const hour=word==='VISITA_SIN_HORA'||word==='OMITIR'?'':text;
  if(hour&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(hour))
   return say(phone,'Escribe una hora HH:MM, por ejemplo 14:30.');
  await save(phone,'VISITA_CONFIRMAR',{...s.ctx,hora:hour});
  return buttons(phone,'Confirma que autorizas a '+s.ctx.nombre+' para ingresar el '+s.ctx.fecha+'.',
   [{id:'VISITA_GUARDAR',title:'Confirmar visita'},...volver]);
 }
 if(s.state==='VISITA_CONFIRMAR'){
  if(word==='VISITA_GUARDAR')return registrarVisita(phone,s);
  return buttons(phone,'Confirma la autorización desde el botón.',
   [{id:'VISITA_GUARDAR',title:'Confirmar visita'},...volver]);
 }
 return null;
}
module.exports={enlace,empezar,continuar,manejar,pedirComprobante,subir};
