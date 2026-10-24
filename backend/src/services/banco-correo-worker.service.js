'use strict';
const {PagoReportado,Casa}=require('../models');
const banco=require('./banco-correo.service');
const diagnostico=require('./banco-diagnostico.service');
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
   attributes:['id','casaId','estatus','folioOperacion','textoOcr','fechaOperacion','horaOperacion','monto'],
   order:[['creadoEn','DESC']],limit:100
  });
  if(!pendientes.length)return;
  // Mantener TODOS los avisos: los descartados por autenticación también
  // cuentan para explicar por qué el pago sigue pendiente.
  const avisos=await banco.obtenerAvisos();
  const autenticados=avisos.filter(n=>n.autorizado&&n.reciente);
  console.info('[Bancos] Revisión: pagos pendientes='+pendientes.length+', avisos consultados='+avisos.length+', autenticados recientes='+autenticados.length);
  for(const pago of pendientes){
   try{
    const revision=diagnostico.evaluar(pago,avisos,autenticados);
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
    console.info('[Bancos] Pago conciliado por notificación verificada, id:',pago.id);
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
    'PAGOS_IMAP_AUTH_SERVER','PAGOS_DESTINO_ULTIMOS4'];
   const faltantes=requeridas.filter(nombre=>!String(process.env[nombre]||'').trim());
   if(!String(process.env.PAGOS_BANK_FROM_ADDRESS||'').trim()&&!String(process.env.PAGOS_BANK_FORWARD_FROM_ADDRESS||'').trim())faltantes.push('PAGOS_BANK_FROM_ADDRESS o PAGOS_BANK_FORWARD_FROM_ADDRESS');
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
