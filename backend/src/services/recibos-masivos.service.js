'use strict';
const {Cuota}=require('../models');
const recibos=require('./recibo-mantenimiento-analisis.service');
const zlib=require('node:zlib');
const nombres=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const fail=(status,message)=>Object.assign(new Error(message),{status});
function parsePeriodo(p){const m=/^(20\d{2})-(0[1-9]|1[0-2])$/.exec(String(p||''));if(!m)throw fail(400,'Período inválido: usa AAAA-MM');return {anio:Number(m[1]),mes:nombres[Number(m[2])-1]};}
function crc32(b){let crc=~0;for(const byte of b){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);}return (~crc)>>>0;}
// ZIP estándar con cabeceras locales/centrales y CRC. Los PDFs se comprimen con deflate.
function zip(entries){
 const chunks=[],central=[];let offset=0;
 for(const {name,data} of entries){
  const raw=Buffer.from(data),def=zlib.deflateRawSync(raw),fname=Buffer.from(name.replace(/[^a-zA-Z0-9._\/-]/g,'_'));
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0,6);
  local.writeUInt16LE(8,8);local.writeUInt32LE(crc32(raw),14);local.writeUInt32LE(def.length,18);
  local.writeUInt32LE(raw.length,22);local.writeUInt16LE(fname.length,26);
  chunks.push(local,fname,def);
  const cent=Buffer.alloc(46);cent.writeUInt32LE(0x02014b50,0);cent.writeUInt16LE(20,4);
  cent.writeUInt16LE(20,6);cent.writeUInt16LE(0,8);cent.writeUInt16LE(8,10);
  cent.writeUInt32LE(crc32(raw),16);cent.writeUInt32LE(def.length,20);cent.writeUInt32LE(raw.length,24);
  cent.writeUInt16LE(fname.length,28);cent.writeUInt32LE(offset,42);
  central.push(cent,fname);offset+=local.length+fname.length+def.length;
 }
 const centralSize=central.reduce((n,b)=>n+b.length,0);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
 end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...chunks,...central,end]);
}
async function periodos(){
 const rows=await Cuota.findAll({attributes:['anio','mes'],where:{estatusPago:'PAGADO'},raw:true});
 return [...new Set(rows.map(r=>String(r.anio)+'-'+String(nombres.indexOf(r.mes)+1).padStart(2,'0')).filter(p=>!p.endsWith('-00')))].sort();
}
async function generar(periodo){
 const {anio,mes}=parsePeriodo(periodo);
 const rows=await Cuota.findAll({attributes:['casaId'],where:{anio,mes,estatusPago:'PAGADO'},raw:true});
 const ids=[...new Set(rows.map(r=>Number(r.casaId)))];
 if(!ids.length)throw fail(404,'No hay viviendas con mantenimiento pagado para '+periodo);
 const entries=[],errors=[];
 for(const id of ids){
  try{
   const {recibo}=await recibos.consultarPago(id,periodo);
   const result=await recibos.generarPdf(recibo);
   entries.push({name:result.nombreArchivo||recibo.folio+'.pdf',data:result.buffer});
  }catch(e){errors.push({casaId:id,error:e.message});}
 }
 if(errors.length)throw fail(409,'No se generó ZIP parcial: '+errors.length+' recibos necesitan conciliación. Ejemplos: '+errors.slice(0,5).map(x=>x.casaId+' '+x.error).join('; '));
 return {periodo,buffer:zip(entries),cantidad:entries.length};
}
module.exports={parsePeriodo,periodos,generar,zip};
