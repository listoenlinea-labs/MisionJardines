'use strict';
const router=require('express').Router();
const rateLimit=require('express-rate-limit');
const {autenticarToken}=require('../middlewares/auth.middleware');
const vinculos=require('../services/whatsapp-bot-vinculos.service');
router.use(rateLimit({windowMs:15*60*1000,limit:25,standardHeaders:true,legacyHeaders:false}));
router.post('/confirmar',autenticarToken,async(req,res)=>{
 try{
  await vinculos.confirmar({
   token:req.body?.token,
   usuarioId:req.usuario.usuarioId,
   casaId:Number(req.body?.casaId)
  });
  res.setHeader('Cache-Control','no-store');
  res.json({ok:true,message:'Vivienda vinculada. Regresa al chat y escribe CONTINUAR.'});
 }catch(e){
  if(!e.status)console.error('[WhatsApp Bot] No se pudo vincular:',e.name);
  res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible vincular tu cuenta'});
 }
});
module.exports=router;
