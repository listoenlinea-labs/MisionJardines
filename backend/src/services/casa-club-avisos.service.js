const cuentaOficial=require('./pagos-cuenta-oficial.service');
const correo=require('./email.service');

const emailValido=value=>/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
function whatsappMexico(value){
 const numero=value.replace(/[\s()+-]/g,'');
 return /^\d{10}$/.test(numero)?'52'+numero:/^52\d{10}$/.test(numero)?numero:null;
}
function datosBancarios(env=process.env){
 const {banco,titular,cuenta,clabe,tarjeta}=cuentaOficial.obtener(env);
 if(!banco||!titular||!/^\d{10,18}$/.test(cuenta||''))
  throw Object.assign(Error('Configura los datos bancarios de Casa Club para preparar las instrucciones.'),{status:503});
 const correo=env.CASA_CLUB_ADMIN_CORREO?.trim()||'';
 return {banco,titular,cuenta,clabe,tarjeta,administracion:emailValido(correo)?correo:null};
}
function configuracion(env=process.env){
 const dias=Number(env.CASA_CLUB_PLAZO_DIAS||3);
 const {banco,titular,cuenta,clabe,tarjeta}=cuentaOficial.obtener(env);
 const administracion=env.CASA_CLUB_ADMIN_CORREO?.trim()||'';
 const nombrePlantilla=env.CASA_CLUB_WHATSAPP_TEMPLATE?.trim()||'';
 const idioma=env.CASA_CLUB_WHATSAPP_IDIOMA||'es_MX';
 const version=env.WHATSAPP_GRAPH_VERSION;
 // La solicitud y el comprobante no requieren WhatsApp, Meta ni SMTP.
 if(!Number.isInteger(dias)||dias<1||dias>30||!banco||!titular||!/^\d{10,18}$/.test(cuenta||'')){
  throw Object.assign(Error('No fue posible consultar el plazo o la cuenta oficial de depósito.'),{status:503});
 }
 return {dias,banco,titular,cuenta,clabe,tarjeta,administracion,nombrePlantilla,idioma,version,
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
  conceptoTransferencia:cuentaOficial.conceptoVivienda(row.casa),
  banco:config.banco,titular:config.titular,cuenta:config.cuenta,
  clabe:config.clabe,tarjeta:config.tarjeta,correoAdministracion:config.administracion};
}
function textoPago(datos){
 const plazo=datos.fechaLimitePago?', a más tardar el '+datos.fechaLimitePago+' (hora de Guadalajara)':'';
 const destino=datos.correoAdministracion?' a '+datos.correoAdministracion:' a Administración';
 return 'Solicitud '+datos.folio+' para el '+datos.fecha+'. La reserva queda confirmada al verificar el pago.\n\n'+
  'Total a depositar: '+moneda(datos.monto)+' (recuperación '+moneda(datos.cuotaRecuperacion)+
  ', garantía '+moneda(datos.depositoGarantia)+', limpieza '+moneda(datos.limpieza)+').\n'+
  'Realiza la transferencia a la CUENTA OFICIAL de Misión Jardines:\n'+
  'Banco: '+datos.banco+'\nTitular: '+datos.titular+'\nCuenta: '+datos.cuenta+
  (datos.clabe?'\nCLABE: '+datos.clabe:'')+(datos.tarjeta?'\nTarjeta: '+datos.tarjeta:'')+
  '\n'+(datos.conceptoTransferencia?'CONCEPTO OBLIGATORIO: '+datos.conceptoTransferencia+'\n':'')+
  'Importe: '+moneda(datos.monto)+plazo+'.\n'+
  'Para verificar tu depósito, sube el comprobante desde Casa Club sin iniciar sesión con este enlace personal: '+(datos.enlaceCarga||'Consulta el enlace en la página de solicitud')+'. No compartas este enlace: sirve para consultar el estado de esta reserva.'+
  (plazo?' Si no se confirma el pago antes del vencimiento, se libera la fecha.':'');
}
async function whatsapp(row,datos,config){
 const response=await fetch('https://graph.facebook.com/'+config.version+'/'+config.telefonoId+'/messages',{
  method:'POST',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},
  signal:AbortSignal.timeout(10000),
  body:JSON.stringify({messaging_product:'whatsapp',to:row.telefono,type:'template',template:{
   name:config.nombrePlantilla,language:{code:config.idioma},
   components:[{type:'body',parameters:[datos.folio,datos.fecha,
    moneda(datos.monto)+' (recuperación '+moneda(datos.cuotaRecuperacion)+', garantía '+moneda(datos.depositoGarantia)+', limpieza '+moneda(datos.limpieza)+')'+
     (datos.conceptoTransferencia?' · Concepto de transferencia: '+datos.conceptoTransferencia:''),
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
  Promise.resolve(false), // No enviar instrucciones al WhatsApp del residente.
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
  estados[canal]=resultados[i].status==='fulfilled'&&resultados[i].value!==false;
  if(!estados[canal]&&canal!=='whatsapp')console.warn('[casa-club] Aviso no aceptado:',canal,datos.folio);
 });
 return estados;
}
// Notificar sólo DESPUÉS del COMMIT bancario. No enviar ni comunicar una
// reservación aprobada mientras el comprobante esté En revisión.
async function notificarConfirmacionBancaria(data){
 const fecha=String(data.fecha||''),folio=String(data.folioReporte||'');
 const resumen='Reserva CC-'+data.id+' para el '+fecha+' confirmada automáticamente tras verificar el depósito con el banco.\n'+
  'Vivienda ID: '+data.casaId+'\nMonto confirmado: '+moneda(Number(data.monto))+
  '\nComprobante: '+folio+'\nFecha del depósito: '+data.fechaPago+
  '\nEl comprobante y el recibo están disponibles en Misión Jardines → Pagos; Administración puede consultarlos desde Casa Club.';
 const correos=[
  {destinatario:data.correo,asunto:'Casa Club · Tu reserva del '+fecha+' está confirmada',
   texto:'Hola '+String(data.solicitante||'')+'.\n'+resumen},
  {destinatario:process.env.CASA_CLUB_ADMIN_CORREO,
   asunto:'Casa Club · Pago validado automáticamente · CC-'+data.id,
   texto:resumen}
 ].filter(x=>emailValido(String(x.destinatario||'')));
 const resultados=await Promise.allSettled(correos.map(x=>correo.enviarAvisoCasaClub(x)));
 resultados.forEach((r,i)=>{
  if(r.status==='rejected')console.warn('[Casa Club] Aviso de confirmación SMTP no aceptado (destino '+(i===0?'residente':'Administración')+').');
 });
 return {intentos:correos.length,aceptados:resultados.filter(x=>x.status==='fulfilled').length};
}
module.exports={configuracion,datosBancarios,textoPago,emailValido,whatsappMexico,limitePago,importe,instrucciones,notificar,notificarConfirmacionBancaria};
