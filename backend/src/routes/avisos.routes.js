'use strict';
const router=require('express').Router();
const {Op}=require('sequelize');
const {autenticarToken}=require('../middlewares/auth.middleware');
const {autorizarRoles}=require('../middlewares/roles.middleware');
const Aviso=require('../models/AvisoOficial');
router.use(autenticarToken);
const admin=autorizarRoles('SUPER_ADMIN','ADMINISTRADOR');
const reject=(res,error)=>{
 if(!error.status)console.error('[Avisos oficiales]',error);
 return res.status(error.status||503).json({ok:false,message:error.status?error.message:'No se pudieron consultar los avisos.'});
};
const fail=(status,message)=>Object.assign(new Error(message),{status});
const DURACIONES_DIAS=new Set([1,3,5,7,14]);
const MILISEGUNDOS_DIA=24*60*60*1000;
const cleanImage=value=>{
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string')throw fail(400,'Imagen inválida.');
 const found=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
 if(!found)throw fail(400,'Solo se aceptan imágenes PNG, JPG o WebP.');
 const bytes=Buffer.from(found[2],'base64');
 if(bytes.length<8||bytes.length>700*1024)throw fail(413,'La imagen debe pesar menos de 700 KB.');
 const kind=found[1].toLowerCase();
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(!(kind==='png'&&png||kind==='jpeg'&&jpg||kind==='webp'&&webp))throw fail(400,'La imagen no coincide con el formato indicado.');
 return value;
};
const expose=a=>({id:a.id,title:a.titulo,brief:a.resumen,full:a.contenido,
 image:a.imagenData||'',createdAt:a.creadoEn,expiresAt:a.expiraEn});
router.get('/',async(_req,res)=>{
 try{
  const rows=await Aviso.findAll({where:{expiraEn:{[Op.gt]:new Date()}},
   order:[['creadoEn','DESC'],['id','DESC']],limit:100});
  res.set('Cache-Control','private, no-store');
  return res.json({ok:true,data:rows.map(expose)});
 }catch(error){return reject(res,error);}
});
router.post('/',admin,async(req,res)=>{
 try{
  const title=String(req.body?.title||'').trim(),brief=String(req.body?.brief||'').trim(),
   full=String(req.body?.full||'').trim(),durationDays=Number(req.body?.durationDays);
  if(!title||title.length>100||brief.length>300||!full||full.length>20000||
   !Number.isSafeInteger(durationDays)||!DURACIONES_DIAS.has(durationDays))
   throw fail(400,'Completa título, texto del aviso y selecciona 1, 3, 5, 7 o 14 días de vigencia.');
  const plain=full.replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g,' ').replace(/\s+/g,' ').trim();
  if(!plain||plain.length>4000)throw fail(400,'El aviso debe tener entre 1 y 4000 caracteres de texto.');
  const image=cleanImage(req.body?.image);
  const publicadoEn=new Date();
  const expiraEn=new Date(publicadoEn.getTime()+durationDays*MILISEGUNDOS_DIA);
  const item=await Aviso.create({titulo:title,resumen:brief,contenido:full,
   imagenData:image,publicadoPor:req.usuario.usuarioId,creadoEn:publicadoEn,expiraEn});
  return res.status(201).json({ok:true,data:expose(item),message:'Aviso oficial publicado.'});
 }catch(error){return reject(res,error);}
});
router.delete('/:id',admin,async(req,res)=>{
 try{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<=0)throw fail(400,'Aviso inválido.');
  const changed=await Aviso.destroy({where:{id}});
  if(!changed)throw fail(404,'Aviso no encontrado.');
  return res.json({ok:true,message:'Aviso retirado por Administración.'});
 }catch(error){return reject(res,error);}
});
module.exports=router;
