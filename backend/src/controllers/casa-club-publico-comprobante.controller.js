'use strict';
// Misma ruta OCR/Titan de Pagos; la única diferencia es el acceso con un
// secreto asociado exclusivamente a la reserva de Casa Club.
// Nunca se acepta casaId, usuarioId, estatus, montoRequerido ni tipo del cliente.
const acceso=require('../services/casa-club-acceso-publico.service');
const Pago=require('../models/PagoReportado');
const pagoController=require('./pagos.controller');
const reintentos=require('../services/pagos-reintento-validacion.service');
const cuentaOficial=require('../services/pagos-cuenta-oficial.service');
const {Casa}=require('../models');
const Reserva=require('../models/ReservaCasaClub');
const {fn,col,where}=require('sequelize');
const {expirarReservas}=require('./casa-club.controller');

const noCache=res=>res.setHeader('Cache-Control','private, no-store');
function cuenta(_req,res){
 noCache(res);
 // Solo datos de la cuenta receptora publicados para transferencias; sin
 // información de residentes ni vínculos con reservas.
 return res.json({ok:true,data:cuentaOficial.obtener()});
}

function fallo(res,e){
 if(!e.status)console.error('[Casa Club][Comprobante público]',e);
 return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No se pudo completar la verificación'});
}
async function leerReserva(req,{exigirVigente=false}={}){
 return acceso.verificar({
  id:req.body?.reservaId,token:req.body?.claveAcceso,exigirVigente
 });
}
async function ultimoComprobante(reserva){
 return Pago.findOne({where:{reservaCasaClubId:reserva.id,tipoPago:'CASA_CLUB'},
  attributes:['id','estatus','verificacionBancaria','fechaValidacion','fechaOperacion'],
  order:[['creadoEn','DESC'],['id','DESC']]});
}
async function reportar(req,res){
 try{
  const reserva=await leerReserva(req,{exigirVigente:true});
  const body=req.body||{};
  // Las siguientes propiedades se derivan exclusivamente de MySQL.
  req.reservaPublica=reserva;
  req.usuario={rol:'CONDOMINO',casaId:reserva.casaId,usuarioId:null};
  req.body={
   tipoPago:'CASA_CLUB',reservaCasaClubId:reserva.id,
   folioOperacion:body.folioOperacion,fechaOperacion:body.fechaOperacion,
   horaOperacion:body.horaOperacion,monto:body.monto,
   comprobanteData:body.comprobanteData,comprobanteNombre:body.comprobanteNombre,
   comprobanteMime:body.comprobanteMime
  };
  // Reutiliza validación destino OCR, fecha/hora/importe/identificador,
  // duplicados globales, folio, persistencia y programación IMAP Titan.
  return pagoController.reportarPago(req,res);
 }catch(e){return fallo(res,e);}
}
async function estado(req,res){
 try{
  const accesoValido=await leerReserva(req);
  // Incluso si nadie visita el calendario, el enlace personal refleja
  // el vencimiento y libera la fecha al consultar su estado.
  await expirarReservas([accesoValido.fecha,accesoValido.fecha]);
  const reserva=await leerReserva(req);
  const pago=await ultimoComprobante(reserva);
  const vivienda=reserva.casaId?await Casa.findByPk(reserva.casaId,{attributes:['calle','calleCorrecta','numero']}):null;
  const revision=typeof pago?.verificacionBancaria==='string'
   ?JSON.parse(pago.verificacionBancaria||'{}'):pago?.verificacionBancaria||{};
  noCache(res);
  // No devolver identificadores bancarios ni datos personales.
  return res.json({ok:true,data:{
   reservaId:reserva.id,folio:'CC-'+reserva.id,fecha:reserva.fecha,
   fechaLimitePago:reserva.fechaLimitePago,solicitante:reserva.solicitante,
   vivienda:vivienda?String(vivienda.calleCorrecta||vivienda.calle||'').trim()+' '+String(vivienda.numero||'').trim():null,
   estatusReserva:reserva.estatus,
   pagado:Boolean(reserva.pagado),
   datosTransferencia:cuentaOficial.obtener(),
   conceptoTransferencia:cuentaOficial.conceptoVivienda(vivienda),
   total:Number(reserva.cuotaRecuperacion)+Number(reserva.depositoGarantia)+Number(reserva.limpieza),
   destinatario:process.env.PAGOS_TITULAR||'MARIA DEL ROCIO BAHENA JUAREZ',
   terminacionCuenta:cuentaOficial.obtener().destinoUltimos4,
    terminacionesCuenta:cuentaOficial.obtener().destinosUltimos4,
   comprobante:pago?{
    estado:pago.estatus,
    etapa:String(revision.etapa||'RECIBIDO').slice(0,80),
    validado:!!pago.fechaValidacion
   }:null
  }});
 }catch(e){return fallo(res,e);}
}
// La URL privada enviada al mismo buzón prueba posesión de un token aleatorio
// de 256 bits. Nunca aceptar un correo arbitrario desde la petición del cliente.
async function misReservas(req,res){
 try{
  // Esta clave se envía SOLO al correo. No es el enlace de comprobante
  // que la API devuelve al navegador al registrar una solicitud.
  const credencial=await acceso.verificarHistorial({
   id:req.body?.reservaId,token:req.body?.claveAcceso
  });
  const email=String(credencial.correo||'').trim().toLowerCase();
  if(!email||email.length>150)throw Object.assign(Error('El enlace no tiene correo asociado.'),{status:404});
  await expirarReservas();
  const rows=await Reserva.findAll({
   where:where(fn('LOWER',fn('TRIM',col('correo'))),email),
   attributes:['id','fecha','estatus','pagado','notas','creadoEn'],
   order:[['fecha','DESC'],['id','DESC']],limit:200
  });
  const reservas=rows.map(row=>{
   // No revelar anotaciones internas ni comprobantes: el usuario solo
   // necesita el motivo comunicado en el rechazo.
   const observacion=String(row.notas||'').split(' | ')[0].trim().slice(0,350);
   return {
    folio:'CC-'+row.id,
    fecha:row.fecha,
    estatus:row.estatus,
    pagado:Boolean(row.pagado),
    fechaSolicitud:row.creadoEn,
    ...(row.estatus==='RECHAZADA'?{motivoRechazo:observacion||
     'Administración no indicó un motivo. Contacta a Administración para aclararlo.'}:{})
   };
  });
  noCache(res);
  return res.json({ok:true,data:{correo:email,reservas}});
 }catch(e){return fallo(res,e);}
}
async function reintentar(req,res){
 try{
  const reservaInicial=await leerReserva(req);
  await expirarReservas([reservaInicial.fecha,reservaInicial.fecha]);
  const reserva=await leerReserva(req);
  if(!['PENDIENTE','APROBADA'].includes(reserva.estatus)||reserva.pagado)
   return res.status(409).json({ok:false,message:'La reservación ya no admite reintentos bancarios.'});
  const pago=await ultimoComprobante(reserva);
  if(!pago)return res.status(404).json({ok:false,message:'No se encontró un comprobante para esta reservación.'});
  const data=await reintentos.solicitarReintento({
   pagoId:Number(pago.id),casaId:Number(reserva.casaId),usuarioId:null,
   reservaCasaClubId:Number(reserva.id)
  });
  noCache(res);
  return res.json({ok:true,data,message:'Se volvió a solicitar lectura OCR y conciliación de Titan.'});
 }catch(e){return fallo(res,e);}
}
async function descargarRecibo(req,res){
 try{
  const reserva=await leerReserva(req);
  const pago=await Pago.findOne({where:{reservaCasaClubId:reserva.id,tipoPago:'CASA_CLUB'},
   order:[['creadoEn','DESC'],['id','DESC']]});
  if(!pago||!pago.reciboPdfData)throw Object.assign(Error('El recibo aún no está disponible.'),{status:404});
  noCache(res);
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition','attachment; filename="Recibo_CasaClub_'+reserva.id+'.pdf"');
  return res.send(pago.reciboPdfData);
 }catch(e){return fallo(res,e);}
}
module.exports={cuenta,reportar,estado,misReservas,reintentar,descargarRecibo};
