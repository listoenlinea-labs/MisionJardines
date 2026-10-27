'use strict';
const {PagoReportado,Casa}=require('../models');
const banco=require('./banco-correo.service');
const diagnostico=require('./banco-diagnostico.service');
const identificadores=require('./identificadores-bancarios.service');
// Un único log por pago y valores detectados: no inundar los logs de Hostinger.
const importesYaDiagnosticados=new Map();
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
let ocupado=false,programado=false,timer=null;
async function persistir(pago,revision,fallido=false){
 const cambios={verificacionBancaria:revision,actualizadoEn:new Date()};
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
   attributes:['id','casaId','estatus','folioOperacion','identificadoresVerificados','textoOcr','fechaOperacion','horaOperacion','monto'],
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
    const revision=diagnostico.evaluar(pago,avisos,autenticados);
    if(revision.cotejoAvisos?.filtroBloqueante==='IMPORTE')
      registrarImporteRelacionado(pago,autenticados);
    if(revision.etapa==='FALLIDO'){
     await persistir(pago,revision,true);
     console.warn('[Bancos] Conciliación fallida con evidencia bancaria incompatible; pago ID='+pago.id);
     continue;
    }
    if(revision.etapa!=='COINCIDENCIA_VERIFICADA'){
     await persistir(pago,revision);
     console.info('[Bancos] Pago '+pago.id+' '+revision.etapa);
     continue;
    }
    const aviso=autenticados.find(a=>banco.corresponde(pago,a));
    if(!aviso){
     await persistir(pago,diagnostico.resultado('SIN_COINCIDENCIA',
      'La comprobación final no encontró una coincidencia bancaria completa. Se mantiene en revisión.',
      {avisosConsultados:avisos.length,avisosAutenticados:autenticados.length}));
     continue;
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
   try{await persistir(pago,diagnostico.resultado('ERROR_BUZON',
    'No fue posible consultar el buzón bancario Titan. El depósito sigue en revisión y se reintentará.'))}
   catch(e){console.error('[Bancos] Error guardando estado IMAP, pago ID='+pago.id+': '+e.name)}
  }
 }finally{ocupado=false}
}
function programarRevision(){
 if(!banco.configurado()||programado)return;
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
 const ms=Math.max(30000,Number(process.env.PAGOS_BANK_POLL_MS)||45000);
 timer=setInterval(()=>void ejecutarRevision(),ms);
 timer.unref?.();
 console.info('[Bancos] Revisión de notificaciones buzón IMAP iniciada.');
}
module.exports={iniciar,ejecutarRevision,programarRevision};
