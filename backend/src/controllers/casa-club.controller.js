const {Op}=require('sequelize');
const Reserva=require('../models/ReservaCasaClub');
const {Casa,UsuarioCasa}=require('../models');
const db=require('../config/database');
const PagoReportado=require('../models/PagoReportado');
const PagoManualConcepto=require('../models/PagoManualConcepto');
const {randomUUID}=require('crypto');
const accesoPublico=require('../services/casa-club-acceso-publico.service');
const {consultarSoloMantenimiento}=require('../services/adeudos-comunidad.service');
const avisos=require('../services/casa-club-avisos.service');
const googleCasaClub=require('../services/casa-club-google-sync.service');
const tarifas=require('../services/casa-club-tarifas.service');
const tarjetasRojas=require('../services/casa-club-tarjetas-rojas.service');
const {plazoEfectivo}=require('../services/casa-club-plazo-efectivo.service');
const {ordenarCalles}=require('../services/direccion-sort.service');
const {evaluarElegibilidadReserva}=require('../services/elegibilidad-casa-club.service');
const admin=r=>['SUPER_ADMIN','ADMINISTRADOR'].includes(r);
// Mismos importes que propone la aprobación administrativa del formulario.
// Reservas anteriores: mostrar valores persistidos, nunca simular precios legados.
const limitePagoReserva=fecha=>{
 const anterior=new Date(Date.parse(fecha+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 return anterior<hoy()?hoy():anterior;
};
const error=(status,message,extra={})=>Object.assign(new Error(message),{status,...extra});
// Nunca incluir el hash del enlace de subida en respuestas de la API.
const reservaSegura=row=>{const data=row.toJSON();delete data.tokenPagoPublicoHash;return data;};
const hoy=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const texto=(v,n=160)=>String(v||'').trim().slice(0,n);
const fechaValida=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&!Number.isNaN(Date.parse(String(v)+'T12:00:00Z'))&&new Date(String(v)+'T12:00:00Z').toISOString().slice(0,10)===v;
function manejar(res,e){
 if(!e.status)console.error('[casa-club]',e);
 return res.status(e.status||503).json({ok:false,
  message:e.status?e.message:'No se pudo completar la operación. Intenta nuevamente; si continúa, contacta a Administración.',
  codigo:e.codigo||(e.status===503?'SERVICIO_NO_DISPONIBLE':'ERROR_RESERVA'),
  ...(Array.isArray(e.campos)&&e.campos.length?{campos:e.campos}:{}),
  ...(e.accion?{accion:e.accion}:{}),
  ...(e.codigo==='ADEUDOS_RESERVA'?{adeudos:e.adeudos}:{}),
  ...(e.codigo==='TARJETAS_ROJAS'?{tarjetas:e.tarjetas}:{})
 });
}
async function revisarElegibilidad(casaId){
 const saldo=evaluarElegibilidadReserva(await consultarSoloMantenimiento(casaId));
 if(!saldo.puedeReservar)throw error(409,'No puedes reservar Casa club: tienes adeudos por '+saldo.total.toLocaleString('es-MX',{style:'currency',currency:'MXN'})+
  ' de mantenimiento. Regulariza ese concepto en Pagos.',
  {codigo:'ADEUDOS_RESERVA',adeudos:saldo});
 await tarjetasRojas.exigirDisponible(casaId);
}
async function expirarReservas(rango){
 // Las solicitudes previas podían guardar 3 días; rectificar automáticamente
 // las PENDIENTES aún sin pago a fin del día siguiente a su creación real.
 const pendientes=await Reserva.findAll({where:{estatus:'PENDIENTE',pagado:false,
  fechaLimitePago:{[Op.ne]:null}},attributes:['id','creadoEn','fecha','fechaLimitePago'],limit:2000});
 for(const reserva of pendientes){
  const correcto=plazoEfectivo(reserva);
  if(correcto&&correcto!==reserva.fechaLimitePago){
   await Reserva.update({fechaLimitePago:correcto},{where:{id:reserva.id,
    estatus:'PENDIENTE',pagado:false,fechaLimitePago:reserva.fechaLimitePago}});
  }
 }
 const vencidas=await Reserva.findAll({where:{estatus:{[Op.in]:['PENDIENTE','APROBADA']},pagado:false,
  fechaLimitePago:{[Op.lt]:hoy()},...(rango?{fechaBloqueada:{[Op.between]:rango}}:{})},attributes:['id']});
 for(const item of vencidas){
  await db.transaction(async transaction=>{
   const row=await Reserva.findByPk(item.id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!row||!['PENDIENTE','APROBADA'].includes(row.estatus)||row.pagado||!row.fechaLimitePago||row.fechaLimitePago>=hoy())return;
   // La recepción de una imagen no acredita dinero. Si al finalizar el día
   // límite nadie ha confirmado el pago, el apartado se cancela y libera
   // aunque exista un comprobante con estatus PENDIENTE_VALIDACION.
   await row.update({estatus:'CANCELADA',fechaBloqueada:null,notas:(texto(row.notas,400)+' | Cancelación automática: depósito no confirmado al vencimiento').trim(),actualizadoEn:new Date()},{transaction});
  });
 }
}
async function fechas(req,res){
 try{
  const desde=fechaValida(req.query.desde)?req.query.desde:hoy();
  const hasta=fechaValida(req.query.hasta)?req.query.hasta:new Date(Date.parse(desde+'T12:00:00Z')+92*86400000).toISOString().slice(0,10);
  if(hasta<desde||Date.parse(hasta)-Date.parse(desde)>370*86400000)throw error(400,'Rango máximo de 370 días');
  await expirarReservas([desde,hasta]);
  // Las reservas sin vivienda conciliada también bloquean fechas (amarillo).
  // Si Google está habilitado y no responde, no afirmar falsamente que está libre.
  // Mostrar reservas locales aunque falle Google, pero NO afirmar que
  // las fechas restantes están disponibles hasta comprobar la fuente externa.
  let google={occupied:[]},googleDisponible=true;
  try{google=await googleCasaClub.sync();}
  catch(syncError){
   googleDisponible=false;
   console.warn('[CasaClub Google] Disponibilidad externa sin verificar:',syncError.message);
  }
  const rows=await Reserva.findAll({where:{fechaBloqueada:{[Op.between]:[desde,hasta]}},attributes:['fecha','estatus']});
  const dates=new Map(rows.map(x=>[x.fecha,{fecha:x.fecha,estatus:x.estatus}]));
  for(const r of google.occupied||[]){
   if(r.fecha>=desde&&r.fecha<=hasta&&!dates.has(r.fecha))
    dates.set(r.fecha,{fecha:r.fecha,estatus:'PENDIENTE'});
  }
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,ocupadas:[...dates.values()],disponibilidadVerificada:googleDisponible});
 }catch(e){return manejar(res,e);}
}
// Solo opciones del formulario público: no enviar filas completas del padrón.
async function domicilios(req,res){
 const calle=req.query.calle;
 if(calle!==undefined&&(typeof calle!=='string'||!calle.trim()||calle.length>100))
  return manejar(res,error(400,'Indica una calle válida.'));
 try{
  const seleccion=calle?.trim();
  const rows=await Casa.findAll({
   attributes:['calle','calleCorrecta','numero'],raw:true,
   ...(seleccion?{where:{[Op.or]:[{calle:seleccion},{calleCorrecta:seleccion}]}}:{})
  });
  const opciones=new Set();
  for(const row of rows){
   const nombre=texto(row.calleCorrecta||row.calle,100),numero=texto(row.numero,20);
   if(!nombre||!numero||/^prueba(?:\s|$)/i.test(nombre)||/^test(?:-|$)/i.test(numero))continue;
   opciones.add(seleccion?numero:nombre);
  }
  res.setHeader('Cache-Control','public, max-age=300');
  return res.json({ok:true,opciones:ordenarCalles([...opciones])});
 }catch(e){return manejar(res,e);}
}
async function mias(req,res){
 try {
  await expirarReservas();
  const rows=await Reserva.findAll({where:{usuarioId:req.usuario.usuarioId},order:[['fecha','DESC'],['id','DESC']],limit:250});
  const ids=[...new Set(rows.map(x=>x.casaId))],casas=ids.length?await Casa.findAll({where:{id:{[Op.in]:ids}},attributes:['id','calle','numero']}):[];
  const mapa=new Map(casas.map(x=>[Number(x.id),x]));
  const reservaciones=rows.map(x=>Number(x.id));
  const comprobantes=reservaciones.length?await PagoReportado.findAll({where:{reservaCasaClubId:{[Op.in]:reservaciones},tipoPago:'CASA_CLUB'},
   attributes:['reservaCasaClubId','estatus'],raw:true}):[];
  const enRevision=new Set(comprobantes.filter(x=>x.estatus==='PENDIENTE_VALIDACION').map(x=>Number(x.reservaCasaClubId)));
  return res.json({ok:true,data:rows.map(x=>({...reservaSegura(x),casa:mapa.get(Number(x.casaId))||null,
   comprobanteEnRevision:enRevision.has(Number(x.id))}))});
 }catch(e){return manejar(res,e);}
}
async function crear(req,res){
 const body=req.body||{};
 if(body.aceptaReglamento!==true)return manejar(res,error(400,'Lee y acepta el reglamento de Casa Club antes de reservar.',{codigo:'REGLAMENTO_PENDIENTE',campos:['reglamento'],accion:'Lee el reglamento de la pantalla principal y confírmalo.'}));
 const fecha=texto(body.fecha,10),solicitante=texto(body.solicitante,180),telefono=texto(body.telefono,25),correo=texto(body.correo,150),motivo=texto(body.motivo,200);
 const casaId=Number(body.casaId||req.usuario.casaId),reservaDirecta=admin(req.usuario.rol);
 if(!fechaValida(fecha)||fecha<hoy())return manejar(res,error(400,'Selecciona una fecha válida en el calendario.',{codigo:'FECHA_INVALIDA',campos:['fecha']}));
 if(!solicitante||!telefono||!/\S+@\S+\.\S+/.test(correo)||!motivo)
 return manejar(res,error(400,'Revisa los datos obligatorios de la solicitud.',{codigo:'CAMPOS_INVALIDOS',
 campos:[...(!solicitante?['solicitante']:[]),...(!telefono?['telefono']:[]),...(!/\S+@\S+\.\S+/.test(correo)?['correo']:[]),...(!motivo?['motivo']:[])]}));
 if(!reservaDirecta&&!avisos.whatsappMexico(telefono))
  return res.status(400).json({ok:false,message:'Indica un teléfono de contacto válido.'});
 if(!Number.isSafeInteger(casaId)||casaId<=0)return manejar(res,error(400,'Selecciona tu vivienda antes de reservar.',{codigo:'VIVIENDA_INVALIDA',campos:['calle','numero']}));
 try{
  await expirarReservas();
  const house=await Casa.findByPk(casaId);
  if(!house)throw error(404,'La vivienda no está en el padrón');
  const membership=await UsuarioCasa.findOne({where:{usuarioId:req.usuario.usuarioId,casaId,activo:true}});
  if(!membership&&!admin(req.usuario.rol))throw error(403,'No tienes acceso a esa vivienda');
  await revisarElegibilidad(casaId);
  // Lectura obligatoria inmediatamente antes de reservar; evitar carreras
  // con la hoja antigua cuando Google está activado.
  await googleCasaClub.beforeBooking(fecha);
  const importes=await tarifas.obtener();
  // Solo el rol validado por el servidor puede reservar sin revisión humana.
  // La fecha única sigue protegida por fecha_bloqueada, aun con concurrencia.
  const estatus=reservaDirecta?'APROBADA':'PENDIENTE';
  const row=await Reserva.create({
   usuarioId:req.usuario.usuarioId,casaId,fecha,fechaBloqueada:fecha,
   solicitante,telefono,correo,motivo,propietario:body.propietario===true,
   reglamentoVersion:accesoPublico.REGLAMENTO_VERSION,reglamentoAceptadoEn:new Date(),
   estatus,...importes,
   ...(reservaDirecta?{
    fechaLimitePago:limitePagoReserva(fecha),
    pagado:false,revisadoPor:req.usuario.usuarioId
   }:{})
  });
  try{await googleCasaClub.sync({force:true});}
  catch(syncError){console.error('[CasaClub Google] Reserva guardada, envío pendiente:',syncError.message);}
  return res.status(201).json({ok:true,data:{id:row.id,fecha,estatus},
   message:reservaDirecta?'Reserva confirmada. El pago se registra por separado; no está marcado como pagado.':
    'Solicitud enviada. Administración puede aprobar la fecha o el depósito validado por Titan puede confirmarla automáticamente.'});
 }catch(e){if(e.name==='SequelizeUniqueConstraintError')return manejar(res,error(409,'La fecha elegida ya está ocupada o apartada. Selecciona otra.',{codigo:'FECHA_OCUPADA',campos:['fecha']}));return manejar(res,e);}
}
// La ruta pública no acepta identidad, estado, importe ni plazo del cliente.
async function solicitar(req,res){
 const body=req.body||{},usuario=req.usuario;
 const fecha=body.fecha,solicitante=texto(body.solicitante,180),correo=texto(body.correo,150);
 const telefono=avisos.whatsappMexico(texto(body.telefono,25)),motivo=texto(body.motivo,200);
 const calle=texto(body.calle,100),numero=texto(body.numero,20);
 const hoySolicitud=hoy();
 if(typeof fecha!=='string'||!fechaValida(fecha)||fecha<=hoySolicitud||
    Date.parse(fecha)-Date.parse(hoySolicitud)>365*86400000)
  return manejar(res,error(400,'Elige una fecha entre mañana y los próximos 365 días.',{codigo:'FECHA_INVALIDA',campos:['fecha']}));
 if(body.aceptaReglamento!==true)return manejar(res,error(400,'Debes leer y aceptar el reglamento de Casa Club antes de solicitar.',{codigo:'REGLAMENTO_PENDIENTE',campos:['reglamento']}));
 if(!solicitante||!telefono||!avisos.emailValido(correo)||!motivo)
  return manejar(res,error(400,'Revisa los campos obligatorios: nombre, teléfono, correo y motivo del evento.',{codigo:'CAMPOS_INVALIDOS',
   campos:[...(!solicitante?['solicitante']:[]),...(!telefono?['telefono']:[]),...(!avisos.emailValido(correo)?['correo']:[]),...(!motivo?['motivo']:[])]}));
 if(!usuario&&(!calle||!numero))return manejar(res,error(400,'Indica la calle y el número de tu vivienda.',{codigo:'VIVIENDA_INVALIDA',campos:[...(!calle?['calle']:[]),...(!numero?['numero']:[])]}));
 try{
  const config=avisos.configuracion();
  const importes=await tarifas.obtener();
  const clavePublica=accesoPublico.crear();
  const noElegible=()=>error(409,'No podemos verificar esta vivienda o tiene restricciones para reservar. Revisa calle y número; si los datos son correctos, consulta a Administración.',{codigo:'VIVIENDA_NO_ELEGIBLE',campos:['calle','numero']});
  let casaId;
  if(usuario){
   casaId=Number(usuario.casaId);
   if(!Number.isSafeInteger(casaId)||casaId<=0||
      !await UsuarioCasa.findOne({where:{usuarioId:usuario.usuarioId,casaId,activo:true}}))
    throw error(403,'Selecciona una vivienda vinculada a tu cuenta.');
  }else{
   const casas=await Casa.findAll({where:{numero,[Op.or]:[{calle},{calleCorrecta:calle}]},attributes:['id'],limit:2});
   if(casas.length!==1)throw noElegible();
   casaId=casas[0].id;
  }
  try{await revisarElegibilidad(casaId);}
  catch(e){if(!usuario&&(e.codigo==='ADEUDOS_RESERVA'||e.status===404))throw noElegible();throw e;}
  await expirarReservas([fecha,fecha]);
  await googleCasaClub.beforeBooking(fecha);
  let casaTransferencia=null;
  const row=await db.transaction(async transaction=>{
   const casa=await Casa.findByPk(casaId,{transaction,lock:transaction.LOCK.UPDATE});
   if(!casa)throw noElegible();
   casaTransferencia=casa;
   // Revalidar tras bloquear la vivienda evita carreras con una cuarta tarjeta
   // asignada por Seguridad mientras el usuario completa la solicitud.
   await tarjetasRojas.exigirDisponible(casaId,{transaction});
   const anterior=await Reserva.findOne({where:{casaId,estatus:'PENDIENTE',pagado:false,
    fechaBloqueada:{[Op.ne]:null},fechaLimitePago:{[Op.gte]:hoySolicitud}},attributes:['id'],transaction,lock:transaction.LOCK.UPDATE});
   if(anterior)throw error(409,'Esta vivienda ya tiene una reservación pendiente de pago o verificación. No puedes registrar otra hasta que se confirme, cancele o rechace la anterior.',{
    codigo:'RESERVA_PREVIA_PENDIENTE',accion:'Revisa el enlace de pago enviado al correo de la solicitud anterior o pide a Administración que la cancele o rechace. Después podrás elegir otra fecha.'
   });
   return Reserva.create({usuarioId:usuario?.usuarioId??null,casaId,fecha,fechaBloqueada:fecha,solicitante,telefono,correo,motivo,
    propietario:body.propietario===true,
    reglamentoVersion:accesoPublico.REGLAMENTO_VERSION,reglamentoAceptadoEn:new Date(),
    tokenPagoPublicoHash:clavePublica.hash,
    estatus:'PENDIENTE',...importes,
    fechaLimitePago:avisos.limitePago(hoySolicitud,fecha,config.dias)},{transaction});
  });
  const pago={...avisos.instrucciones({...(row.toJSON?.()||row),casa:casaTransferencia},config),
   enlaceCarga:accesoPublico.enlace(row.id,clavePublica.token)};
  const notificaciones=await avisos.notificar(row,pago,config);
  // Si Google falla después de confirmar MySQL no reintentamos crear la reserva:
  // el worker sincroniza el folio CC-id pendiente en el siguiente ciclo.
  try{await googleCasaClub.sync({force:true});}
  catch(syncError){console.error('[CasaClub Google] Reserva guardada, envío pendiente:',syncError.message);}
  res.setHeader('Cache-Control','no-store');
  return res.status(201).json({ok:true,data:{id:row.id,fecha,estatus:'PENDIENTE',pago,notificaciones},
   message:'Solicitud recibida. Titan aprobará automáticamente el depósito cuando exista una coincidencia bancaria completa.'});
 }catch(e){
  if(e.name==='SequelizeUniqueConstraintError')return manejar(res,error(409,'La fecha elegida ya está ocupada o apartada. Selecciona otra disponible.',{codigo:'FECHA_OCUPADA',campos:['fecha']}));
  return manejar(res,e);
 }
}
async function cancelar(req,res){
 try{
  const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<=0)throw error(400,'Reserva no válida');
  await db.transaction(async transaction=>{
   const row=await Reserva.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!row||(!admin(req.usuario.rol)&&String(row.usuarioId)!==String(req.usuario.usuarioId)))throw error(404,'Reserva no encontrada');
   if(!['PENDIENTE','APROBADA'].includes(row.estatus))throw error(409,'No se puede cancelar esta reserva');
   const enRevision=await PagoReportado.count({where:{reservaCasaClubId:row.id,estatus:'PENDIENTE_VALIDACION'},transaction});
   if(enRevision&&!admin(req.usuario.rol))throw error(409,'El comprobante está en revisión bancaria. Solicita a Administración la cancelación para liberar la vivienda.');
   if(row.fecha<hoy()&&!admin(req.usuario.rol))throw error(409,'Consulta a Administración para cancelar una fecha pasada');
   const nota=[texto(row.notas||'',340),
    row.pagado?'Cancelación: revisar devolución bancaria':'',
    enRevision?'Cancelación administrativa con comprobante todavía en revisión: conciliar abono y eventual devolución':''
   ].filter(Boolean).join(' | ').slice(0,600);
   await row.update({estatus:'CANCELADA',fechaBloqueada:null,actualizadoEn:new Date(),notas:nota},{transaction});
  });
  return res.json({ok:true,message:'Reserva cancelada. Si había pagos, Administración debe revisar cualquier devolución.'});
 }catch(e){return manejar(res,e);}
}
async function listar(req,res){
 if(!admin(req.usuario.rol))return res.status(403).json({ok:false,message:'Acceso exclusivo de administración'});
 try{
  // El botón Actualizar del administrador también relee las filas Google nuevas.
  let googleResult={historialGoogle:[],resumen:null};
  let googleDisponible=true;
  try{googleResult=await googleCasaClub.sync({force:true});}
  catch(e){googleDisponible=false;console.warn('[CasaClub Google] Actualización administrativa parcial:',e.message);}
  await expirarReservas();
  const estado=texto(req.query.estatus,15);
  if(estado&&!['PENDIENTE','APROBADA','RECHAZADA','CANCELADA'].includes(estado))throw error(400,'Estado inválido');
  const rows=await Reserva.findAll({where:estado?{estatus:estado}:{},order:[['fecha','DESC']],limit:1000});
  const ids=[...new Set(rows.map(x=>x.casaId))],casas=ids.length?await Casa.findAll({where:{id:{[Op.in]:ids}},attributes:['id','calle','calleCorrecta','numero']}):[];
  const mapa=new Map(casas.map(x=>[Number(x.id),x]));
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,
   data:rows.map(x=>({...reservaSegura(x),...cargosSolicitud(x),casa:mapa.get(Number(x.casaId))||null})),
   historialGoogle:googleResult.historialGoogle||[],
   resumenGoogle:googleResult.resumen||null,
   googleDisponible
  });
 }catch(e){return manejar(res,e);}
}
async function pendientesResumen(req,res){
 if(!admin(req.usuario.rol))return res.status(403).json({ok:false,message:'Acceso exclusivo de Administración'});
 try{
  try{await googleCasaClub.sync();}catch(e){console.warn('[CasaClub Google] Contador parcial:',e.message);}
  return res.json({ok:true,cantidad:await Reserva.count({where:{estatus:'PENDIENTE',
  [Op.or]:[{fechaLimitePago:null},{fechaLimitePago:{[Op.gte]:hoy()}}]}})});
 }
 catch(e){return manejar(res,e);}
}
// Prepara un borrador; el administrador decide si lo envía desde WhatsApp.
const cargosSolicitud=row=>({cuotaRecuperacion:row.cuotaRecuperacion,depositoGarantia:row.depositoGarantia,limpieza:row.limpieza});
async function mensajeWhatsApp(req,res){
 if(!admin(req.usuario.rol))return manejar(res,error(403,'Acceso exclusivo de Administración'));
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<=0)return manejar(res,error(400,'Reserva no válida'));
 try{
  const row=await Reserva.findByPk(id,{attributes:['id','casaId','estatus','pagado','telefono','fecha','fechaLimitePago','cuotaRecuperacion','depositoGarantia','limpieza']});
  if(!row)throw error(404,'Reserva no encontrada');
  if(!['PENDIENTE','APROBADA'].includes(row.estatus)||(!row.pagado&&row.fechaLimitePago&&row.fechaLimitePago<hoy()))
   throw error(409,'La solicitud ya no está activa.');
  const telefono=avisos.whatsappMexico(row.telefono||'');
  if(!telefono)throw error(400,'La reserva no tiene un WhatsApp válido.');
  const confirmada=row.estatus==='APROBADA'&&row.pagado;
  const mensaje=confirmada
   ?'Hola. Confirmamos tu reservación de Casa Club para el '+row.fecha+'. El pago fue verificado y la fecha ya quedó apartada. Folio CC-'+row.id+'.'
   :avisos.textoPago(avisos.instrucciones({id:row.id,fecha:row.fecha,fechaLimitePago:row.fechaLimitePago,...cargosSolicitud(row),casa:row.casaId?await Casa.findByPk(row.casaId,{attributes:['calle','calleCorrecta','numero']}):null},avisos.datosBancarios()));
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,telefono,mensaje,tipo:confirmada?'CONFIRMACION':'PAGO'});
 }catch(e){return manejar(res,e);}
}
async function revisar(req,res){
 if(!admin(req.usuario.rol))return res.status(403).json({ok:false,message:'Acceso exclusivo de administración'});
 const id=Number(req.params.id),action=texto(req.body?.accion,16).toUpperCase();
 if(!Number.isSafeInteger(id)||id<=0||!['APROBAR','RECHAZAR','PAGO','GARANTIA'].includes(action))return res.status(400).json({ok:false,message:'Acción inválida'});
 try{
  await db.transaction(async transaction=>{
   const row=await Reserva.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!row)throw error(404,'Reserva no encontrada');
   if(['APROBAR','RECHAZAR'].includes(action)){
    if(row.estatus!=='PENDIENTE')throw error(409,'La solicitud ya no está pendiente');
    if(action==='RECHAZAR'){
     // Rechazar libera inmediatamente fecha y vivienda. Guardamos una advertencia
     // si Titan todavía está procesando el comprobante.
     const enRevision=await PagoReportado.count({where:{reservaCasaClubId:row.id,
      estatus:'PENDIENTE_VALIDACION'},transaction});
     const nota=[texto(req.body.notas,350),enRevision?
      'Rechazo con comprobante en revisión: conciliar depósito y posible devolución':''].filter(Boolean).join(' | ').slice(0,600);
     await row.update({estatus:'RECHAZADA',fechaBloqueada:null,notas:nota,
      revisadoPor:req.usuario.usuarioId,actualizadoEn:new Date()},{transaction});
     return;
    }
    if(row.fechaLimitePago&&row.fechaLimitePago<hoy())throw error(409,'El apartado venció. Actualiza la lista de solicitudes.');
    const folio=texto(req.body.folio,60),cargos=cargosSolicitud(row);
    const pagoManual=req.body.pagoVerificado===true;
    if(pagoManual&&!/^[a-z0-9-]{3,60}$/i.test(folio))
     throw error(400,'Para registrar un pago manual debes indicar el folio bancario.');
    await revisarElegibilidad(row.casaId);
    if(pagoManual){
     const registrados=await PagoReportado.count({where:{reservaCasaClubId:row.id,estatus:{[Op.in]:['PENDIENTE_VALIDACION','VALIDADO']}},transaction});
     const manuales=await PagoManualConcepto.count({where:{reservaCasaClubId:row.id},transaction});
     if(registrados||manuales)throw error(409,'Ya existe comprobante en revisión o pago registrado. No dupliques el cobro.');
     await PagoManualConcepto.create({casaId:row.casaId,tipoPago:'CASA_CLUB',reservaCasaClubId:row.id,
      monto:avisos.importe(cargos),formaPago:'TRANSFERENCIA',referencia:'MJCLUB:BANCO:'+folio.toUpperCase(),
      registradoPor:req.usuario.usuarioId},{transaction});
    }
    // El administrador puede aprobar la fecha sin afirmar que hubo pago.
    // Si se paga después, solo Titan puede marcarlo validado automáticamente.
    await row.update({estatus:'APROBADA',fechaBloqueada:row.fecha,pagado:pagoManual,
     fechaPago:pagoManual?hoy():null,folio:pagoManual?folio:null,...cargos,
     notas:texto(req.body.notas,600),revisadoPor:req.usuario.usuarioId,actualizadoEn:new Date()},{transaction});
   } else {
    if(row.estatus!=='APROBADA')throw error(409,'Solo se registran movimientos de reservas aprobadas');
    if(action==='PAGO'){
     if(req.body.pagado!==true||row.pagado)throw error(409,'No se puede deshacer un pago conciliado desde esta pantalla. Revisa la contabilidad con Administración.');
     const where={reservaCasaClubId:row.id};
     if(await PagoReportado.count({where:{...where,estatus:{[Op.in]:['PENDIENTE_VALIDACION','VALIDADO']}},transaction})||await PagoManualConcepto.count({where,transaction}))
       throw error(409,'Ya existe un comprobante o pago registrado para esta reservación');
     const referencia='MJCLUB:'+randomUUID();
     await PagoManualConcepto.create({casaId:row.casaId,tipoPago:'CASA_CLUB',reservaCasaClubId:row.id,
       monto:Number(row.cuotaRecuperacion)+Number(row.depositoGarantia)+Number(row.limpieza),formaPago:'TRANSFERENCIA',referencia,registradoPor:req.usuario.usuarioId},{transaction});
     await row.update({pagado:true,fechaPago:hoy(),folio:texto(req.body.folio,60)||referencia,actualizadoEn:new Date()},{transaction});
    }
    else await row.update({garantiaDevuelta:req.body.garantiaDevuelta===true,actualizadoEn:new Date()},{transaction});
   }
  });
  return res.json({ok:true,message:'Cambios guardados correctamente'});
 }catch(e){
  if(e.name==='SequelizeUniqueConstraintError')return manejar(res,error(409,'Ese depósito o reserva ya tiene un pago registrado.'));
  return manejar(res,e);
 }
}
async function obtenerTarifas(req,res){
 try{return res.json({ok:true,data:{...(await tarifas.obtener()),total:tarifas.TOTAL_FIJO}});}
 catch(e){return manejar(res,e);}
}
async function guardarTarifas(req,res){
 if(!admin(req.usuario?.rol))return manejar(res,error(403,'Solo Administración puede modificar las tarifas.'));
 try{const data=await tarifas.guardar(req.body||{},req.usuario.usuarioId);
  return res.json({ok:true,data:{...data,total:tarifas.TOTAL_FIJO},message:'Tarifas guardadas para nuevas solicitudes.'});}
 catch(e){return manejar(res,e);}
}
// Se libera el día sin destruir pagos, comprobantes ni el historial auditado.
async function liberar(req,res){
 if(!admin(req.usuario?.rol))return manejar(res,error(403,'Solo Administración puede liberar el día.'));
 const id=Number(req.params.id),motivo=texto(req.body?.motivo,180);
 if(!Number.isSafeInteger(id)||id<=0||motivo.length<8)return manejar(res,error(400,'Indica el motivo de la cancelación (mínimo 8 caracteres).'));
 try{
  const data=await db.transaction(async transaction=>{
   const row=await Reserva.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!row)throw error(404,'Reserva no encontrada');
   if(row.estatus!=='APROBADA')throw error(409,'Solo puedes liberar reservas aprobadas desde esta acción.');
   const enRevision=await PagoReportado.count({where:{reservaCasaClubId:row.id,estatus:'PENDIENTE_VALIDACION'},transaction});
   // Se conservan pruebas bancarias y la alerta de revisión, aun tras liberar.
   const pago=Boolean(row.pagado),nota=[
    texto(row.notas,290),'Liberó Administración (ID '+req.usuario.usuarioId+'): '+motivo,
    enRevision?'Había comprobante en revisión: revisar si ingresó dinero y corresponde devolución':''
   ].filter(Boolean).join(' | ').slice(0,600);
   await row.update({estatus:'CANCELADA',fechaBloqueada:null,notas:nota,
    revisadoPor:req.usuario.usuarioId,actualizadoEn:new Date()},{transaction});
   return {id:row.id,correo:row.correo,fecha:row.fecha,pago,enRevision:Boolean(enRevision)};
  });
  let avisoCorreo=false;
  try{await require('../services/email.service').enviarAvisoCasaClub({
   destinatario:data.correo,asunto:'Casa Club · Reserva CC-'+data.id+' cancelada',
   texto:'Administración canceló tu reserva para el '+data.fecha+'.\nMotivo: '+motivo+
    (data.pago||data.enRevision?'\nSi realizaste un pago, contacta a Administración para conciliar el depósito y una posible devolución.':'')
  });avisoCorreo=true;}catch(e){console.warn('[casa-club] Reserva cancelada; correo no confirmado:',e.message);}
  return res.json({ok:true,fechaLiberada:true,pagoPendienteDeRevision:data.pago||data.enRevision,avisoCorreo,
   message:'Reserva cancelada y día liberado. Pagos y comprobantes conservados para auditoría; si hubo depósito o comprobante en revisión, Administración deberá conciliarlo.'});
 }catch(e){return manejar(res,e);}
}
// Administración puede revisar todo el expediente sin exponer archivos a residentes.
async function comprobantes(req,res){
 if(!admin(req.usuario?.rol))return manejar(res,error(403,'Acceso exclusivo de Administración'));
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<=0)return manejar(res,error(400,'Reserva inválida'));
 try{
  if(!await Reserva.findByPk(id,{attributes:['id']}))throw error(404,'Reserva no encontrada');
  const [automaticos,manuales]=await Promise.all([
   PagoReportado.findAll({where:{reservaCasaClubId:id,tipoPago:'CASA_CLUB'},
    attributes:['id','folioReporte','monto','estatus','fechaOperacion','fechaValidacion','comprobanteNombre','reciboPdfNombre','creadoEn'],
    order:[['creadoEn','DESC']],limit:30}),
   PagoManualConcepto.findAll({where:{reservaCasaClubId:id,tipoPago:'CASA_CLUB'},
    attributes:['id','monto','formaPago','referencia','creadoEn'],limit:20})
  ]);
  res.setHeader('Cache-Control','private, no-store');
  return res.json({ok:true,data:{
   automaticos:automaticos.map(p=>({id:p.id,folio:p.folioReporte,monto:Number(p.monto),
    estatus:p.estatus,fechaOperacion:p.fechaOperacion,fechaValidacion:p.fechaValidacion,
    comprobanteNombre:p.comprobanteNombre,reciboPdfNombre:p.reciboPdfNombre,creadoEn:p.creadoEn})),
   manuales:manuales.map(p=>({id:p.id,monto:Number(p.monto),formaPago:p.formaPago,
    referencia:p.referencia,creadoEn:p.creadoEn}))
  }});
 }catch(e){return manejar(res,e);}
}
// Eliminación limitada a registros sin movimientos. Ningún pago real se borra.
// Los registros pagados requieren cancelación/liberación con auditoría.
async function eliminarRegistro(req,res){
 if(!admin(req.usuario?.rol))return manejar(res,error(403,'Acceso exclusivo de Administración'));
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<1)return manejar(res,error(400,'Reserva no válida'));
 try{
  await db.transaction(async transaction=>{
   const row=await Reserva.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!row)throw error(404,'Registro no encontrado');
   const [bancarios,manuales]=await Promise.all([
    PagoReportado.count({where:{reservaCasaClubId:id},transaction}),
    PagoManualConcepto.count({where:{reservaCasaClubId:id},transaction})
   ]);
   if(row.pagado||bancarios||manuales)throw error(409,
    'No se puede eliminar un registro con comprobantes o pagos. Cancela/libera la fecha y conserva su historial para auditoría.');
   await row.destroy({transaction});
  });
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,message:'Registro sin pagos eliminado y fecha liberada.'});
 }catch(e){return manejar(res,e);}
}
module.exports={fechas,domicilios,mias,crear,solicitar,cancelar,listar,mensajeWhatsApp,revisar,pendientesResumen,obtenerTarifas,guardarTarifas,liberar,comprobantes,eliminarRegistro,expirarReservas};
