'use strict';
// Segunda lectura REAL desde la imagen persistida, independiente del OCR del navegador.
// Solo la conciliación de Titan puede acreditar el depósito y renovar vigencias.
const {PagoReportado}=require('../models');
const lector=require('./comprobante-lector.service');
const parser=require('./comprobante-parser');
const identificadores=require('./identificadores-bancarios.service');
const bancoWorker=require('./banco-correo-worker.service');
const STATUS='PENDIENTE_VALIDACION';

function revision(raw){
  if(typeof raw==='string'){try{raw=JSON.parse(raw)}catch{return {}}}
  return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
}
const centavos=x=>Math.round(Number(x)*100);
const fecha=x=>String(x||'').slice(0,10);
const hora=x=>String(x||'').slice(0,8);
const limitar=x=>String(x||'').slice(0,480);

async function releerComprobante(pagoId){
  const pago=await PagoReportado.findByPk(pagoId,{
    attributes:['id','casaId','estatus','comprobanteData','folioOperacion',
      'fechaOperacion','horaOperacion','monto','verificacionBancaria']
  });
  if(!pago||pago.estatus!==STATUS)return;
  const previo=revision(pago.verificacionBancaria);
  if(previo.etapa!=='REINTENTO_OCR')return;
  try{
    if(!pago.comprobanteData)throw Error('No se encontró la imagen original del comprobante.');
    const texto=await lector.reconocerImagen(pago.comprobanteData);
    const titular=process.env.PAGOS_TITULAR||'MARIA DEL ROCIO BAHENA JUAREZ';
    const terminacion=process.env.PAGOS_DESTINO_ULTIMOS4||'4409';
    const destino=parser.verifyDestination(texto,titular,terminacion);
    if(!destino.ok)throw Error('El nuevo OCR no comprobó el beneficiario y la cuenta destino en la imagen original.');
    const extraido=parser.extract(texto);
    // Comprobar de nuevo todos los campos. No sustituir silenciosamente el importe,
    // identificador, fecha u hora del reporte: cambios necesitan revisión humana.
    // Un banco puede omitir la hora o imprimir el día operativo SPEI.
    // Importe + identificador OCR deben estar presentes; la fecha real,
    // destino y vigencia se contrastan INDEPENDIENTEMENTE con Titan.
    lector.validarCamposExtraidos({
      folioOperacion:pago.folioOperacion,
      fechaOperacion:fecha(pago.fechaOperacion),
      horaOperacion:hora(pago.horaOperacion),
      monto:pago.monto
    },{...extraido,candidatos:parser.candidatosOperacion(texto)},false);
    if(!extraido.amount||centavos(extraido.amount)!==centavos(pago.monto))
      throw Error('El monto extraído de la imagen no coincide con el importe reportado.');
    const ids=identificadores.almacenarVerificados(extraido,pago.folioOperacion,texto);
    const [updated]=await PagoReportado.update({
      textoOcr:texto.slice(0,12000),
      identificadoresVerificados:ids,
      verificacionBancaria:{
        ...previo,etapa:'REINTENTO_TITAN',fechaRevision:new Date().toISOString(),
        detalle:'OCR repetido: el importe y un identificador se comprobaron sobre la imagen. Titan cotejará fecha, cuenta y datos bancarios.',
        ocrReleido:true
      },
      actualizadoEn:new Date()
    },{where:{id:pagoId,estatus:STATUS}});
    if(updated)bancoWorker.programarRevision();
    return {ok:Boolean(updated),etapa:'REINTENTO_TITAN'};
  }catch(error){
    const message=limitar(error?.message||'Error de lectura');
    await PagoReportado.update({
      estatus:'RECHAZADO',
      verificacionBancaria:{
        ...previo,etapa:'REINTENTO_OCR_FALLIDO',fechaRevision:new Date().toISOString(),
        detalle:'No se pudo completar la nueva lectura OCR: '+message
      },
      observacionesRevision:'OCR de reintento: '+message,
      actualizadoEn:new Date()
    },{where:{id:pagoId,estatus:STATUS}});
    console.warn('[Pagos][Reintento OCR] No concluyó la relectura para id='+Number(pagoId)+': '+message);
    return {ok:false,etapa:'REINTENTO_OCR_FALLIDO'};
  }
}
function programarRelectura(pagoId){
  setImmediate(()=>{
    void releerComprobante(pagoId).catch(error=>{
      console.error('[Pagos][Reintento OCR] Error no controlado id='+Number(pagoId)+': '+(error?.message||'desconocido'));
    });
  });
}
module.exports={releerComprobante,programarRelectura};
