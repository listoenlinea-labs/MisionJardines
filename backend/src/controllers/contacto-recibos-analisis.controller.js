'use strict';
const service=require('../services/contacto-recibos-analisis.service');
async function guardar(req,res){
 try{
  const data=await service.guardarContacto(
   req.params.casaId,req.params.campo,req.body?.valor,req.usuario.usuarioId);
  res.setHeader('Cache-Control','private, no-store');
  return res.json({ok:true,data,message:data.campo==='telefono'?
   'Teléfono guardado en la vivienda':'Correo guardado en la vivienda'});
 }catch(e){
  if(!e.status)console.error('[recibos contacto]',e);
  return res.status(e.status||503).json({ok:false,message:e.status?e.message:
   'No se pudo guardar el contacto de la vivienda.'});
 }
}
module.exports={guardar};
