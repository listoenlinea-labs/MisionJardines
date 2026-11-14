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
 const dias=1; // El plazo de Casa Club no admite prolongación a tres días.
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
function limitePago(hoy,fecha,_dias){
 // Día natural completo siguiente (hasta 23:59 en Guadalajara);
 // nunca exceder la víspera del evento para solicitudes urgentes.
 return [sumarDias(hoy,1),sumarDias(fecha,-1)].sort()[0];
}
const MESES=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
function fechaVisible(value){
 const date=String(value||''),match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
 return match?match[3]+'-'+MESES[Number(match[2])-1]+'-'+match[1]:date;
}
const importe=row=>Number(row.cuotaRecuperacion)+Number(row.depositoGarantia)+Number(row.limpieza);
const moneda=n=>Number(n||0).toLocaleString('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:0,maximumFractionDigits:0});
function instrucciones(row,config){
 return {folio:'CC-'+row.id,fecha:row.fecha,monto:importe(row),
  cuotaRecuperacion:Number(row.cuotaRecuperacion),depositoGarantia:Number(row.depositoGarantia),limpieza:Number(row.limpieza),
  fechaLimitePago:row.fechaLimitePago,
  conceptoTransferencia:cuentaOficial.conceptoVivienda(row.casa),
  banco:config.banco,titular:config.titular,cuenta:config.cuenta,
  clabe:config.clabe,tarjeta:config.tarjeta,correoAdministracion:config.administracion};
}
function textoPago(datos){
 const fecha=fechaVisible(datos.fecha),vence=fechaVisible(datos.fechaLimitePago);
 return [
  'MISIÓN JARDINES | SOLICITUD DE CASA CLUB',
  '',
  'Hemos recibido tu solicitud. La fecha queda apartada provisionalmente hasta confirmar el pago correspondiente.',
  '',
  'DETALLES DE LA RESERVACIÓN',
  'Folio: '+datos.folio,
  ...(datos.fechaSolicitud?['Fecha de solicitud: '+fechaVisible(datos.fechaSolicitud)]:[]),
  'Fecha del evento: '+fecha,
  'Vivienda: '+(datos.conceptoTransferencia||'Vivienda registrada'),
  'Estado: PENDIENTE DE PAGO Y VERIFICACIÓN',
  '',
  'IMPORTE A DEPOSITAR',
  'Recuperación: '+moneda(datos.cuotaRecuperacion),
  'Garantía: '+moneda(datos.depositoGarantia),
  'Limpieza: '+moneda(datos.limpieza),
  'TOTAL: '+moneda(datos.monto),
  '',
  'DATOS BANCARIOS OFICIALES',
  'Banco: '+datos.banco,
  'Titular: '+datos.titular,
  'Cuenta: '+datos.cuenta,
  ...(datos.clabe?['CLABE: '+datos.clabe]:[]),
  ...(datos.tarjeta?['Tarjeta: '+datos.tarjeta]:[]),
  'Concepto de transferencia: '+(datos.conceptoTransferencia||'CALLE Y NÚMERO'),
  '',
  'FECHA LÍMITE DE PAGO: '+vence+' a las 23:59 (hora de Guadalajara).',
  'Si al finalizar ese día el pago no se ha confirmado, la fecha se liberará automáticamente aunque el comprobante permanezca en revisión.',
  '',
  'CARGA DEL COMPROBANTE DE TU RESERVACIÓN',
  'El siguiente enlace privado corresponde exclusivamente a la fecha '+fecha+
    ' y a la vivienda '+(datos.conceptoTransferencia||'registrada')+':',
  datos.enlaceCarga||'Consulta tu enlace privado en el correo de confirmación.',
  '',
  'VER MIS RESERVACIONES POR ESTE CORREO',
  'Consulta las reservaciones anteriores y actuales del correo de esta solicitud, su estatus y el motivo si Administración rechazó alguna:',
  datos.enlaceMisReservas||'Consulta el enlace privado del correo de confirmación.',
  '',
  'Al abrir el enlace de comprobante verás el folio, la vivienda y la fecha de TU solicitud pendiente; ahí podrás adjuntar el archivo y consultar su estado.',
  'No compartas el enlace con otras personas.',
  '',
  'El envío de una captura no confirma el pago. La reservación se confirma únicamente con una validación bancaria o una verificación acreditada por Administración.',
  '',
  'Atentamente,',
  'Administración de Misión Jardines'
 ].join('\n');
}
const escaparHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
function htmlPago(datos){
 const x=escaparHtml,mon=n=>x(moneda(n));
 const fila=(nombre,valor,importante=false)=>
  '<tr><td style="padding:11px 13px;border-bottom:1px solid #edf1f3;color:#667487">'+x(nombre)+'</td>'+
  '<td style="padding:11px 13px;text-align:right;border-bottom:1px solid #edf1f3;color:#20374c;font-weight:'+(importante?'800':'650')+'">'+x(valor)+'</td></tr>';
 const tarjeta=(titulo,contenido)=>
  '<section style="margin:22px 0"><h2 style="font-size:14px;letter-spacing:.03em;color:#203850;margin:0 0 10px">'+x(titulo)+'</h2>'+
   '<table role="presentation" style="width:100%;border-collapse:collapse;background:#f8fafb;border:1px solid #e8ecf1;border-radius:12px">'+contenido+'</table></section>';
 return '<!doctype html><html lang="es"><body style="margin:0;padding:25px 12px;background:#f2f6f9;font-family:Arial,Helvetica,sans-serif;color:#2a3850">'+
  '<div style="margin:auto;max-width:640px;background:#fff;border:1px solid #e0e8ee;border-radius:18px;overflow:hidden">'+
   '<header style="background:#20374c;padding:27px 32px;color:#fff">'+
    '<div style="color:#f6a052;letter-spacing:.12em;font-size:12px;font-weight:bold">MISIÓN JARDINES · CASA CLUB</div>'+
    '<h1 style="font-size:24px;line-height:1.3;margin:12px 0 0">Solicitud de reservación recibida</h1>'+
    '<p style="font-size:13px;line-height:1.6;color:#d6e6eb;margin:10px 0 0">Tu fecha está apartada provisionalmente. Para confirmarla, necesitamos verificar el pago.</p>'+
   '</header><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse"><tr><td style="padding:26px 32px 28px;vertical-align:top">'+
    '<p style="font-size:14px;line-height:1.65">Conserva este correo para identificar tu reservación y consultar su comprobante. El enlace de abajo es <b>exclusivo para tu vivienda y fecha</b>.</p>'+
    tarjeta('RESERVACIÓN',
      fila('Folio',datos.folio,true)+
      (datos.fechaSolicitud?fila('Fecha de solicitud',fechaVisible(datos.fechaSolicitud)):'')+
      fila('Fecha del evento',fechaVisible(datos.fecha),true)+
      fila('Vivienda',datos.conceptoTransferencia||'Registrada')+
      fila('Estado','Pendiente de pago'))+
    tarjeta('DETALLE DEL DEPÓSITO',
      fila('Recuperación',moneda(datos.cuotaRecuperacion))+
      fila('Garantía',moneda(datos.depositoGarantia))+
      fila('Limpieza',moneda(datos.limpieza))+
      fila('TOTAL A PAGAR',moneda(datos.monto),true))+
    tarjeta('CUENTA OFICIAL DE DEPÓSITO',
      fila('Banco',datos.banco)+fila('Titular',datos.titular)+fila('Cuenta',datos.cuenta)+
      (datos.clabe?fila('CLABE',datos.clabe):'')+(datos.tarjeta?fila('Tarjeta',datos.tarjeta):'')+
      fila('Concepto',datos.conceptoTransferencia||'CALLE Y NÚMERO',true))+
    '<p style="background:#fff7ea;border:1px solid #f0dfbd;border-radius:12px;padding:14px;color:#83571c;line-height:1.5;font-size:13px">'+
      '<strong>Fecha límite:</strong> '+x(fechaVisible(datos.fechaLimitePago))+
      ' a las 23:59 (Guadalajara). Si no se confirma el pago, se libera la fecha incluso si el comprobante está en revisión.</p>'+
    '<div style="text-align:center;margin:25px 0">'+
      '<a href="'+x(datos.enlaceCarga||'#')+'" style="display:inline-block;vertical-align:middle;margin:6px;background:#d8741c;padding:14px 19px;border-radius:11px;color:#fff;font-size:14px;font-weight:bold;text-decoration:none">Subir comprobante de '+x(datos.folio)+'</a>'+
      '<a href="'+x(datos.enlaceMisReservas||'#')+'" style="display:inline-block;vertical-align:middle;margin:6px;border:1px solid #b9d0e5;background:#f0f7fd;padding:13px 19px;border-radius:11px;color:#284e73;font-size:14px;font-weight:bold;text-decoration:none">Ver mis reservaciones</a>'+
    '</div>'+
    '<p style="font-size:12px;line-height:1.65;color:#657488">El botón abre el expediente de tu solicitud y muestra la fecha y la vivienda antes de adjuntar el archivo. No compartas este enlace. La captura enviada no acredita por sí sola un depósito.</p>'+
   '</td></tr></table><footer style="padding:17px 32px;background:#f6f9fa;border-top:1px solid #ecf0f2;color:#69798a;font-size:12px">Administración de Misión Jardines</footer>'+
  '</div></body></html>';
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
 const fechaSolicitudDia=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City'}).format(row.creadoEn||new Date());
 const fechaSolicitud=new Date(row.creadoEn||new Date()).toLocaleString('es-MX',{
  timeZone:'America/Mexico_City',dateStyle:'medium',timeStyle:'short'});
 const resultados=await Promise.allSettled([
  correo.enviarAvisoCasaClub({destinatario:row.correo,asunto:'Misión Jardines | '+datos.folio+' | '+fechaVisible(datos.fecha),
   texto:textoPago({...datos,fechaSolicitud:fechaSolicitudDia}),
   html:htmlPago({...datos,fechaSolicitud:fechaSolicitudDia})}),
  Promise.resolve(false), // No enviar instrucciones al WhatsApp del residente.
  correo.enviarAvisoCasaClub({destinatario:config.administracion,asunto:'Solicitud de Casa Club · '+datos.folio+' · '+fechaVisible(datos.fecha),
   texto:'Nueva solicitud recibida: '+fechaSolicitud+' (Guadalajara).\nSolicitante: '+row.solicitante+
    '\nVivienda ID: '+row.casaId+'\nWhatsApp: '+row.telefono+'\nCorreo: '+row.correo+
    '\nFecha solicitada: '+fechaVisible(datos.fecha)+' ('+datos.folio+').\nRecuperación: '+moneda(datos.cuotaRecuperacion)+
    '\nGarantía: '+moneda(datos.depositoGarantia)+'\nLimpieza: '+moneda(datos.limpieza)+
    '\nTotal: '+moneda(datos.monto)+
    '\nFecha límite: '+fechaVisible(datos.fechaLimitePago)+' a las 23:59 (Guadalajara).\nRevisa la solicitud en Casa Club → Aprobación de reservas.'})
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
