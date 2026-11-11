const correo=require('./email.service');

const emailValido=value=>/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
function whatsappMexico(value){
 const numero=value.replace(/[\s()+-]/g,'');
 return /^\d{10}$/.test(numero)?'52'+numero:/^52\d{10}$/.test(numero)?numero:null;
}
function datosBancarios(env=process.env){
 const banco=env.CASA_CLUB_BANCO?.trim(),titular=env.CASA_CLUB_TITULAR?.trim();
 const cuenta=env.CASA_CLUB_CUENTA?.trim();
 if(!banco||!titular||!/^\d{10,18}$/.test(cuenta||''))
  throw Object.assign(Error('Configura los datos bancarios de Casa Club para preparar las instrucciones.'),{status:503});
 const correo=env.CASA_CLUB_ADMIN_CORREO?.trim()||'';
 return {banco,titular,cuenta,administracion:emailValido(correo)?correo:null};
}
function configuracion(env=process.env){
 const dias=Number(env.CASA_CLUB_PLAZO_DIAS||3);
 const banco=env.CASA_CLUB_BANCO?.trim(),titular=env.CASA_CLUB_TITULAR?.trim();
 const cuenta=env.CASA_CLUB_CUENTA?.trim(),administracion=env.CASA_CLUB_ADMIN_CORREO?.trim()||'';
 const nombrePlantilla=env.CASA_CLUB_WHATSAPP_TEMPLATE?.trim()||'';
 const idioma=env.CASA_CLUB_WHATSAPP_IDIOMA||'es_MX';
 const version=env.WHATSAPP_GRAPH_VERSION;
 if(!Number.isInteger(dias)||dias<1||dias>30||!banco||!titular||!/^\d{10,18}$/.test(cuenta||'')||
    !emailValido(administracion)||!/^[a-z0-9_]+$/.test(nombrePlantilla)||!/^v\d+\.\d+$/.test(version||'')||
    !/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID||'')||!env.WHATSAPP_ACCESS_TOKEN||
    !['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','SMTP_FROM_EMAIL'].every(k=>env[k])){
  throw Object.assign(Error('Las solicitudes en línea no están disponibles en este momento. Contacta a Administración.'),{status:503});
 }
 return {dias,banco,titular,cuenta,administracion,nombrePlantilla,idioma,version,
  telefonoId:env.WHATSAPP_PHONE_NUMBER_ID,token:env.WHATSAPP_ACCESS_TOKEN};
}
const sumarDias=(fecha,dias)=>new Date(Date.parse(fecha+'T12:00:00Z')+dias*86400000).toISOString().slice(0,10);
function limitePago(hoy,fecha,dias){
 return [sumarDias(hoy,dias),sumarDias(fecha,-1)].sort()[0];
}
const importe=row=>Number(row.cuotaRecuperacion)+Number(row.depositoGarantia)+Number(row.limpieza);
const moneda=n=>n.toLocaleString('es-MX',{style:'currency',currency:'MXN'});
function instrucciones(row,config){
 return {folio:'CC-'+row.id,fecha:row.fecha,monto:importe(row),
  cuotaRecuperacion:Number(row.cuotaRecuperacion),depositoGarantia:Number(row.depositoGarantia),limpieza:Number(row.limpieza),
  fechaLimitePago:row.fechaLimitePago,
  banco:config.banco,titular:config.titular,cuenta:config.cuenta,correoAdministracion:config.administracion};
}
function textoPago(datos){
 const plazo=datos.fechaLimitePago?', a más tardar el '+datos.fechaLimitePago+' (hora de Guadalajara)':'';
 const destino=datos.correoAdministracion?' a '+datos.correoAdministracion:' a Administración';
 return 'Solicitud '+datos.folio+' para el '+datos.fecha+'. La reserva queda confirmada al verificar el pago.\n\n'+
  'Total a depositar: '+moneda(datos.monto)+' (recuperación '+moneda(datos.cuotaRecuperacion)+
  ', garantía '+moneda(datos.depositoGarantia)+', limpieza '+moneda(datos.limpieza)+').\n'+
  'Deposita '+moneda(datos.monto)+' en '+datos.banco+', cuenta/CLABE '+datos.cuenta+
  ', a nombre de '+datos.titular+plazo+'.\n'+
  'Envía tu comprobante'+destino+' con el folio '+datos.folio+'.'+
  (plazo?' Si no se confirma el pago antes del vencimiento, se libera la fecha.':'');
}
async function whatsapp(row,datos,config){
 const response=await fetch('https://graph.facebook.com/'+config.version+'/'+config.telefonoId+'/messages',{
  method:'POST',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},
  signal:AbortSignal.timeout(10000),
  body:JSON.stringify({messaging_product:'whatsapp',to:row.telefono,type:'template',template:{
   name:config.nombrePlantilla,language:{code:config.idioma},
   components:[{type:'body',parameters:[datos.folio,datos.fecha,
    moneda(datos.monto)+' (recuperación '+moneda(datos.cuotaRecuperacion)+', garantía '+moneda(datos.depositoGarantia)+', limpieza '+moneda(datos.limpieza)+')',
    datos.banco,datos.cuenta,datos.titular,
    datos.fechaLimitePago,datos.correoAdministracion].map(text=>({type:'text',text}))}]
  }})
 });
 if(!response.ok||!(await response.json()).messages?.[0]?.id)throw Error('WhatsApp no aceptó la notificación');
}
async function notificar(row,datos,config){
 const fechaSolicitud=new Date(row.creadoEn||new Date()).toLocaleString('es-MX',{
  timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'});
 const resultados=await Promise.allSettled([
  correo.enviarAvisoCasaClub({destinatario:row.correo,asunto:'Apartado de Casa Club · '+datos.folio,texto:textoPago(datos)}),
  whatsapp(row,datos,config),
  correo.enviarAvisoCasaClub({destinatario:config.administracion,asunto:'Solicitud de Casa Club · '+datos.folio,
   texto:'Nueva solicitud recibida: '+fechaSolicitud+' (Guadalajara).\nSolicitante: '+row.solicitante+
    '\nVivienda ID: '+row.casaId+'\nWhatsApp: '+row.telefono+'\nCorreo: '+row.correo+
    '\nFecha solicitada: '+datos.fecha+' ('+datos.folio+').\nRecuperación: '+moneda(datos.cuotaRecuperacion)+
    '\nGarantía: '+moneda(datos.depositoGarantia)+'\nLimpieza: '+moneda(datos.limpieza)+
    '\nTotal: '+moneda(datos.monto)+
    '\nFecha límite: '+datos.fechaLimitePago+'\nRevisa la solicitud en Casa Club → Aprobación de reservas.'})
 ]);
 const estados={};
 ['correo','whatsapp','administracion'].forEach((canal,i)=>{
  estados[canal]=resultados[i].status==='fulfilled';
  if(!estados[canal])console.warn('[casa-club] Aviso no aceptado:',canal,datos.folio);
 });
 return estados;
}
module.exports={configuracion,datosBancarios,textoPago,emailValido,whatsappMexico,limitePago,importe,instrucciones,notificar};
