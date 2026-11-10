'use strict';
const r=require('express').Router();
const {Op}=require('sequelize');
const db=require('../config/database');
const {autenticarToken}=require('../middlewares/auth.middleware');
const {autorizarRoles}=require('../middlewares/roles.middleware');
const Casa=require('../models/Casa');
const Control=require('../models/ControlRemoto');
const Evento=require('../models/ControlRemotoEvento');
const {esViviendaVisible}=require('../services/viviendas-visibles.service');
const authorized=autorizarRoles('SUPER_ADMIN','ADMINISTRADOR','MESA_DIRECTIVA');
const DESTINOS=['SIN_ASIGNAR','PORTON_1_ENTRADA','PORTON_1_SALIDA','PORTON_2_ENTRADA','PORTON_2_SALIDA','ACCESO_PEATONAL'];
let schemaPromise=null;
function schema(){
 if(!schemaPromise)schemaPromise=(async()=>{await Control.sync();await Evento.sync();})().catch(e=>{schemaPromise=null;throw e;});
 return schemaPromise;
}
function fail(code,message){const e=new Error(message);e.status=code;throw e;}
function casaId(v){const n=Number(v);if(!Number.isSafeInteger(n)||n<1)fail(400,'Identificador de vivienda inválido');return n;}
function controlId(v){const n=Number(v);if(!Number.isSafeInteger(n)||n<1)fail(400,'Identificador de control inválido');return n;}
function validate(input){
 const codigo=String(input.codigo||'').trim().toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9._-]{1,79}$/.test(codigo))fail(400,'Código obligatorio: 2 a 80 caracteres, letras, números, punto, guion o guion bajo');
 const descripcion=String(input.descripcion||'').trim().slice(0,160);
 const botones=input.botones;
 if(!botones||typeof botones!=='object'||Array.isArray(botones))fail(400,'Configura los botones A, B, C y D');
 const result={};
 for(const key of ['A','B','C','D']){
   const destino=String(botones[key]||'SIN_ASIGNAR').toUpperCase();
   if(!DESTINOS.includes(destino))fail(400,'Destino no permitido para botón '+key);
   result[key]=destino;
 }
 let fechaFin=null;
 if(input.fechaFin!==undefined&&input.fechaFin!==null&&input.fechaFin!==''){
   const date=String(input.fechaFin);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||
      new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)fail(400,'Fecha de vigencia inválida');
   fechaFin=date;
 }
 return {codigo,descripcion,botones:result,fechaFin};
}
function actor(req){return Number(req.usuario?.usuarioId)||null;}
async function audit(req,accion,control,extra){
 await Evento.create({accion,controlId:control?.id||null,casaId:control?.casaId||null,
  actorId:actor(req),detalle:JSON.stringify(extra||{}),createdAt:new Date()});
}
async function visibleHouse(id){
 const casa=await Casa.findByPk(casaId(id),{attributes:['id','calle','calleCorrecta','numero']});
 if(!casa||!esViviendaVisible(casa))fail(404,'Vivienda no encontrada');
 return casa;
}
const handler=fn=>async(req,res)=>{try{await schema();await fn(req,res)}catch(error){
  if(error.name==='SequelizeUniqueConstraintError')return res.status(409).json({ok:false,message:'Ese código de control ya existe'});
  const status=error.status||503;
  if(!error.status)console.error('[Controles remotos MJ]',error.message);
  return res.status(status).json({ok:false,message:error.status?error.message:'No fue posible acceder al inventario de controles remotos. Verifica permisos de MySQL.'});
}};
r.use(autenticarToken,authorized);
r.get('/viviendas',handler(async(req,res)=>{
 const casas=(await Casa.findAll({attributes:['id','calle','calleCorrecta','numero'],order:[['calle','ASC'],['numero','ASC']]}))
  .filter(esViviendaVisible);
 const controles=await Control.findAll({order:[['createdAt','DESC']]});
 const map=new Map();
 for(const control of controles){const key=Number(control.casaId);if(!map.has(key))map.set(key,[]);map.get(key).push(control);}
 res.set('Cache-Control','private, no-store');
 res.json({ok:true,data:casas.map(casa=>({
   id:casa.id,calle:casa.calle,calleCorrecta:casa.calleCorrecta,numero:casa.numero,
   controles:(map.get(Number(casa.id))||[]).map(c=>c.toJSON())
 })),integracionFisica:false,mensaje:'Cambios administrativos guardados en MySQL; no programan ni bloquean físicamente el PO1000.'});
}));
r.get('/logs',handler(async(req,res)=>{
 const rows=await Evento.findAll({order:[['createdAt','DESC']],limit:150});
 res.set('Cache-Control','private, no-store');
 res.json({ok:true,data:rows});
}));
r.post('/viviendas/:id/controles',handler(async(req,res)=>{
 const casa=await visibleHouse(req.params.id);
 const data=validate(req.body||{});
 const control=await Control.create({...data,casaId:casa.id,activo:true,creadoPor:actor(req),actualizadoPor:actor(req)});
 await audit(req,'ALTA',control,{codigo:control.codigo,botones:control.botones});
 res.status(201).json({ok:true,data:control,message:'Control registrado en inventario. Pendiente de integración física con PO1000.'});
}));
r.patch('/controles/:id',handler(async(req,res)=>{
 const control=await Control.findByPk(controlId(req.params.id));if(!control)fail(404,'Control no encontrado');
 const casa=await visibleHouse(req.body?.casaId||control.casaId);
 const data=validate({...control.toJSON(),...req.body});
 await control.update({...data,casaId:casa.id,actualizadoPor:actor(req)});
 await audit(req,'EDICION',control,{codigo:control.codigo,botones:control.botones,fechaFin:control.fechaFin});
 res.json({ok:true,data:control,message:'Cambios administrativos guardados (sin envío al PO1000).'});
}));
r.patch('/controles/:id/bloqueo',handler(async(req,res)=>{
 if(typeof req.body?.bloqueado!=='boolean')fail(400,'Indica bloqueado=true o false');
 const control=await Control.findByPk(controlId(req.params.id));if(!control)fail(404,'Control no encontrado');
 await control.update({activo:!req.body.bloqueado,actualizadoPor:actor(req)});
 await audit(req,req.body.bloqueado?'BLOQUEO':'ACTIVACION',control,{alcance:'solo_base_de_datos'});
 res.json({ok:true,data:control,message:'Estado administrativo actualizado; el control físico puede seguir abriendo el portón.'});
}));
r.patch('/viviendas/:id/bloqueo',handler(async(req,res)=>{
 const casa=await visibleHouse(req.params.id);
 if(typeof req.body?.bloqueado!=='boolean')fail(400,'Indica bloqueado=true o false');
 const controles=await Control.findAll({where:{casaId:casa.id}});
 await db.transaction(async t=>{
   await Control.update({activo:!req.body.bloqueado,actualizadoPor:actor(req)},{where:{casaId:casa.id},transaction:t});
   await Evento.create({casaId:casa.id,accion:req.body.bloqueado?'BLOQUEO_VIVIENDA':'ACTIVACION_VIVIENDA',
    actorId:actor(req),detalle:JSON.stringify({total:controles.length,alcance:'solo_base_de_datos'}),createdAt:new Date()},{transaction:t});
 });
 res.json({ok:true,message:'Estado administrativo de '+controles.length+' controles actualizado. Sin efecto físico en PO1000.'});
}));
r.patch('/viviendas/:id/vigencia',handler(async(req,res)=>{
 const casa=await visibleHouse(req.params.id);
 const date=validate({codigo:'TEMP',botones:{},fechaFin:req.body?.fechaFin}).fechaFin;
 const total=await Control.count({where:{casaId:casa.id}});
 await db.transaction(async t=>{
  await Control.update({fechaFin:date,actualizadoPor:actor(req)},{where:{casaId:casa.id},transaction:t});
  await Evento.create({casaId:casa.id,accion:'VIGENCIA_VIVIENDA',actorId:actor(req),detalle:JSON.stringify({fechaFin:date,total}),createdAt:new Date()},{transaction:t});
 });
 res.json({ok:true,message:'Vigencia administrativa de '+total+' controles actualizada. Sin efecto físico en PO1000.'});
}));
r.delete('/controles/:id',handler(async(req,res)=>{
 const control=await Control.findByPk(controlId(req.params.id));if(!control)fail(404,'Control no encontrado');
 await audit(req,'ELIMINACION',control,{codigo:control.codigo,alcance:'solo_base_de_datos'});
 await control.destroy();
 res.json({ok:true,message:'Control eliminado del inventario administrativo, no de la memoria física PO1000.'});
}));
module.exports=r;
