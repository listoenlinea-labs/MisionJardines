'use strict';
// Observaciones pasivas de Asterisk; no se tocan las órdenes de llamada.
const { QueryTypes }=require('sequelize');
const sequelize=require('../config/database');
const eventos=new Set(['TIMBRANDO','CONTESTADA','NO_CONTESTO','OCUPADO','FALLIDA','FINALIZADA']);
const motivos=new Set(['NOANSWER','BUSY','CHANUNAVAIL','CONGESTION','CANCEL','INVALIDARGS','DONTCALL','OTHER']);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
let ready;
function asegurarTabla(){
 if(!ready)ready=sequelize.query(
  'CREATE TABLE IF NOT EXISTS conmutador_eventos_asterisk ('+
  'id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,'+
  'solicitud CHAR(36) NOT NULL,evento VARCHAR(20) NOT NULL,motivo VARCHAR(20) NULL,'+
  'duracion_segundos INT NULL,ocurrido_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),'+
  'UNIQUE KEY uk_conmutador_asterisk_solicitud_evento (solicitud,evento),'+
  'INDEX idx_conmutador_asterisk_solicitud_fecha (solicitud,ocurrido_en)'+
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
 ).catch(error=>{ready=null;throw error;});
 return ready;
}
async function registrar(body){
 if(!uuid(body?.solicitud)||!eventos.has(body.evento))throw Error('Evento no permitido');
 await asegurarTabla();
 const [llamada]=await sequelize.query(
  'SELECT solicitud FROM conmutador_llamadas_seguimiento WHERE solicitud=:solicitud LIMIT 1',
  {replacements:{solicitud:body.solicitud},type:QueryTypes.SELECT});
 if(!llamada)return false;
 const prev=await sequelize.query(
  'SELECT evento FROM conmutador_eventos_asterisk WHERE solicitud=:solicitud',
  {replacements:{solicitud:body.solicitud},type:QueryTypes.SELECT});
 const anteriores=new Set(prev.map(x=>x.evento));
 if(anteriores.has(body.evento))return true;
 const fallos=['NO_CONTESTO','OCUPADO','FALLIDA'];
 if(fallos.some(e=>anteriores.has(e)))return true;
 if(fallos.includes(body.evento)&&(anteriores.has('CONTESTADA')||anteriores.has('FINALIZADA')))return true;
 if(body.evento==='FINALIZADA'&&!anteriores.has('CONTESTADA'))return true;
 if(anteriores.has('FINALIZADA'))return true;
 const motivo=body.evento==='FALLIDA'&&motivos.has(body.motivo)?body.motivo:null;
 const duracion=body.evento==='FINALIZADA'&&Number.isInteger(body.duracionSegundos)&&
  body.duracionSegundos>=0&&body.duracionSegundos<=7200?body.duracionSegundos:null;
 await sequelize.query(
  'INSERT IGNORE INTO conmutador_eventos_asterisk (solicitud,evento,motivo,duracion_segundos) '+
  'VALUES (:solicitud,:evento,:motivo,:duracion)',
  {replacements:{solicitud:body.solicitud,evento:body.evento,motivo,duracion},type:QueryTypes.INSERT});
 return true;
}
async function detalle(solicitud){
 if(!uuid(solicitud))return null;
 const [r]=await sequelize.query(
  'SELECT grupo,numero,estado,'+
  "DATE_FORMAT(creado_en, '%Y-%m-%d %H:%i:%s') AS inicio,"+
  "DATE_FORMAT(confirmado_en, '%Y-%m-%d %H:%i:%s') AS confirmado "+
  'FROM conmutador_llamadas_seguimiento WHERE solicitud=:solicitud '+
  "AND estado IN ('ENVIADA','FINALIZADA') AND confirmado_en IS NOT NULL LIMIT 1",
  {replacements:{solicitud},type:QueryTypes.SELECT});
 if(!r)return null;
 await asegurarTabla();
 const observados=await sequelize.query(
  'SELECT evento,motivo,duracion_segundos AS duracionSegundos,'+
  "DATE_FORMAT(ocurrido_en, '%Y-%m-%d %H:%i:%s') AS fechaHora "+
  'FROM conmutador_eventos_asterisk WHERE solicitud=:solicitud ORDER BY ocurrido_en ASC,id ASC',
  {replacements:{solicitud},type:QueryTypes.SELECT});
 const etapas=[{evento:'SOLICITADA',fechaHora:r.inicio},{evento:'ENVIADA',fechaHora:r.confirmado}];
 for(const item of observados)etapas.push({
  evento:item.evento,fechaHora:item.fechaHora,motivo:motivos.has(item.motivo)?item.motivo:null
 });
 const final=observados.find(item=>item.evento==='FINALIZADA');
 return {
  vivienda:r.grupo+' '+r.numero,etapas,
  telemetriaDisponible:observados.length>0,
  duracionSegundos:final&&final.duracionSegundos!==null&&Number.isInteger(Number(final.duracionSegundos))
   ?Number(final.duracionSegundos):null
 };
}
module.exports={asegurarTabla,registrar,detalle,eventos,motivos};
