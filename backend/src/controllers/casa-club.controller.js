const {Op}=require('sequelize');
const Reserva=require('../models/ReservaCasaClub');
const {Casa,UsuarioCasa}=require('../models');
const db=require('../config/database');
const PagoReportado=require('../models/PagoReportado');
const PagoManualConcepto=require('../models/PagoManualConcepto');
const {randomUUID}=require('crypto');
const {consultarAdeudos}=require('../services/adeudos-comunidad.service');
const avisos=require('../services/casa-club-avisos.service');
const tarifas=require('../services/casa-club-tarifas.service');
const {ordenarCalles}=require('../services/direccion-sort.service');
const {evaluarElegibilidadReserva}=require('../services/elegibilidad-casa-club.service');
const admin=r=>['SUPER_ADMIN','ADMINISTRADOR'].includes(r);
// Mismos importes que propone la aprobación administrativa del formulario.
const IMPORTES_LEGADOS={cuotaRecuperacion:700,depositoGarantia:700,limpieza:0};
const limitePagoReserva=fecha=>{
 const anterior=new Date(Date.parse(fecha+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 return anterior<hoy()?hoy():anterior;
};
const error=(status,message,extra={})=>Object.assign(new Error(message),{status,...extra});
const hoy=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const texto=(v,n=160)=>String(v||'').trim().slice(0,n);
const fechaValida=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&!Number.isNaN(Date.parse(String(v)+'T12:00:00Z'))&&new Date(String(v)+'T12:00:00Z').toISOString().slice(0,10)===v;
function manejar(res,e){if(!e.status)console.error('[casa-club]',e);return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No se pudo completar la operación',
 ...(e.codigo==='ADEUDOS_RESERVA'?{codigo:e.codigo,adeudos:e.adeudos}:{})});}
async function revisarElegibilidad(casaId){
 const saldo=evaluarElegibilidadReserva(await consultarAdeudos(casaId));
 if(!saldo.puedeReservar)throw error(409,'No puedes reservar Casa club: tienes adeudos por '+saldo.total.toLocaleString('es-MX',{style:'currency',currency:'MXN'})+
  ' entre mantenimiento y cuotas extraordinarias. Regulariza esos conceptos en Pagos.',
  {codigo:'ADEUDOS_RESERVA',adeudos:saldo});
}
async function expirarReservas(rango){
 const vencidas=await Reserva.findAll({where:{estatus:{[Op.in]:['PENDIENTE','APROBADA']},pagado:false,
  fechaLimitePago:{[Op.lt]:hoy()},...(rango?{fechaBloqueada:{[Op.between]:rango}}:{})},attributes:['id']});
 for(const item of vencidas){
  await db.transaction(async transaction=>{
   const row=await Reserva.findByPk(item.id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!row||!['PENDIENTE','APROBADA'].includes(row.estatus)||row.pagado||!row.fechaLimitePago||row.fechaLimitePago>=hoy())return;
   // Un comprobante presentado a tiempo espera revisión bancaria; no se
   // elimina la reserva por tardanza de Administración en validarlo.
   const proof=await PagoReportado.count({where:{reservaCasaClubId:row.id,estatus:{[Op.in]:['PENDIENTE_VALIDACION','VALIDADO']},fechaOperacion:{[Op.lte]:row.fechaLimitePago}},transaction});
   if(proof)return;
   await row.update({estatus:'CANCELADA',fechaBloqueada:null,notas:(texto(row.notas,400)+' | Cancelación automática por pago vencido').trim(),actualizadoEn:new Date()},{transaction});
  });
 }
}
async function fechas(req,res){
 try{
  const desde=fechaValida(req.query.desde)?req.query.desde:hoy();
  const hasta=fechaValida(req.query.hasta)?req.query.hasta:new Date(Date.parse(desde+'T12:00:00Z')+92*86400000).toISOString().slice(0,10);
  if(hasta<desde||Date.parse(hasta)-Date.parse(desde)>370*86400000)throw error(400,'Rango máximo de 370 días');
  await expirarReservas([desde,hasta]);
  const rows=await Reserva.findAll({where:{fechaBloqueada:{[Op.between]:[desde,hasta]}},attributes:['fecha','estatus']});
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,ocupadas:rows.map(x=>({fecha:x.fecha,estatus:x.estatus}))});
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
  return res.json({ok:true,data:rows.map(x=>({...x.toJSON(),casa:mapa.get(Number(x.casaId))||null}))});
 }catch(e){return manejar(res,e);}
}
async function crear(req,res){
 const body=req.body||{};
 const fecha=texto(body.fecha,10),solicitante=texto(body.solicitante,180),telefono=texto(body.telefono,25),correo=texto(body.correo,150),motivo=texto(body.motivo,200);
 const casaId=Number(body.casaId||req.usuario.casaId),reservaDirecta=admin(req.usuario.rol);
 if(!fechaValida(fecha)||fecha<hoy())return res.status(400).json({ok:false,message:'Selecciona una fecha válida, desde hoy en adelante'});
 if(!solicitante||!telefono||!/^\S+@\S+\.\S+$/.test(correo)||!motivo)return res.status(400).json({ok:false,message:'Completa solicitante, teléfono, correo y motivo'});
 if(!reservaDirecta&&(!avisos.whatsappMexico(telefono)||body.aceptaWhatsApp!==true))
  return res.status(400).json({ok:false,message:'Indica un número de WhatsApp válido y acepta recibir las instrucciones de pago.'});
 if(!Number.isSafeInteger(casaId)||casaId<=0)return res.status(400).json({ok:false,message:'Selecciona tu vivienda antes de reservar'});
 try{
  await expirarReservas();
  const house=await Casa.findByPk(casaId);
  if(!house)throw error(404,'La vivienda no está en el padrón');
  const membership=await UsuarioCasa.findOne({where:{usuarioId:req.usuario.usuarioId,casaId,activo:true}});
  if(!membership&&!admin(req.usuario.rol))throw error(403,'No tienes acceso a esa vivienda');
  await revisarElegibilidad(casaId);
  const importes=await tarifas.obtener();
  // Solo el rol validado por el servidor puede reservar sin revisión humana.
  // La fecha única sigue protegida por fecha_bloqueada, aun con concurrencia.
  const estatus=reservaDirecta?'APROBADA':'PENDIENTE';
  const row=await Reserva.create({
   usuarioId:req.usuario.usuarioId,casaId,fecha,fechaBloqueada:fecha,
   solicitante,telefono,correo,motivo,propietario:body.propietario===true,
   estatus,...importes,
   ...(reservaDirecta?{
    fechaLimitePago:limitePagoReserva(fecha),
    pagado:false,revisadoPor:req.usuario.usuarioId
   }:{})
  });
  return res.status(201).json({ok:true,data:{id:row.id,fecha,estatus},
   message:reservaDirecta?'Reserva confirmada. El pago se registra por separado; no está marcado como pagado.':
    'Solicitud enviada. Administración puede aprobar la fecha o el depósito validado por Titan puede confirmarla automáticamente.'});
 }catch(e){if(e.name==='SequelizeUniqueConstraintError')return res.status(409).json({ok:false,message:'Esta fecha ya está ocupada o pendiente de aprobación'});return manejar(res,e);}
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
  return manejar(res,error(400,'Elige una fecha entre mañana y los próximos 365 días.'));
 if(!solicitante||!telefono||!avisos.emailValido(correo)||!motivo||body.aceptaWhatsApp!==true)
  return manejar(res,error(400,'Completa nombre, WhatsApp, correo, motivo y autorización de aviso.'));
 if(!usuario&&(!calle||!numero))return manejar(res,error(400,'Indica la calle y el número de tu vivienda.'));
 try{
  const config=avisos.configuracion();
  const importes=await tarifas.obtener();
  const noElegible=()=>error(409,'No se pudo solicitar la reserva para esa vivienda. Verifica tus datos o contacta a Administración.');
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
  const row=await db.transaction(async transaction=>{
   const casa=await Casa.findByPk(casaId,{transaction,lock:transaction.LOCK.UPDATE});
   if(!casa)throw noElegible();
   const anterior=await Reserva.findOne({where:{casaId,estatus:'PENDIENTE',
    fechaLimitePago:{[Op.gte]:hoySolicitud}},attributes:['id'],transaction,lock:transaction.LOCK.UPDATE});
   if(anterior)throw error(409,usuario?'Ya tienes una solicitud de Casa Club en revisión.':noElegible().message);
   return Reserva.create({usuarioId:usuario?.usuarioId??null,casaId,fecha,fechaBloqueada:fecha,solicitante,telefono,correo,motivo,
    propietario:body.propietario===true,estatus:'PENDIENTE',...importes,
    fechaLimitePago:avisos.limitePago(hoySolicitud,fecha,config.dias)},{transaction});
  });
  const pago=avisos.instrucciones(row,config);
  const notificaciones=await avisos.notificar(row,pago,config);
  res.setHeader('Cache-Control','no-store');
  return res.status(201).json({ok:true,data:{id:row.id,fecha,estatus:'PENDIENTE',pago,notificaciones},
   message:'Solicitud recibida. Titan aprobará automáticamente el depósito cuando exista una coincidencia bancaria completa.'});
 }catch(e){
  if(e.name==='SequelizeUniqueConstraintError')return manejar(res,error(409,'Esta fecha ya está apartada. Elige otra.'));
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
   if(row.fecha<hoy()&&!admin(req.usuario.rol))throw error(409,'Consulta a Administración para cancelar una fecha pasada');
   await row.update({estatus:'CANCELADA',fechaBloqueada:null,actualizadoEn:new Date(),notas:row.pagado?(texto(row.notas||'',480)+' | Cancelación: revisar devolución con administración').trim():row.notas},{transaction});
  });
  return res.json({ok:true,message:'Reserva cancelada. Si había pagos, Administración debe revisar cualquier devolución.'});
 }catch(e){return manejar(res,e);}
}
async function listar(req,res){
 if(!admin(req.usuario.rol))return res.status(403).json({ok:false,message:'Acceso exclusivo de administración'});
 try{
  await expirarReservas();
  const estado=texto(req.query.estatus,15);
  if(estado&&!['PENDIENTE','APROBADA','RECHAZADA','CANCELADA'].includes(estado))throw error(400,'Estado inválido');
  const rows=await Reserva.findAll({where:estado?{estatus:estado}:{},order:[['fecha','DESC']],limit:1000});
  const ids=[...new Set(rows.map(x=>x.casaId))],casas=ids.length?await Casa.findAll({where:{id:{[Op.in]:ids}},attributes:['id','calle','calleCorrecta','numero']}):[];
  const mapa=new Map(casas.map(x=>[Number(x.id),x]));
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,data:rows.map(x=>({...x.toJSON(),...cargosSolicitud(x),casa:mapa.get(Number(x.casaId))||null}))});
 }catch(e){return manejar(res,e);}
}
async function pendientesResumen(req,res){
 if(!admin(req.usuario.rol))return res.status(403).json({ok:false,message:'Acceso exclusivo de Administración'});
 try{return res.json({ok:true,cantidad:await Reserva.count({where:{estatus:'PENDIENTE',
  [Op.or]:[{fechaLimitePago:null},{fechaLimitePago:{[Op.gte]:hoy()}}]}})});}
 catch(e){return manejar(res,e);}
}
// Prepara un borrador; el administrador decide si lo envía desde WhatsApp.
const cargosSolicitud=row=>row.estatus==='PENDIENTE'&&!row.fechaLimitePago
 ?IMPORTES_LEGADOS:{cuotaRecuperacion:row.cuotaRecuperacion,depositoGarantia:row.depositoGarantia,limpieza:row.limpieza};
async function mensajeWhatsApp(req,res){
 if(!admin(req.usuario.rol))return manejar(res,error(403,'Acceso exclusivo de Administración'));
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<=0)return manejar(res,error(400,'Reserva no válida'));
 try{
  const row=await Reserva.findByPk(id,{attributes:['id','estatus','pagado','telefono','fecha','fechaLimitePago','cuotaRecuperacion','depositoGarantia','limpieza']});
  if(!row)throw error(404,'Reserva no encontrada');
  if(!['PENDIENTE','APROBADA'].includes(row.estatus)||(!row.pagado&&row.fechaLimitePago&&row.fechaLimitePago<hoy()))
   throw error(409,'La solicitud ya no está activa.');
  const telefono=avisos.whatsappMexico(row.telefono||'');
  if(!telefono)throw error(400,'La reserva no tiene un WhatsApp válido.');
  const confirmada=row.estatus==='APROBADA'&&row.pagado;
  const mensaje=confirmada
   ?'Hola. Confirmamos tu reservación de Casa Club para el '+row.fecha+'. El pago fue verificado y la fecha ya quedó apartada. Folio CC-'+row.id+'.'
   :avisos.textoPago(avisos.instrucciones({id:row.id,fecha:row.fecha,fechaLimitePago:row.fechaLimitePago,...cargosSolicitud(row)},avisos.datosBancarios()));
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
     const pendientes=await PagoReportado.count({where:{reservaCasaClubId:row.id,estatus:{[Op.in]:['PENDIENTE_VALIDACION','VALIDADO']}},transaction});
     if(pendientes)throw error(409,'Existe un comprobante en revisión. Resuelve la conciliación antes de rechazar la solicitud.');
     await row.update({estatus:'RECHAZADA',fechaBloqueada:null,notas:texto(req.body.notas,600),
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
   const pago=Boolean(row.pagado),nota=[texto(row.notas,330),'Liberó Administración (ID '+req.usuario.usuarioId+'): '+motivo].filter(Boolean).join(' | ').slice(0,600);
   await row.update({estatus:'CANCELADA',fechaBloqueada:null,notas:nota,
    revisadoPor:req.usuario.usuarioId,actualizadoEn:new Date()},{transaction});
   return {id:row.id,correo:row.correo,fecha:row.fecha,pago};
  });
  let avisoCorreo=false;
  try{await require('../services/email.service').enviarAvisoCasaClub({
   destinatario:data.correo,asunto:'Casa Club · Reserva CC-'+data.id+' cancelada',
   texto:'Administración canceló tu reserva para el '+data.fecha+'.\nMotivo: '+motivo+
    (data.pago?'\nSi realizaste un pago, contacta a Administración para conciliar cualquier devolución.':'')
  });avisoCorreo=true;}catch(e){console.warn('[casa-club] Reserva cancelada; correo no confirmado:',e.message);}
  return res.json({ok:true,fechaLiberada:true,pagoPendienteDeRevision:data.pago,avisoCorreo,
   message:'Reserva cancelada y día liberado. Pagos y comprobantes conservados para auditoría.'});
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
module.exports={fechas,domicilios,mias,crear,solicitar,cancelar,listar,mensajeWhatsApp,revisar,pendientesResumen,obtenerTarifas,guardarTarifas,liberar,comprobantes};
