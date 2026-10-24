'use strict';
const {PagoReportado,Casa}=require('../models');
const banco=require('./banco-correo.service');
let ocupado=false,programado=false,timer=null;
async function ejecutarRevision(){
 if(ocupado||!banco.configurado())return;
 ocupado=true;
 try{
  const pendientes=await PagoReportado.findAll({
   where:{estatus:'PENDIENTE_VALIDACION'},
   include:[{model:Casa,as:'casa',required:true,attributes:['calle','calleCorrecta','numero']}],
   attributes:['id','casaId','estatus','folioOperacion','fechaOperacion','horaOperacion','monto'],
   order:[['creadoEn','DESC']],limit:100
  });
  if(!pendientes.length)return;
  const avisos=(await banco.obtenerAvisos()).filter(n=>n.autorizado&&n.reciente);
  for(const pago of pendientes){
   const compatibles=avisos.filter(n=>banco.corresponde(pago,n));
   // Dos mensajes con mismo rastreo o distinta evidencia implican revisión humana.
   if(compatibles.length!==1)continue;
   const hash=banco.huellaMensaje(compatibles[0].id);
   const usado=await PagoReportado.findOne({where:{correoBancarioHash:hash},attributes:['id']});
   if(usado)continue;
   try{
    const {confirmarPagoDesdeBanco}=require('../controllers/pagos.controller');
    await confirmarPagoDesdeBanco(pago.id,hash);
    console.info('[Bancos] Pago conciliado por notificación verificada, id:',pago.id);
   }catch(error){
    // Incluye carreras por unique: nada se acredita si la transacción falla.
    console.error('[Bancos] Pendiente de conciliación para id '+pago.id+': '+(error.status||error.name||'ERROR'));
   }
  }
 }catch(error){
  // Nunca aprobar por indisponibilidad, problemas IMAP o correos inconclusos.
  console.error('[Bancos] Verificación buzón IMAP no disponible:',error.message);
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
   // El modo seguro permanece desactivado hasta terminar las pruebas con un depósito real.
   console.info('[Bancos] Autovalidación IMAP desactivada: PAGOS_BANK_AUTO_VALIDATE debe ser true. Pagos en revisión.');
  }else{
   // Reportar únicamente NOMBRES de variables: nunca valores, usuarios, tokens ni contraseñas.
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
