'use strict';
const {PagoReportado,Casa}=require('../models');
const banco=require('./banco-correo.service');
const diagnostico=require('./banco-diagnostico.service');
const identificadores=require('./identificadores-bancarios.service');
// Un único log por pago y valores detectados: no inundar los logs de Hostinger.
const importesYaDiagnosticados=new Map();
const cotejosYaDiagnosticados=new Map();
function registrarFasePendiente(pago,revision){
 const x=revision.cotejoAvisos||{};
 const summary=[revision.etapa,x.filtroBloqueante,x.cuenta,x.importe,x.fecha,
  x.avisosRastreoCpo,x.avisosIdentificadorComparable].join('|');
 if(cotejosYaDiagnosticados.get(pago.id)===summary)return;
 if(cotejosYaDiagnosticados.size>500)cotejosYaDiagnosticados.clear();
 cotejosYaDiagnosticados.set(pago.id,summary);
 // Sólo números de avisos por filtro; nunca publicar referencias bancarias.
 console.info('[Bancos][Cotejo pendiente] pago ID='+pago.id+
  ' fase='+String(x.filtroBloqueante||revision.etapa)+
  ' cuenta='+Number(x.cuenta||0)+' importe='+Number(x.importe||0)+
  ' fecha='+Number(x.fecha||0)+' rastreosCPO='+Number(x.avisosRastreoCpo||0)+
  ' identificadores='+Number(x.avisosIdentificadorComparable||0));
}
function registrarImporteRelacionado(pago,autenticados){
 const relacionados=autenticados.filter(aviso=>{
  const comprobacion=banco.chequeosAviso(pago,aviso);
  return comprobacion.cuenta&&comprobacion.fecha&&identificadores.coinciden(pago,aviso);
 });
 if(relacionados.length!==1)return;
 const aviso=relacionados[0];
 const montoCorreo=aviso.monto;
 const identificadorCoincide=identificadores.coinciden(pago,aviso);
 const parsedIds=identificadores.identificadoresAviso(aviso);
 const montoReportado=Number(pago.monto);
 if(!Number.isFinite(montoReportado))return;
 // Diagnóstico administrativo SIN correo, cuenta, concepto, referencia o clave.
 // Solo se imprimen importes de un único aviso autenticado asociado por
 // identificador, fecha y cuenta; la referencia se muestra solo como booleano.
 // No incluye mensaje, cuenta, referencia ni correo. Este log NO aprueba pagos.
 const resumen=String(montoReportado)+'|'+String(montoCorreo)+'|'+String(identificadorCoincide)+'|'+String(Boolean(parsedIds.referencia));
 if(importesYaDiagnosticados.get(pago.id)===resumen)return;
 if(importesYaDiagnosticados.size>500)importesYaDiagnosticados.clear();
 importesYaDiagnosticados.set(pago.id,resumen);
 console.warn('[Bancos][Diagnostico importe] Pago ID='+pago.id+
  ' monto reportado='+montoReportado.toFixed(2)+
  ' monto leido en Titan='+(Number.isFinite(montoCorreo)?montoCorreo.toFixed(2):'NO_LEGIBLE')+
  ' referenciaTitánPresente='+Boolean(parsedIds.referencia)+
  ' identificadorCoincide='+identificadorCoincide+
  ' (solo diagnostico: NO confirma deposito)');
}
// Rescate puntual: si un pago sigue bloqueado en etapa 5 después de
// pulsar Actualizar, intentar recuperar el rastreo de la MISMA imagen
// original. No rehace ni invalida los pasos ya aprobados, ni acredita sin
// comprobar el aviso bancario real. Evita releerla cada 15 segundos.
async function rescatarRastreoOcr(pago,autenticados,revision){
 const info=revision?.cotejoAvisos||{};
 const previo=datosReintento(pago.verificacionBancaria);
 if(revision?.etapa!=='SIN_COINCIDENCIA'||previo.etapa!=='REINTENTO_TITAN'||
    !info.avisosRastreoCpo||!info.cuenta||!info.importe||!info.fecha)return false;
 const before=Date.parse(previo.ultimoRescateOcrEn||'');
 if(Number.isFinite(before)&&Date.now()-before<10*60*1000)return false;
 const candidatos=autenticados.filter(aviso=>{
  const check=banco.chequeosAviso(pago,aviso);
  return check.cuenta&&check.importe&&check.fecha&&/^CPO\d{10,17}$/.test(String(aviso.tracking||''));
 });
 if(!candidatos.length)return false;
 const cuando=new Date().toISOString();
 // Marcar ANTES de iniciar el OCR para evitar relecturas simultáneas.
 const inicio={...previo,ultimoRescateOcrEn:cuando,origenRescate:'COMPROBANTE_ORIGINAL',
  rescateOcrEstado:'EN_CURSO'};
 await PagoReportado.update({verificacionBancaria:inicio},{where:{id:pago.id,estatus:'PENDIENTE_VALIDACION'}});
 pago.setDataValue('verificacionBancaria',inicio);
 try{
  const original=await PagoReportado.findByPk(pago.id,{attributes:['comprobanteData']});
  if(!original?.comprobanteData)throw Error('Comprobante original no disponible');
  const texto=await require('./comprobante-lector.service').reconocerImagen(original.comprobanteData);
  const ids=require('./identificadores-bancarios.service');
  const encontrados=[...new Set(candidatos.filter(a=>{
   const num=String(a.tracking).slice(3);
   return ids.rastreosNumericosOcr(texto).includes(num)||
    ids.rastreoEnTextoOcr(texto,num);
  }).map(a=>String(a.tracking).slice(3)))];
  // Nunca elegir un rastreo arbitrario si la imagen parece contener varios.
  if(encontrados.length!==1)throw Error('No apareció una clave bancaria única en el nuevo OCR');
  const meta=pago.identificadoresVerificados;
  const previoMeta=meta&&typeof meta==='object'&&meta.origen==='OCR_SERVIDOR'?meta:null;
  const nuevo={version:2,origen:'OCR_SERVIDOR',
   tipo:previoMeta?.tipo||'candidato',
   claveRastreo:previoMeta?.claveRastreo||'',
   referencia:previoMeta?.referencia||'',
   folio:previoMeta?.folio||'',
   candidatos:[...new Set([...(previoMeta?.candidatos||[]),...encontrados])].slice(0,30)};
  await PagoReportado.update({identificadoresVerificados:nuevo},{
   where:{id:pago.id,estatus:'PENDIENTE_VALIDACION'}});
  pago.setDataValue('identificadoresVerificados',nuevo);
  inicio.rescateOcrEstado='RASTREO_RECUPERADO';
  console.info('[Bancos][OCR] Se recuperó un rastreo verificable para pago ID='+pago.id);
  return true;
 }catch(error){
  inicio.rescateOcrEstado='SIN_RASTREO';
  console.warn('[Bancos][OCR] Pago '+pago.id+' requiere cotejo bancario manual; no se recuperó identificador único.');
  return false;
 }finally{
  pago.setDataValue('verificacionBancaria',inicio);
  await PagoReportado.update({verificacionBancaria:inicio},{
   where:{id:pago.id,estatus:'PENDIENTE_VALIDACION'}});
 }
}

let ocupado=false,programado=false,timer=null,revisionSolicitada=false;
function datosReintento(raw){
 if(typeof raw==='string'){try{raw=JSON.parse(raw)}catch{return {}}}
 return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
}
async function persistir(pago,revision,fallido=false){
 // Conservar el contador y la bitácora de reintentos incluso cuando Titan
 // reemplace el diagnóstico. Evita reintentos infinitos después de FALLIDO.
 const anterior=datosReintento(pago.verificacionBancaria);
 const cambios={verificacionBancaria:{
   ...revision,
   reintentos:Math.max(0,Number(anterior.reintentos)||0),
   ultimaConsultaManualEn:anterior.ultimaConsultaManualEn||null,
   ultimoRescateOcrEn:anterior.ultimoRescateOcrEn||null,
   rescateOcrEstado:anterior.rescateOcrEstado||null,
   ultimoReintentoEn:anterior.ultimoReintentoEn||null,
   historialReintentos:Array.isArray(anterior.historialReintentos)?anterior.historialReintentos:[]
 },actualizadoEn:new Date()};
 if(fallido){
  cambios.estatus='RECHAZADO'; // Estado existente del esquema; en UI se etiqueta Fallido.
  cambios.observacionesRevision=String(revision.detalle||'No fue posible conciliar el depósito.').slice(0,600);
 }
 await PagoReportado.update(cambios,{where:{id:pago.id,estatus:'PENDIENTE_VALIDACION'}});
}
async function ejecutarRevision(){
 if(ocupado||!banco.configurado())return;
 ocupado=true;
 let pendientes=[];
 try{
  pendientes=await PagoReportado.findAll({
   where:{estatus:'PENDIENTE_VALIDACION'},
   include:[{model:Casa,as:'casa',required:true,attributes:['calle','calleCorrecta','numero']}],
   attributes:['id','casaId','estatus','folioOperacion','identificadoresVerificados','textoOcr','fechaOperacion','horaOperacion','monto','verificacionBancaria'],
   order:[['creadoEn','DESC']],limit:100
  });
  if(!pendientes.length)return;
  // Mantener TODOS los avisos: los descartados por autenticación también
  // cuentan para explicar por qué el pago sigue pendiente.
  const avisos=await banco.obtenerAvisos();
  const autenticados=avisos.filter(n=>n.autorizado&&n.reciente);
  console.info('[Bancos] Revisión: pagos pendientes='+pendientes.length+', avisos consultados='+avisos.length+', remitente autorizado recientes='+autenticados.length);
  for(const pago of pendientes){
   try{
    // No evaluar contra Titan antes de concluir la lectura OCR del reintento.
    // Evita que un worker periódico use datos bancarios anteriores.
    if(datosReintento(pago.verificacionBancaria).etapa==='REINTENTO_OCR')continue;
    let revision=diagnostico.evaluar(pago,avisos,autenticados);
    if(await rescatarRastreoOcr(pago,autenticados,revision)){
     revision=diagnostico.evaluar(pago,avisos,autenticados);
    }else if(revision.etapa==='SIN_COINCIDENCIA' &&
      datosReintento(pago.verificacionBancaria).rescateOcrEstado==='SIN_RASTREO'){
     revision.detalle+=' Se intentó recuperar el número desde la imagen original sin hallar una clave completa que vincule un único aviso. Administración puede revisar el depósito directamente en el banco.';
    }
    if(revision.cotejoAvisos?.filtroBloqueante==='IMPORTE')
      registrarImporteRelacionado(pago,autenticados);
    if(revision.etapa==='FALLIDO'){
     await persistir(pago,revision,true);
     console.warn('[Bancos] Conciliación fallida con evidencia bancaria incompatible; pago ID='+pago.id);
     continue;
    }
    if(revision.etapa!=='COINCIDENCIA_VERIFICADA'){
     await persistir(pago,revision);
     if(revision.etapa==='SIN_COINCIDENCIA'||revision.etapa==='DATOS_INCOMPLETOS')
      registrarFasePendiente(pago,revision);
     console.info('[Bancos] Pago '+pago.id+' '+revision.etapa);
     continue;
    }
    const completos=diagnostico.coincidenciasCompletas(pago,autenticados);
    const aviso=completos.length===1?completos[0]:null;
    if(!aviso){
     await persistir(pago,diagnostico.resultado('SIN_COINCIDENCIA',
      'La comprobación final no encontró una coincidencia bancaria completa. Se mantiene en revisión.',
      {avisosConsultados:avisos.length,avisosAutenticados:autenticados.length}));
     continue;
    }
    // Sin clave compartida, no asignar el mismo aviso por coincidencia de
    // concepto a varios comprobantes pendientes (misma vivienda/importe/fecha).
    if(!identificadores.coinciden(pago,aviso)){
     const candidatas=pendientes.filter(otro=>banco.corresponde(otro,aviso));
     if(candidatas.length!==1){
      await persistir(pago,diagnostico.resultado('COINCIDENCIA_AMBIGUA',
       'Hay más de un comprobante pendiente compatible con el mismo aviso bancario. Se requiere revisión para evitar aplicar el depósito dos veces.',
       {avisosConsultados:avisos.length,avisosAutenticados:autenticados.length,
        coincidencias:candidatas.length}));
      continue;
     }
    }
    const hash=banco.huellaMensaje(aviso.id);
    const usado=await PagoReportado.findOne({where:{correoBancarioHash:hash},attributes:['id']});
    if(usado){
     await persistir(pago,diagnostico.resultado('FALLIDO',
      'La notificación bancaria coincidente ya fue utilizada para acreditar otro comprobante. No es posible reutilizarla.',
      {avisosConsultados:avisos.length,avisosAutenticados:autenticados.length,coincidencias:1}),true);
     continue;
    }
    await persistir(pago,revision);
    const {confirmarPagoDesdeBanco}=require('../controllers/pagos.controller');
    await confirmarPagoDesdeBanco(pago.id,hash);
    console.info('[Bancos] Pago conciliado por aviso de remitente autorizado, id:',pago.id);
   }catch(error){
    // Los fallos del proceso NO significan que la transferencia haya fallado.
    console.error('[Bancos] Error procesando pago ID='+pago.id+': '+(error?.message||'desconocido'));
    try{await persistir(pago,diagnostico.resultado('ERROR_PROCESO',
      'Se encontró un problema técnico al aplicar la conciliación. No se ha confirmado ni rechazado el depósito; el sistema reintentará.'))}
    catch(e){console.error('[Bancos] No fue posible registrar diagnóstico del pago '+pago.id+': '+e.name)}
   }
  }
 }catch(error){
  // Contraseña, DNS, TLS, IMAP, lectura incompleta: sin señales de rechazo bancario.
  console.error('[Bancos] Verificación buzón IMAP no disponible:',error.message);
  for(const pago of pendientes){
   if(datosReintento(pago.verificacionBancaria).etapa==='REINTENTO_OCR')continue;
   try{await persistir(pago,diagnostico.resultado('ERROR_BUZON',
    'No fue posible consultar el buzón bancario Titan. El depósito sigue en revisión y se reintentará.'))}
   catch(e){console.error('[Bancos] Error guardando estado IMAP, pago ID='+pago.id+': '+e.name)}
  }
 }finally{
  ocupado=false;
  // Si un usuario pulsó Actualizar durante otra consulta IMAP,
  // cumplir también su solicitud al terminar, sin solapar ejecuciones.
  if(revisionSolicitada){revisionSolicitada=false;programarRevision()}
 }
}
function programarRevision(){
 if(!banco.configurado())return;
 if(ocupado){revisionSolicitada=true;return;}
 if(programado)return;
 programado=true;
 setImmediate(()=>{programado=false;void ejecutarRevision();});
}
function iniciar(){
 if(!banco.configurado()){
  if(process.env.PAGOS_BANK_AUTO_VALIDATE!=='true'){
   console.info('[Bancos] Autovalidación IMAP desactivada: PAGOS_BANK_AUTO_VALIDATE debe ser true. Pagos en revisión.');
  }else{
   const requeridas=['PAGOS_IMAP_HOST','PAGOS_IMAP_MAILBOX','PAGOS_IMAP_PASSWORD',
    'PAGOS_BANK_FORWARD_FROM_ADDRESS','PAGOS_DESTINO_ULTIMOS4'];
   const faltantes=requeridas.filter(nombre=>!String(process.env[nombre]||'').trim());
   console.warn('[Bancos] Autovalidación IMAP no iniciada: faltan variables: '+faltantes.join(', ')+'. Pagos en revisión.');
  }
  return;
 }
 if(timer)return;
 programarRevision();
 // Más rápido sin solapar consultas IMAP: ejecutarRevision ya cuenta con guard ocupado.
 const ms=Math.max(15000,Number(process.env.PAGOS_BANK_POLL_MS)||15000);
 timer=setInterval(()=>void ejecutarRevision(),ms);
 timer.unref?.();
 console.info('[Bancos] Revisión de notificaciones buzón IMAP iniciada.');
}
module.exports={iniciar,ejecutarRevision,programarRevision};
