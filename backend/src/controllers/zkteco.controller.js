const ZkTarjeta=require('../models/ZkTarjeta');
const {guardarInventario,simularCorte}=require('../services/zkteco-read.service');
async function estado(req,res){res.json({ok:true,data:{modelo:'C3-200',host:process.env.ZKTECO_HOST||'192.168.1.201',puerto:Number(process.env.ZKTECO_PORT||4370),modo:'SOLO_LECTURA',tarjetas:await ZkTarjeta.count()}});}
async function inventario(req,res){const rows=await ZkTarjeta.findAll({order:[['departamento','ASC'],['numeroTarjeta','ASC']],limit:2000});res.json({ok:true,total:rows.length,data:rows});}
async function importarLectura(req,res){const usuarios=Array.isArray(req.body.usuarios)?req.body.usuarios:[];if(usuarios.length>2000)return res.status(400).json({ok:false,message:'Máximo 2000 registros por lote'});const n=await guardarInventario(usuarios);res.json({ok:true,procesados:n});}
async function simular(req,res){res.json({ok:true,data:await simularCorte(new Date())});}
module.exports={estado,inventario,importarLectura,simular};
