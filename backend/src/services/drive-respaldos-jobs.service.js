'use strict';
// Trabajos asíncronos de respaldo: independientes de la conexión HTTP del navegador.
// Estado en memoria del proceso Node: una reinicialización interrumpe el seguimiento.
// Nunca se reporta COMPLETADO sin haber verificado cada archivo en Drive.
const crypto=require('node:crypto');
const drive=require('./drive-respaldos.service');
const recibos=require('./recibos-masivos.service');
const jobs=new Map();
const fail=(status,message)=>Object.assign(new Error(message),{status});
const expired=()=>{for(const [id,j] of jobs)if(Date.now()-j.createdAt>86400000&&j.estado!=='EN_PROCESO')jobs.delete(id);};
function find(jobId,actor){
 const item=jobs.get(String(jobId));
 if(!item||item.owner!==String(actor))throw fail(404,'No se encontró el respaldo solicitado o el servidor se reinició.');
 return {...item};
}
async function start(body,actor){
 expired();
 const owner=String(actor);
 if([...jobs.values()].some(j=>j.owner===owner&&j.estado==='EN_PROCESO'))
  throw fail(409,'Ya tienes un respaldo en ejecución. Consulta su progreso antes de iniciar otro.');
 const periodos=body?.periodos,proyectoId=body?.proyectoId??null,xlsx=body?.xlsx||null,
  periodoExcel=String(body?.periodoExcel||'');
 if(!Array.isArray(periodos)||periodos.length<1||periodos.length>96||
   new Set(periodos).size!==periodos.length||
   (proyectoId!==null&&(!Number.isSafeInteger(Number(proyectoId))||Number(proyectoId)<1)))
  throw fail(400,'Selecciona períodos únicos y un proyecto válido.');
 periodos.forEach(recibos.parsePeriodo);
 if(xlsx!==null&&(typeof xlsx!=='string'||xlsx.length>2*1024*1024||!periodos.includes(periodoExcel)))
  throw fail(400,'El Excel o su período son inválidos.');
 const status=await drive.status();
 if(!status.connected||!status.folderConfigured)
  throw fail(409,'Conecta Drive y selecciona la carpeta 02_Recibos_PDF.');
 const id=crypto.randomUUID(),job={id,owner,createdAt:Date.now(),estado:'EN_PROCESO',
  periodos:[...periodos],actual:periodos[0],procesados:0,verificados:0,creados:0,actualizados:0,
  carpetaUrl:null,excelUrl:null,excelGuardado:false,error:null};
 jobs.set(id,job);
 void (async()=>{
  try{
   for(const p of periodos){
    job.actual=p;
    let offset=0,rounds=0;
    do{
     if(rounds++>300)throw Error('El respaldo superó el límite de lotes en '+p);
     const result=await drive.subirRecibos({periodo:p,offset,proyectoId});
     if(result.nextOffset<=offset||result.verificados!==result.procesados)
      throw Error('Drive no verificó el lote de '+p+' (posición '+offset+').');
     offset=result.nextOffset;job.procesados+=result.procesados;
     job.verificados+=result.verificados;
     job.creados+=result.creados;job.actualizados+=result.actualizados;
     job.carpetaUrl=result.folderUrl;
     if(result.terminado)break;
    }while(true);
   }
   if(job.verificados<=0)throw Error('No se verificó ningún PDF. No se marcó el respaldo como terminado.');
   if(xlsx){
    job.actual='Guardando Excel';
    const excel=await drive.backup({periodo:periodoExcel,xlsx,soloExcel:true});
    if(!excel.excelGuardado||!excel.excelId)throw Error('No se pudo verificar el Excel en Drive.');
    job.excelGuardado=true;job.excelUrl=excel.folderUrl||null;
   }
   job.estado='COMPLETADO';job.actual='Completado';
  }catch(err){
   console.error('[Drive Respaldo Fondo]',id,err);
   job.estado='ERROR';job.error=String(err.message||'Error guardando recibos en Drive');
  }
 })();
 return {id,estado:job.estado,periodos:job.periodos};
}
module.exports={start,find};
