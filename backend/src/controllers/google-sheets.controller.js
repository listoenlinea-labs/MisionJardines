'use strict';
const crypto=require('node:crypto');
const {readSheet,assertType}=require('../services/google-sheets.service');
const Historico=require('../models/GoogleSheetsHistorico');
const {Op}=require('sequelize');
function error(res,e){
  if(!e.status)console.error('[google-sheets]',e);
  return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible consultar Google Sheets'});
}
async function preview(req,res){
  try{
    const tipo=String(req.query.tipo||'');assertType(tipo);
    const data=await readSheet(tipo);
    res.setHeader('Cache-Control','private, no-store');
    return res.json({ok:true,tipo,encabezados:data.encabezados,total:data.total,
      rango:data.range,filas:data.filas.slice(0,20),
      nota:'Lectura histórica sin alterar cuotas, depósitos ni egresos de MySQL.'});
  }catch(e){return error(res,e)}
}
async function stage(req,res){
  try{
    const tipo=String(req.body?.tipo||'');assertType(tipo);
    if(req.body?.confirmar!=='IMPORTAR_A_REVISION')return res.status(400).json({ok:false,message:'Se requiere confirmación explícita'});
    const data=await readSheet(tipo);
    if(data.total>5000)return res.status(413).json({ok:false,message:'Rango demasiado grande'});
    let nuevos=0,existentes=0,conflictos=0;
    for(const row of data.filas){
      const hash=crypto.createHash('sha256').update(JSON.stringify([data.encabezados,row.valores])).digest('hex');
      const key={spreadsheetId:data.spreadsheetId,tipo,fila:row.fila};
      const found=await Historico.findOne({where:key});
      if(found){
        if(found.hash!==hash)conflictos++;
        else existentes++;
        continue; // No se sobrescribe una fila histórica revisada ni pendiente.
      }
      try{
        await Historico.create({...key,encabezados:data.encabezados,valores:row.valores,hash,estado:'PENDIENTE_REVISION'});
        nuevos++;
      }catch(e){
        if(e.name==='SequelizeUniqueConstraintError')existentes++;
        else throw e;
      }
    }
    res.setHeader('Cache-Control','private, no-store');
    return res.json({ok:true,tipo,total:data.total,nuevos,existentes,conflictos,
      message:'Históricos guardados para revisión. No se registraron pagos ni egresos contables automáticamente.'});
  }catch(e){return error(res,e)}
}
async function reviewList(req,res){
  try{
    const tipo=String(req.query.tipo||'');assertType(tipo);
    const page=Math.max(1,Math.min(10000,Number.parseInt(req.query.pagina,10)||1));
    const {rows,count}=await Historico.findAndCountAll({where:{tipo},attributes:['id','tipo','fila','encabezados','valores','estado'],
      order:[['fila','ASC']],limit:30,offset:(page-1)*30});
    res.setHeader('Cache-Control','private, no-store');
    return res.json({ok:true,total:count,pagina:page,filas:rows});
  }catch(e){return error(res,e)}
}
module.exports={preview,stage,reviewList};
