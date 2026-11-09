'use strict';
const store=require('../services/recibos-manuales.service');
const { pdfManual }=require('../services/recibos-manuales-pdf.service');
function fallar(res,e,label){
 if(!e.status)console.error(label,e.message);
 return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No se pudo completar la operación de recibos manuales'});
}
async function crear(req,res){
 res.set('Cache-Control','no-store');
 try{
  const row=await store.crear(req.body,req.usuario.usuarioId);
  return res.status(201).json({ok:true,data:row,
   message:'Recibo manual creado. No se modificaron pagos ni estado de cuenta.'});
 }catch(e){return fallar(res,e,'Crear recibo manual:');}
}
async function listar(req,res){
 res.set('Cache-Control','no-store');
 try{
  const offset=Number(req.query.offset??0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)
   return res.status(400).json({ok:false,message:'Paginación inválida'});
  const rows=await store.listar(30,offset);
  return res.json({ok:true,data:rows,mas:rows.length===30});
 }catch(e){return fallar(res,e,'Historial de recibos manuales:');}
}
async function detalle(req,res){
 res.set('Cache-Control','no-store');
 try{return res.json({ok:true,data:await store.buscar(req.params.id)});}
 catch(e){return fallar(res,e,'Detalle de recibo manual:');}
}
async function pdf(req,res){
 res.set('Cache-Control','no-store');
 try{
  const row=await store.buscar(req.params.id);
  const content=await pdfManual(row);
  res.set('Content-Type','application/pdf');
  res.set('Content-Disposition','inline; filename="'+row.folio+'.pdf"');
  res.set('X-Content-Type-Options','nosniff');
  return res.send(content);
 }catch(e){return fallar(res,e,'PDF de recibo manual:');}
}
module.exports={crear,listar,detalle,pdf};
