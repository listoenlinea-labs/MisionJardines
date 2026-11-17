'use strict';
// Distribución presupuestaria de fondos; no mueve dinero bancario ni modifica cobros.
const db=require('../config/database');
const {QueryTypes,Transaction,Op}=require('sequelize');
const Egreso=require('../models/Egreso');
const {asegurarPlanes}=require('../services/finanzas-planes-schema.service');
const finanzas=require('./finanzas.controller');
const fail=(status,message)=>Object.assign(Error(message),{status});
const validPeriodo=x=>typeof x==='string'&&/^(20[2-9][0-9])-(0[1-9]|1[0-2])$/.test(x);
const cents=x=>Math.round(Number(x)*100);
const json=x=>Array.isArray(x)?x:typeof x==='string'?JSON.parse(x):[];
const key=x=>x.origen+'|'+x.origenPeriodo;
const analizar=async periodo=>{
 let response=null,code=200;
 await finanzas.analizar({query:{anio:periodo.slice(0,4),mes:Number(periodo.slice(5))}},{
  setHeader(){},status(value){code=value;return this;},
  json(value){response=value;return this;}
 });
 if(code!==200||!response?.ok)throw fail(503,'No se pudo verificar la información financiera de '+periodo);
 return response.data;
};
const fuenteMonto=(a,data)=>{
 if(a.origen==='MANTENIMIENTO')return cents(data?.ingresosMantenimientoCalles?.mes||0);
 if(a.origen==='CASA_CLUB'){
  if(a.origenPeriodo==='ACUMULADO'){
   const source=data?.casaClubGoogle2026;
   if(Number(data?.anio)!==2026||source?.disponible!==true)
    throw fail(409,'El histórico de Casa Club no está disponible o aún no se pudo consultar.');
   return cents(source.total);
  }
  return cents(data?.finanzasAmbitos?.CASA_CLUB?.ingresos||0);
 }
 if(/^PROYECTO:[1-9]\d*$/.test(a.origen))
  return cents((data?.proyectosExtraordinarios||[])
   .find(x=>Number(x.id)===Number(a.origen.slice(9)))?.recaudado||0);
 throw fail(400,'Fuente de dinero inválida');
};
async function leerPlanes(options={}){
 const rows=await db.query('SELECT periodo,version,asignaciones,excluidos,observaciones,actualizado_en FROM finanzas_planes_mensuales ORDER BY periodo',
  {type:QueryTypes.SELECT,...options});
 return rows.map(x=>({...x,asignaciones:json(x.asignaciones),excluidos:json(x.excluidos)}));
}
const error=(res,e)=>{
 if(!e.status)console.error('[Finanzas plan]',e);
 return res.status(e.status||503).json({ok:false,message:e.status?e.message:
  'La base no pudo preparar el plan. Verifica permisos de tablas en MySQL Hostinger y reinicia el backend.'});
};
async function consultar(req,res){
 try{
  const periodo=String(req.query.periodo||'');
  if(!validPeriodo(periodo))throw fail(400,'Elige un periodo YYYY-MM válido');
  await asegurarPlanes();
  const planes=await leerPlanes();
  const plan=planes.find(p=>p.periodo===periodo);
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,periodo,version:plan?.version||0,
   asignaciones:plan?.asignaciones||[],excluidos:plan?.excluidos||[],observaciones:plan?.observaciones||'',
   planes:planes.map(p=>({periodo:p.periodo,version:p.version,asignaciones:p.asignaciones}))});
 }catch(e){return error(res,e);}
}
async function guardar(req,res){
 try{
  const periodo=req.body?.periodo,version=Number(req.body?.version);
  const asignaciones=req.body?.asignaciones,observaciones=String(req.body?.observaciones||'').trim(),
   excluidos=req.body?.excluidos??[];
  if(!validPeriodo(periodo)||!Number.isSafeInteger(version)||version<0||
    !Array.isArray(asignaciones)||asignaciones.length>250||observaciones.length>1200||
    !Array.isArray(excluidos)||excluidos.length>500)
   throw fail(400,'Plan o versión inválidos');
  const clean=asignaciones.map(x=>{
   const egresoId=Number(x?.egresoId),origen=String(x?.origen||''),
    origenPeriodo=String(x?.origenPeriodo||''),monto=Number(x?.monto);
   if(!Number.isSafeInteger(egresoId)||egresoId<1||
      !/^(MANTENIMIENTO|CASA_CLUB|PROYECTO:[1-9]\d*)$/.test(origen)||
      !(origen.startsWith('PROYECTO:')||(origen==='CASA_CLUB'&&origenPeriodo==='ACUMULADO')?
       origenPeriodo==='ACUMULADO':validPeriodo(origenPeriodo)&&origenPeriodo<=periodo)||
      !Number.isSafeInteger(monto)||monto<=0||monto>100000000)
    throw fail(400,'Cada asignación requiere egreso, fuente, periodo e importe válido');
   return {egresoId,origen,origenPeriodo,monto};
  });
  const cleanExcluded=excluidos.map(Number);
  if(cleanExcluded.some(id=>!Number.isSafeInteger(id)||id<1)||
     new Set(cleanExcluded).size!==cleanExcluded.length||
     clean.some(a=>cleanExcluded.includes(a.egresoId)))
   throw fail(400,'Una exclusión debe referirse a un egreso válido sin fondos asignados.');
  await asegurarPlanes();
  const ids=[...new Set(clean.map(x=>x.egresoId).concat(cleanExcluded))];
  const gastos=ids.length?await Egreso.findAll({where:{id:{[Op.in]:ids}},attributes:['id','fecha','monto','ambito','proyectoId']}):[];
  const gastosById=new Map(gastos.map(g=>[Number(g.id),g]));
  for(const id of cleanExcluded){
   const e=gastosById.get(id);
   if(!e||String(e.fecha).slice(0,7)!==periodo)
    throw fail(409,'Un egreso excluido ya no corresponde a este periodo.');
  }
  const porEgreso=new Map();
  for(const x of clean){
   const egreso=gastosById.get(x.egresoId);
   if(!egreso||String(egreso.fecha).slice(0,7)!==periodo)
    throw fail(409,'El egreso seleccionado no corresponde al mes del plan');
   porEgreso.set(x.egresoId,(porEgreso.get(x.egresoId)||0)+cents(x.monto));
   if(porEgreso.get(x.egresoId)>cents(egreso.monto))
    throw fail(409,'El plan supera el importe registrado del egreso '+x.egresoId);
  }
  // Verificación contra el cálculo original del servidor, nunca contra saldos del navegador.
  const result=await db.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.READ_COMMITTED},async transaction=>{
   await db.query('SELECT id FROM finanzas_planes_mutex WHERE id=1 FOR UPDATE',
    {type:QueryTypes.SELECT,transaction});
   const all=await leerPlanes({transaction});
   const previous=all.find(p=>p.periodo===periodo);
   if((previous?.version||0)!==version)
    throw fail(409,'Otro administrador cambió este plan. Actualiza antes de guardar');
   const combined=all.filter(p=>p.periodo!==periodo).flatMap(p=>p.asignaciones).concat(clean);
   const bySource=new Map();
   for(const a of combined){
    if(!Number.isSafeInteger(a.monto)||a.monto<=0)throw fail(409,'Existe una asignación almacenada inválida');
    bySource.set(key(a),(bySource.get(key(a))||0)+cents(a.monto));
   }
   const sources=[...new Map(combined.map(x=>[key(x),x])).values()];
   const targetData=await analizar(periodo);
   const periods=[...new Set(sources.map(x=>x.origenPeriodo).filter(p=>p!=='ACUMULADO'))];
   if(periods.length>18)throw fail(400,'Demasiados periodos de origen');
   const analyzed=new Map(await Promise.all(periods.map(async p=>[p,await analizar(p)])));
   // Los cobros de Casa Club por mes ya se reflejan en el histórico anual.
   // Las asignaciones viejas y las nuevas consumen una sola bolsa contable.
   const clubAllocated=combined.filter(x=>x.origen==='CASA_CLUB')
    .reduce((sum,x)=>sum+cents(x.monto),0);
   if(clubAllocated>0&&Number(targetData?.anio)===2026&&targetData.casaClubGoogle2026?.disponible){
    const annual=cents(targetData.casaClubGoogle2026.total);
    if(clubAllocated>annual)
     throw fail(409,'El total asignado de Casa Club supera la recuperación histórica sin duplicados. Revisa asignaciones anteriores.');
   }
   for(const source of sources){
    const period=source.origenPeriodo;
    const data=period==='ACUMULADO'?targetData:analyzed.get(period);
    const available=fuenteMonto(source,data);
    if(bySource.get(key(source))>available)
     throw fail(409,'El dinero de '+source.origen+' ('+period+') ya está asignado o no alcanza');
   }
   const next=version+1;
   await db.query(`INSERT INTO finanzas_planes_mensuales
     (periodo,version,asignaciones,excluidos,observaciones,actualizado_por)
     VALUES (:periodo,:next,:asignaciones,:excluidos,:observaciones,:usuario)
     ON DUPLICATE KEY UPDATE version=VALUES(version),asignaciones=VALUES(asignaciones),
       excluidos=VALUES(excluidos),observaciones=VALUES(observaciones),actualizado_por=VALUES(actualizado_por)`,
    {transaction,replacements:{periodo,next,asignaciones:JSON.stringify(clean),
     excluidos:JSON.stringify(cleanExcluded),observaciones,usuario:Number(req.usuario.usuarioId)}});
   return {version:next};
  });
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,...result,message:'Plan mensual guardado. No se movieron fondos bancarios.'});
 }catch(e){return error(res,e);}
}
module.exports={consultar,guardar};
