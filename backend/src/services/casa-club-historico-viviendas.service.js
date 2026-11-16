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
function extraerMovimientos(rows){
 const header=rows?.[1]||[];
 if(!norm(header[0]).includes('CASA')||norm(header[1])!=='CALLE'||
    !norm(header[5]).includes('PAGO RECUPERACION')||
    !norm(header[11]).includes('ESTATUS PAGO')){
  const e=new Error('La hoja Casa Club cambió la estructura de columnas A/B/F/L');
  e.code='COLUMNAS_INVALIDAS';throw e;
 }
 const payments=[],unknown=[],excluded=[];
 for(let i=2;i<(rows||[]).length;i++){
  const row=rows[i]||[],status=norm(row[11]);
  if(status==='CANCELADO'){excluded.push(i+1);continue;}
  if(status!=='PAGADO')continue;
  const cents=amount(row[5]);
  if(cents===null)continue;
  const st=calle(row[1]),house=numero(row[0]);
  const movement={fila:i+1,calle:st,numero:house,monto:cents/100,
   mes:norm(row[3]),fecha:String(row[4]||'').slice(0,60),
   folio:String(row[6]??'').slice(0,60)};
  payments.push(movement);
  if(!st||!house)unknown.push(i+1);
 }
 return {payments,unknown,excluded};
}
function conciliarHistorico(rows,houses){
 const {payments,unknown,excluded}=extraerMovimientos(rows);
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
  registros:payments.length,excluidos:excluded.length,
  total:payments.reduce((sum,p)=>sum+Math.round(p.monto*100),0)/100,
  notas:'Montos históricos de Google 2026, no constituyen nuevos depósitos MySQL.'};
}
module.exports={calle,numero,amount,extraerMovimientos,conciliarHistorico};
