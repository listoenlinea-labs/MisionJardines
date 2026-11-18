'use strict';
const {QueryTypes}=require('sequelize');
const db=require('../config/database');
const {PagoReportado,CuotaExtraordinaria}=require('../models');
const links=require('./whatsapp-bot-vinculos.service');
const free=require('./whatsapp-presupuesto-cero.service');
let running=false;
async function pdfValidado(pago,auth){
 const recibos=require('./recibo-mantenimiento-analisis.service');
 try{
  if(pago.tipoPago==='MANTENIMIENTO'){
   const {recibo}=await recibos.consultarPago(auth.casaId,null,pago.folioOperacion);
   return recibos.generarPdf(recibo);
  }
  if(pago.tipoPago==='EXTRAORDINARIO'&&pago.cuotaExtraordinariaId){
   const {recibo}=await require('./recibo-extraordinario-analisis.service')
    .consultarPago(auth.casaId,pago.cuotaExtraordinariaId,pago.folioOperacion);
   return recibos.generarPdf(recibo);
  }
 }catch(e){
  // Un comprobante histórico puede no tener vínculo completo al movimiento;
  // en ese caso, generar el recibo bancario validado estándar del mismo pago.
  console.warn('[WhatsApp Bot] Recibo de movimiento no disponible:',e.name);
 }
 const standard=await require('./pago-reportado-pdf.service').generarReciboPagoReportado(pago);
 return {buffer:standard.buffer,nombreArchivo:standard.fileName};
}
async function notifyPayments(){
 if(running||process.env.WHATSAPP_BOT_ENABLED!=='true')return;
 running=true;
 try{
  const rows=await db.query("SELECT w.pago_id,w.remitente,w.usuario_id,w.casa_id,w.avisado_en FROM whatsapp_bot_pagos w INNER JOIN pagos_reportados p ON p.id=w.pago_id AND p.estatus='VALIDADO' WHERE w.enviado_en IS NULL ORDER BY w.creado_en ASC LIMIT 25",
   {type:QueryTypes.SELECT});
  for(const row of rows){
   try{
    const [auth,reciente,pago]=await Promise.all([
     links.verificar(row.remitente,row.casa_id),
     free.hasRecentInbound(row.remitente),
     PagoReportado.findByPk(row.pago_id,{include:[{model:CuotaExtraordinaria,
       as:'cuotaExtraordinaria',required:false,attributes:['id','concepto']} ]})
    ]);
    if(!auth||auth.usuarioId!==Number(row.usuario_id)||!reciente||!pago||
     pago.estatus!=='VALIDADO'||Number(pago.casaId)!==Number(row.casa_id))continue;
    if(!row.avisado_en){
     const ok=await free.send(row.remitente,'✅ Tu pago fue ACEPTADO después de la validación bancaria. Enseguida te envío el recibo PDF correspondiente.');
     if(!ok)continue;
     await db.query('UPDATE whatsapp_bot_pagos SET avisado_en=NOW() WHERE pago_id=:id AND avisado_en IS NULL',
      {replacements:{id:row.pago_id}});
    }
    const pdf=await pdfValidado(pago,auth);
    const ok=await free.document(row.remitente,pdf.buffer,pdf.nombreArchivo||'Recibo_Mision_Jardines.pdf',
     'Recibo de pago validado en Misión Jardines');
    if(!ok)continue;
    await db.query('UPDATE whatsapp_bot_pagos SET enviado_en=NOW() WHERE pago_id=:id AND enviado_en IS NULL',
     {replacements:{id:row.pago_id}});
   }catch(e){console.warn('[WhatsApp Bot] Notificación de pago pendiente:',String(e.message||e).slice(0,140));}
  }
 }catch(e){console.warn('[WhatsApp Bot] Seguimiento de recibos:',String(e.message||e).slice(0,140));}
 finally{running=false;}
}
module.exports={notifyPayments,pdfValidado};
