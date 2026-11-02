'use strict';
const s=require('../services/drive-respaldos.service');
function error(res,e){if(!e.status)console.error('[Drive]',e);return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible respaldar en Drive'});}
async function status(req,res){try{return res.json({ok:true,data:await s.status()});}catch(e){return error(res,e);}}
async function link(req,res){try{return res.json({ok:true,data:{url:s.loginUrl(req.usuario.usuarioId)}});}catch(e){return error(res,e);}}
async function callback(req,res){
 try{await s.callback(req.query.code,req.query.state);return res.type('html').send('<!doctype html><html lang="es"><meta charset="utf-8"><title>Google Drive</title><p>Cuenta de Google Drive conectada. Puedes cerrar esta ventana y actualizar el estado en Misión Jardines.</p></html>');}
 catch(e){console.error('[Google OAuth]',e);return res.status(e.status||500).type('text').send('No fue posible conectar Drive: '+e.message);}
}
async function backup(req,res){try{return res.json({ok:true,data:await s.backup(req.body||{})});}catch(e){return error(res,e);}}
module.exports={status,link,callback,backup};
