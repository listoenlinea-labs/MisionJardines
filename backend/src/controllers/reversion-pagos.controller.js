'use strict';
const service=require('../services/reversion-pagos.service');
const fail=(res,error)=>{if(!error.status)console.error('[reversión pagos]',error);return res.status(error.status||503).json({ok:false,message:error.status?error.message:'No se pudo anular el pago de forma segura'});};
async function vista(req,res){
 try{return res.json({ok:true,data:await service.vistaPrevia(Number(req.params.casaId),String(req.query.referencia||''))});}
 catch(error){return fail(res,error);}
}
async function anular(req,res){
 try{
  if(req.body?.confirmacion!=='ANULAR')return res.status(400).json({ok:false,message:'Escribe ANULAR para confirmar'});
  return res.json({ok:true,data:await service.anular(Number(req.params.casaId),String(req.body.referencia||''),req.usuario.usuarioId)});
 }catch(error){return fail(res,error);}
}
module.exports={vista,anular};
