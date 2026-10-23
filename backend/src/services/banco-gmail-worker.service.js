'use strict';
const {PagoReportado,Casa}=require('../models');
const banco=require('./banco-gmail.service');
let ocupado=false,programado=false,timer=null;
async function ejecutarRevision(){
 if(ocupado||!banco.configurado())return;
 ocupado=true;
 try{
  const pendientes=await PagoReportado.findAll({
   where:{estatus:'PENDIENTE_VALIDACION'},
   include:[{model:Casa,as:'casa',required:true,attributes:['calle','calleCorrecta','numero']}],
   attributes:['id','casaId','estatus','folioOperacion','fechaOperacion','monto'],
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
  console.error('[Bancos] Verificación Gmail no disponible:',error.message);
 }finally{ocupado=false}
}
function programarRevision(){
 if(!banco.configurado()||programado)return;
 programado=true;
 setImmediate(()=>{programado=false;void ejecutarRevision();});
}
function iniciar(){
 if(!banco.configurado()){
  console.info('[Bancos] Autovalidación Gmail desactivada; los pagos permanecen en revisión.');
  return;
 }
 if(timer)return;
 programarRevision();
 const ms=Math.max(30000,Number(process.env.PAGOS_BANK_POLL_MS)||45000);
 timer=setInterval(()=>void ejecutarRevision(),ms);
 timer.unref?.();
 console.info('[Bancos] Revisión de notificaciones Gmail iniciada.');
}
module.exports={iniciar,ejecutarRevision,programarRevision};
