'use strict';
// Contador de cambios en memoria: NO consulta MySQL.
let revision=1,updatedAt=Date.now();
function mark(){revision++;updatedAt=Date.now();}
function read(){return {revision,updatedAt};}
function observe(req,res,next){
 if(!['POST','PATCH','PUT','DELETE'].includes(req.method))return next();
 const url=String(req.originalUrl||'');
 if(!/^\/api\/(finanzas|pagos|cuotas|zkteco|viviendas|casas|seguridad-cuotas)(\/|\?|$)/.test(url))return next();
 if(/\/(recibo|recibos|drive|previsualizar|cotizar|enviar-correo)(\/|$)/i.test(url))return next();
 res.once('finish',()=>{if(res.statusCode>=200&&res.statusCode<300)mark();});
 next();
}
module.exports={mark,read,observe};
