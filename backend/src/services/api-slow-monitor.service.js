'use strict';
// Registro diagnóstico sin consultas extra ni datos personales.
// No registrar querystrings, folios, tokens o cuerpos de peticiones.
module.exports=function monitor(req,res,next){
 const start=process.hrtime.bigint();
 res.once('finish',()=>{
  const elapsed=Number(process.hrtime.bigint()-start)/1e6;
  if(elapsed<1500)return;
  const path=req.route?.path;
  // Plantilla de Express sin valores privados interpolados.
  const endpoint=typeof path==='string'?(req.baseUrl||'')+path:(req.baseUrl||'/api');
  console.warn('[Misión Jardines][API lenta]',JSON.stringify({
   method:req.method,route:endpoint,status:res.statusCode,ms:Math.round(elapsed)
  }));
 });
 next();
};
