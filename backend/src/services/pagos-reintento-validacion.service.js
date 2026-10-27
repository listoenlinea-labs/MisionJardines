'use strict';
// Un RECHAZADO puede solicitar otra consulta bancaria usando el MISMO registro.
// No valida ni acredita pagos, no cambia cuotas y no altera la evidencia OCR.
const sequelize=require('../config/database');
const {PagoReportado}=require('../models');
const banco=require('./banco-correo.service');

const MAX_REINTENTOS=3;
const ESPERA_MS=60*1000;
const fail=(status,message)=>Object.assign(new Error(message),{status});
function diagnosticoAnterior(raw){
  if(typeof raw==='string'){try{raw=JSON.parse(raw)}catch{return {}}}
  return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
}
function elegible(pago) {
  const aplicacion=diagnosticoAnterior(pago?.aplicacionCuotas);
  // El folio y PDF nacen al REPORTAR, antes de verificar Titan:
  // conservarlos en el reintento. Solo bloquear acreditaciones reales.
  return pago?.estatus==='RECHAZADO' &&
    !pago?.correoBancarioHash && !pago?.fechaValidacion &&
    !aplicacion.aplicado;
}
async function solicitarReintento({pagoId,casaId,usuarioId,ahora=new Date()}){
  if(!Number.isSafeInteger(pagoId)||pagoId<=0||!Number.isSafeInteger(casaId)||casaId<=0)
    throw fail(404,'Comprobante no encontrado.');
  if(!banco.configurado())
    throw fail(503,'La verificación bancaria no está disponible. Intenta más tarde.');
  const result=await sequelize.transaction({isolationLevel:'READ COMMITTED'},async transaction=>{
    const pago=await PagoReportado.findOne({
      where:{id:pagoId,...require('./pagos-reparto.service').condicionLectura(casaId,usuarioId)},transaction,lock:transaction.LOCK.UPDATE
    });
    if(!pago)throw fail(404,'Comprobante no encontrado.');
    if(!elegible(pago))throw fail(409,'Este pago no admite reintento: ya fue validado, está en revisión o tiene movimientos aplicados.');
    const anterior=diagnosticoAnterior(pago.verificacionBancaria);
    const numero=Math.max(0,Number(anterior.reintentos)||0);
    if(numero>=MAX_REINTENTOS)throw fail(429,'Se alcanzó el máximo de reintentos de este comprobante. Solicita revisión a Administración.');
    const ultimo=Date.parse(String(anterior.ultimoReintentoEn||''));
    if(Number.isFinite(ultimo)&&ahora.getTime()-ultimo<ESPERA_MS)
      throw fail(429,'La última validación se intentó recientemente. Espera un minuto antes de volver a solicitarla.');
    const historial=Array.isArray(anterior.historialReintentos)?anterior.historialReintentos.slice(-MAX_REINTENTOS):[];
    historial.push({
      etapa:String(anterior.etapa||'FALLIDO').slice(0,60),
      detalle:String(anterior.detalle||pago.observacionesRevision||'Validación fallida').slice(0,500),
      fechaRevision:anterior.fechaRevision||null
    });
    await pago.update({
      estatus:'PENDIENTE_VALIDACION',
      verificacionBancaria:{
        version:1,etapa:'REINTENTO_OCR',
        detalle:'Releyendo la imagen original mediante OCR antes de consultar el buzón bancario.',
        fechaRevision:null,avisosConsultados:0,avisosAutenticados:0,coincidencias:0,
        reintentos:numero+1,ultimoReintentoEn:ahora.toISOString(),
        historialReintentos:historial
      },
      observacionesRevision:'Reintento bancario solicitado; aún sin confirmar.',
      actualizadoEn:ahora
    },{transaction});
    return {id:pago.id,estatus:'PENDIENTE_VALIDACION',reintentos:numero+1};
  });
  // Se agenda solo tras COMMIT; no ejecutar IMAP hasta terminar de releer
  // la imagen original. El worker bancario conserva sus verificaciones.
  require('./pagos-relectura-ocr.service').programarRelectura(pagoId);
  return result;
}
module.exports={solicitarReintento,elegible,diagnosticoAnterior,MAX_REINTENTOS,ESPERA_MS};
