'use strict';
const service=require('../services/recibos-correo-analisis.service');
function error(res,e){
 if(!e.status)console.error('[recibo correo]',e);
 return res.status(e.status||503).json({ok:false,message:e.status?e.message:
  'El servidor no confirmó el envío del recibo. Verifica SMTP antes de reintentar.'});
}
async function destino(req,res){
 try{
  const correo=await service.consultarCorreo(Number(req.params.casaId));
  res.setHeader('Cache-Control','private, no-store');
  return res.json({ok:true,data:{correo}});
 }catch(e){return error(res,e);}
}
async function enviar(req,res){
 try{
  const data=await service.enviar({casaId:req.params.casaId,concepto:req.body?.concepto,
   proyectoId:req.body?.proyectoId,periodo:req.body?.periodo,
   referencia:req.body?.referencia,actor:req.usuario.usuarioId});
  res.setHeader('Cache-Control','private, no-store');
  return res.json({ok:true,data,message:'Recibo enviado correctamente'});
 }catch(e){return error(res,e);}
}
module.exports={destino,enviar};
