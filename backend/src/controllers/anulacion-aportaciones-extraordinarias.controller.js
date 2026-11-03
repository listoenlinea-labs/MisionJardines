'use strict';
const service=require('../services/anulacion-aportaciones-extraordinarias.service');
const params=req=>({proyectoId:req.params.proyectoId,casaId:req.params.casaId,
 origen:req.params.origen,id:req.params.movimientoId});
function error(res,e){
 if(!e.status)console.error('[anulación extraordinarias]',e);
 return res.status(e.status||503).json({ok:false,
  message:e.status?e.message:'No se pudo anular la aportación de forma segura.'});
}
async function vista(req,res){
 try{const data=await service.vistaPrevia(params(req));res.setHeader('Cache-Control','no-store');return res.json({ok:true,data});}
 catch(e){return error(res,e);}
}
async function anular(req,res){
 try{
  const data=await service.anular(params(req),req.body,req.usuario.usuarioId);
  return res.json({ok:true,data,message:'Aportación anulada con auditoría. Mantenimiento y TAGs no se modificaron.'});
 }catch(e){return error(res,e);}
}
module.exports={vista,anular};
