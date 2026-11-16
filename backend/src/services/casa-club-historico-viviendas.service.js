'use strict';
// Cruce exclusivamente de CONSULTA de la hoja histórica 2026 con el padrón.
// No acredita pagos MySQL, no cambia cuotas, reservas ni saldos bancarios.
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .trim().toUpperCase().replace(/\s+/g,' ');
function calle(v){
 return norm(v).replace(/^MISION\s+/,'').replace(/^(CALLE|AVENIDA|AV\.)\s+/,'');
}
function numero(v){
 const value=String(v??'').trim();
 if(!/^\d+(?:\.0+)?$/.test(value))return '';
 return String(Number(value));
}
function amount(v){
 const raw=String(v??'').replace(/\s/g,'').replace(/\$/g,'').replace(/,/g,'');
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))return null;
 const cents=Math.round(Number(raw)*100);
 return Number.isSafeInteger(cents)&&cents>0?cents:null;
}
const streetNames={
 ATOTONILCO:'Atotonilco',GARDENIAS:'Gardenias',GUADALAJARA:'Guadalajara',
 JARDINES:'Jardines',LIRIOS:'Lirios',MAGNOLIAS:'Magnolias',
 ROSAS:'Rosas','VALLE DE MEXICO':'Valle de México'
};
const displayStreet=k=>streetNames[k]||k.replace(/\b\w/g,ch=>ch.toUpperCase());
const key=(street,house)=>calle(street)+'|'+numero(house);
const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const abbreviations={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,sept:9,oct:10,nov:11,dic:12};
function fechaISO(v){
 const str=norm(v).replace(/\s*,\s*/g,' ').replace(/\s+DE\s+/g,' ').replace(/\s+/g,' ');
 let day,month,year,m;
 if((m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(str))){year=+m[1];month=+m[2];day=+m[3];}
 else if((m=/^(\d{1,2})[\s\/-]+([A-Z]+)[\s\/-]+(\d{4})$/.exec(str))){
  day=+m[1];year=+m[3];month=abbreviations[m[2].toLowerCase()]||months.indexOf(m[2].toLowerCase())+1;
 }
 else return null;
 const date=new Date(Date.UTC(year,month-1,day));
 return year>=2020&&year<=2100&&date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?
  year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'):null;
}
function fechaLegible(iso){
 const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||'');
 return m?Number(m[3])+' '+months[Number(m[2])-1]+', '+m[1]:'Fecha no reconocida';
}

function extraerMovimientos(rows){
 const header=rows?.[1]||[];
 if(!norm(header[0]).includes('CASA')||norm(header[1])!=='CALLE'||
    !norm(header[5]).includes('PAGO RECUPERACION')||
    !norm(header[11]).includes('ESTATUS PAGO')){
  const e=new Error('La hoja Casa Club cambió la estructura de columnas A/B/F/L');
  e.code='COLUMNAS_INVALIDAS';throw e;
 }
 const payments=[],unknown=[],excluded=[],duplicados=[],seen=new Map();
 for(let i=2;i<(rows||[]).length;i++){
  const row=rows[i]||[],status=norm(row[11]);
  if(status==='CANCELADO'){excluded.push(i+1);continue;}
  if(status!=='PAGADO')continue;
  const cents=amount(row[5]);
  if(cents===null)continue;
  const st=calle(row[1]),house=numero(row[0]);
  const iso=fechaISO(row[4]);
  // Casa Club admite una sola reserva por vivienda y fecha. Incluso si
  // el folio difiere, un registro idéntico de fecha y recuperación es duplicado.
  const identity=st&&house&&iso?st+'|'+house+'|'+iso+'|'+cents:null;
  if(identity&&seen.has(identity)){
   duplicados.push({fila:i+1,original:seen.get(identity),calle:st,numero:house,
    fecha:fechaLegible(iso),monto:cents/100});
   continue;
  }
  if(identity)seen.set(identity,i+1);
  const movement={fila:i+1,calle:st,numero:house,monto:cents/100,
   mes:norm(row[3]),fecha:iso?fechaLegible(iso):String(row[4]||'').slice(0,60),
   fechaISO:iso,folio:String(row[6]??'').slice(0,60)};
  payments.push(movement);
  if(!st||!house)unknown.push(i+1);
 }
 return {payments,unknown,excluded,duplicados};
}
function conciliarMovimientos(payments,houses,excludedCount=0){
 const houseIndex=new Map();
 for(const house of houses||[]){
  const k=key(house.calleCorrecta||house.calle,house.numero);
  if(!k||k.startsWith('|')||k.endsWith('|'))continue;
  if(!houseIndex.has(k))houseIndex.set(k,[]);
  houseIndex.get(k).push(house);
 }
 const grouped=new Map(),streetTotals=new Map(),unmatched=[];
 let matched=0;
 for(const pay of payments){
  const street=pay.calle;
  if(street)streetTotals.set(street,(streetTotals.get(street)||0)+Math.round(pay.monto*100));
  const hits=houseIndex.get(street+'|'+pay.numero)||[];
  if(hits.length!==1){
   unmatched.push({fila:pay.fila,calle:displayStreet(street),numero:pay.numero,
    monto:pay.monto,motivo:hits.length?'AMBIGUA':'SIN_VIVIENDA'});
   continue;
  }
  matched++;
  const id=String(hits[0].id??hits[0].casaId);
  if(!grouped.has(id))grouped.set(id,{montoCents:0,registros:[]});
  const group=grouped.get(id);
  group.montoCents+=Math.round(pay.monto*100);
  group.registros.push({fila:pay.fila,fecha:pay.fecha,mes:pay.mes,monto:pay.monto,folio:pay.folio});
 }
 const porCasa=Object.fromEntries([...grouped].map(([id,g])=>[id,{
  monto:g.montoCents/100,cantidad:g.registros.length,registros:g.registros
 }]));
 const porCalle=[...streetTotals].map(([k,cents])=>({
  calle:displayStreet(k),monto:cents/100
 })).sort((a,b)=>b.monto-a.monto||a.calle.localeCompare(b.calle,'es-MX'));
 return {porCasa,porCalle,coincidencias:matched,viviendasConRecuperacion:grouped.size,
  sinConciliar:unmatched,cantidadSinConciliar:unmatched.length,
  registros:payments.length,excluidos:excludedCount,
  total:payments.reduce((sum,p)=>sum+Math.round(p.monto*100),0)/100,
  notas:'Montos históricos de Google 2026, no constituyen nuevos depósitos MySQL.'};
}
function conciliarHistorico(rows,houses){
 const parsed=extraerMovimientos(rows);
 return conciliarMovimientos(parsed.payments,houses,parsed.excluded.length);
}
module.exports={calle,numero,amount,fechaISO,fechaLegible,extraerMovimientos,conciliarMovimientos,conciliarHistorico};
