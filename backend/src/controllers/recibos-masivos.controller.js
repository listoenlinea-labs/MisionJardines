'use strict';
const recibos=require('../services/recibos-masivos.service');
async function lista(req,res){try{return res.json({ok:true,data:{periodos:await recibos.periodos()}});}catch(e){return res.status(503).json({ok:false,message:'No se pudieron consultar períodos'});}}
async function zip(req,res){try{
 const {periodo,buffer,cantidad}=await recibos.generar(req.query.periodo);
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/zip');
 res.setHeader('Content-Disposition','attachment; filename="MJ_recibos_'+periodo+'.zip"');
 res.setHeader('X-Recibos-Count',String(cantidad));return res.send(buffer);
}catch(e){if(!e.status)console.error('[ZIP recibos]',e);return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No se pudo generar el ZIP'});}}
module.exports={lista,zip};
