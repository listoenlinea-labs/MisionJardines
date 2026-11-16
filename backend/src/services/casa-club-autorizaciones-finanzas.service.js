'use strict';
// Autorización administrativa no equivale a depósito: separar compromisos
// autorizados del dinero bancario efectivamente verificado.
const cents=x=>Math.round(Number(x||0)*100);
const mesDe=x=>String(x||'').slice(0,7);
function resumenAutorizaciones({reservas=[],reportados=[],manuales=[],anio,mes}={}){
 const periodo=String(anio)+'-'+String(mes).padStart(2,'0');
 const validados=new Set(reportados.filter(p=>p.tipoPago==='CASA_CLUB'&&
  p.estatus==='VALIDADO'&&p.reservaCasaClubId).map(p=>String(p.reservaCasaClubId)));
 const recibos=new Set(manuales.filter(p=>p.tipoPago==='CASA_CLUB'&&
  p.reservaCasaClubId).map(p=>String(p.reservaCasaClubId)));
 const result={periodo,aprobadas:0,recuperacionAutorizada:0,limpiezaAutorizada:0,
  ingresosAutorizados:0,garantiasComprometidas:0,
  ingresosNoAcreditados:0,ingresosConAcreditacion:0,
  aprobadasSinComprobante:0,
  aclaracion:'Autorización no equivale a depósito bancario; estos importes no son fondos disponibles.'};
 const visited=new Set();
 for(const r of reservas){
  if(r.estatus!=='APROBADA')continue;
  const key=String(r.id||'');
  if(!key||visited.has(key))continue;
  visited.add(key);
  // El mes del cargo coincide con el usado en la consulta por vivienda.
  if(mesDe(r.fechaLimitePago||r.fecha)!==periodo)continue;
  const recovery=cents(r.cuotaRecuperacion),clean=cents(r.limpieza),guarantee=cents(r.depositoGarantia);
  if(![recovery,clean,guarantee].every(v=>Number.isSafeInteger(v)&&v>=0))continue;
  const nonRefundable=recovery+clean;
  result.aprobadas++;
  result.recuperacionAutorizada+=recovery;
  result.limpiezaAutorizada+=clean;
  result.garantiasComprometidas+=guarantee;
  const verified=Boolean(r.pagado)||validados.has(key)||recibos.has(key);
  if(verified)result.ingresosConAcreditacion+=nonRefundable;
  else{
   result.ingresosNoAcreditados+=nonRefundable;
   result.aprobadasSinComprobante++;
  }
 }
 const attrs=['recuperacionAutorizada','limpiezaAutorizada','garantiasComprometidas',
  'ingresosNoAcreditados','ingresosConAcreditacion'];
 for(const name of attrs)result[name]=result[name]/100;
 result.ingresosAutorizados=result.recuperacionAutorizada+result.limpiezaAutorizada;
 return result;
}
module.exports={resumenAutorizaciones};
