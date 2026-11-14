'use strict';
const {Op}=require('sequelize');
const Reserva=require('../models/ReservaCasaClub');
const {Casa}=require('../models');
const sheets=require('./casa-club-google-client.service');
const {obtener:tarifas}=require('./casa-club-tarifas.service');
const historical=require('./casa-club-google-historial.service');
const TZ='America/Mexico_City';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const normal=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .trim().toUpperCase().replace(/\s+/g,' ');
const road=s=>normal(s).replace(/^MISION\s+/,'');
const date=v=>{
 const value=String(v||'').trim();
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
  const d=new Date(value+'T12:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value?value:null;
 }
 const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
 if(!match)return null;
 const iso=match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0');
 return date(iso);
};
const parseDateTime=v=>{
 const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/.exec(String(v||''));
 if(!m)return new Date();
 const dt=new Date(Date.UTC(+m[3],+m[2]-1,+m[1],+m[4]+6,+m[5],+m[6]));
 return Number.isNaN(dt.getTime())?new Date():dt;
};
let pending=null,lastRun=0,lastSummaryKey='',latest={occupied:[],inserted:0,exported:0,unresolved:0,conflicts:0,historialGoogle:[],resumen:null};
const fmtDateTime=d=>new Intl.DateTimeFormat('en-GB',{
 timeZone:TZ,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',
 minute:'2-digit',second:'2-digit',hour12:false
}).format(new Date(d)).replace(',','');
function houseId(row,casas){
 const number=normal(row[3]),street=road(row[4]);
 if(!number||!street)return null;
 const candidates=casas.filter(c=>normal(c.numero)===number&&
  (road(c.calleCorrecta)===street||road(c.calle)===street));
 return candidates.length===1?Number(candidates[0].id):null;
}
function legacy(row){
 const a=row.values||[],folio=String(a[0]||'').trim(),fecha=date(a[8]);
 if(!/^MJ-\d{8}-\d{5,12}$/.test(folio)||!fecha||fecha<today())return null;
 return {folio,fecha,fechaRegistro:parseDateTime(a[1]),correo:String(a[2]||'').slice(0,150),
  numero:String(a[3]||''),calle:String(a[4]||''),solicitante:String(a[5]||'').slice(0,180),
  telefono:String(a[6]||'').slice(0,25),propietario:/^(SI|SÍ)$/i.test(String(a[7]||'').trim())};
}
const toSheet=(r,c)=>{
 const d=new Date(r.creadoEn||Date.now()),iso=String(r.fecha);
 const [year,month]=iso.split('-');
 const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
  'Septiembre','Octubre','Noviembre','Diciembre'];
 return ['CC-'+r.id,fmtDateTime(d),r.correo||'',String(c.numero||''),
  c.calleCorrecta||c.calle||'',r.solicitante||'',r.telefono||'',
  r.propietario?'SÍ':'NO',iso,months[Number(month)-1]||''];
};
async function execute(){
 const sheetRows=await sheets.read();
 const external=sheetRows.map(legacy).filter(Boolean);
 const folios=new Set(sheetRows.map(r=>String(r.values?.[0]||'').trim()).filter(Boolean));
 const casas=await Casa.findAll({attributes:['id','calle','calleCorrecta','numero'],raw:true});
 // Consultar TODA la historia para deduplicar por fecha/vivienda/folio.
 // El límite de 5000 evita sobrecarga: si se alcanza, detener el resumen
 // antes de afirmar cifras incompletas.
 const existing=await Reserva.findAll({attributes:['id','folio','fecha','fechaBloqueada','estatus','usuarioId',
  'casaId','creadoEn','correo','telefono','solicitante','propietario','notas'],
  order:[['id','ASC']],limit:5001});
 if(existing.length>5000)throw Error('Casa Club excede 5000 reservas; revisar paginación de sincronización');
 const byFolio=new Map(existing.filter(x=>x.folio).map(x=>[x.folio,x]));
 const occupiedByLocal=new Map(existing.filter(x=>x.fechaBloqueada&&
  ['PENDIENTE','APROBADA'].includes(x.estatus)).map(x=>[x.fechaBloqueada,x]));
 const tariff=await tarifas();
 let inserted=0,unresolved=0,conflicts=0,duplicates=0;
 const createdRows=[];
 const occupied=[];
 for(const row of external){
  // PRECEDENCIA ABSOLUTA: MySQL es el calendario oficial.
  // Si existe reserva local activa para la fecha, no importar ni pintar
  // amarillo por un registro diferente o desactualizado de Google.
  const casaId=houseId([row.folio,null,row.correo,row.numero,row.calle],casas);
  const local=occupiedByLocal.get(row.fecha);
  if(local){
   if(local.folio===row.folio||Number(local.casaId)===Number(casaId)&&casaId){
    duplicates++;
   }else{
    conflicts++;
   }
   // MySQL mantiene prioridad y estado/color; hoja no puede reemplazarlo.
   continue;
  }
  const old=byFolio.get(row.folio);
  if(old&&['RECHAZADA','CANCELADA'].includes(old.estatus))continue;
  if(old){
   // El folio ya existe: jamás resucitar, reubicar ni sobreescribir reservas.
   if(old.fechaBloqueada&&old.fechaBloqueada===row.fecha)
    occupied.push({fecha:row.fecha,estatus:old.estatus});
   continue;
  }
  // No asumir calle por solo número o nombre del fraccionamiento.
  if(!casaId){
   unresolved++;
   occupied.push({fecha:row.fecha,estatus:'PENDIENTE'});
   continue;
  }
  if(!row.solicitante||!row.telefono||!row.correo){
   unresolved++;
   occupied.push({fecha:row.fecha,estatus:'PENDIENTE'});
   continue;
  }
  try{
   const created=await Reserva.create({usuarioId:null,casaId,fecha:row.fecha,
    fechaBloqueada:row.fecha,solicitante:row.solicitante,telefono:row.telefono,
    correo:row.correo,propietario:row.propietario,
    motivo:'Solicitud proveniente de formulario Google anterior',
    estatus:'PENDIENTE',pagado:false,fechaLimitePago:null,
    folio:row.folio,notas:'Origen: Google Sheets original · En revisión; pendiente de conciliación',
    creadoEn:row.fechaRegistro,actualizadoEn:new Date(),
    cuotaRecuperacion:tariff.cuotaRecuperacion,
    depositoGarantia:tariff.depositoGarantia,limpieza:tariff.limpieza});
   byFolio.set(row.folio,created);occupiedByLocal.set(row.fecha,created);
   createdRows.push(created);
   occupied.push({fecha:row.fecha,estatus:'PENDIENTE'});inserted++;
  }catch(e){
   if(e.name==='SequelizeUniqueConstraintError'){conflicts++;continue;}
   throw e;
  }
 }
 // Solo solicitudes del sistema, nunca volver a escribir las filas importadas.
 const outbound=existing.filter(r=>r.fecha>=today()&&
  ['PENDIENTE','APROBADA'].includes(r.estatus)&&
  !/^MJ-\d{8}-\d{5,12}$/.test(String(r.folio||''))&&
  !folios.has('CC-'+r.id));
 const houseById=new Map(casas.map(c=>[Number(c.id),c]));
 const rows=outbound.map(r=>houseById.get(Number(r.casaId))?toSheet(r,houseById.get(Number(r.casaId))):null)
  .filter(Boolean);
 // Una sola operación de append, nunca reescribir la hoja original.
 if(rows.length)await sheets.append(rows);
 // Historial de Google: incluye fechas pasadas en modo SOLO CONSULTA.
 // Nunca se convierten automáticamente en pagadas, aprobadas o canceladas.
 const report=historical.build({sheetRows,casas,existing:[...existing,...createdRows],
  today:today(),houseId});
 latest={occupied,inserted,exported:rows.length,unresolved,conflicts,duplicates,
  historialGoogle:report.historial,resumen:report.counts};
 lastRun=Date.now();
 if(unresolved||conflicts)console.warn('[CasaClub Google] Pendientes de conciliar:',
  {unresolved,conflicts,duplicates});
 // El resumen vive en K:L de la misma pestaña; nunca modifica A:J.
 // Un fallo de la tarjeta de resumen no invalida el calendario.
 const summaryKey=JSON.stringify(report.counts);
 if(summaryKey!==lastSummaryKey){
  try{
   const updated=await sheets.updateSummary(report.counts);
   if(!updated?.skipped)lastSummaryKey=summaryKey;
  }catch(error){
   console.warn('[CasaClub Google] Resumen en hoja no disponible:',error.message);
  }
 }
 return latest;
}
async function sync({force=false}={}){
 if(!sheets.enabled())return{occupied:[],disabled:true};
 if(pending)return pending;
 if(!force&&Date.now()-lastRun<15000)return latest;
 pending=execute();
 try{return await pending;}finally{pending=null;}
}
async function beforeBooking(fecha){
 if(!sheets.enabled())return;
 const result=await sync({force:true});
 if(result.occupied.some(x=>x.fecha===fecha))
  throw Object.assign(Error('La fecha está en revisión en el formulario antiguo de Casa Club. Elige otra.'),{
   status:409,codigo:'FECHA_OCUPADA',campos:['fecha']});
}
function start(){
 if(!sheets.enabled()){console.log('[CasaClub Google] Desactivado (CASA_CLUB_GOOGLE_SYNC_ENABLED=false)');return;}
 sync({force:true}).catch(e=>console.error('[CasaClub Google] Sync inicial:',e.message));
 const timer=setInterval(()=>sync({force:true}).catch(e=>
  console.error('[CasaClub Google] Error de sincronización:',e.message)),120000);
 timer.unref?.();
}
module.exports={sync,beforeBooking,start,legacy,houseId,toSheet,date};
