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
 const result={periodo,aprobadas:0,aprobadasVigentes:0,ingresosAutorizadosVigentes:0,
  ingresosNoAcreditadosVigentes:0,garantiasComprometidasVigentes:0,
  limpiezaComprometidaVigente:0,
  recuperacionAutorizada:0,limpiezaAutorizada:0,
  ingresosAutorizados:0,garantiasComprometidas:0,
  ingresosNoAcreditados:0,ingresosConAcreditacion:0,
  aprobadasSinComprobante:0,
  aclaracion:'Sólo la recuperación es ingreso; limpieza es costo comprometido y la garantía es reembolsable. Una autorización no equivale a depósito bancario.'};
 const visited=new Set();
 for(const r of reservas){
  if(r.estatus!=='APROBADA')continue;
  const key=String(r.id||'');
  if(!key||visited.has(key))continue;
  visited.add(key);
  // El mes del cargo coincide con el usado en la consulta por vivienda.
  const recovery=cents(r.cuotaRecuperacion),clean=cents(r.limpieza),guarantee=cents(r.depositoGarantia);
  if(![recovery,clean,guarantee].every(v=>Number.isSafeInteger(v)&&v>=0))continue;
  // Únicamente recuperación es ingreso operativo. Limpieza se reserva para
  // pagar el servicio, garantía queda separada para devolución.
  const operationalIncome=recovery;
  const verified=Boolean(r.pagado)||validados.has(key)||recibos.has(key);
  result.aprobadasVigentes++;
  result.ingresosAutorizadosVigentes+=operationalIncome;
  result.limpiezaComprometidaVigente+=clean;
  result.garantiasComprometidasVigentes+=guarantee;
  if(!verified)result.ingresosNoAcreditadosVigentes+=operationalIncome;
  if(mesDe(r.fechaLimitePago||r.fecha)!==periodo)continue;
  result.aprobadas++;
  result.recuperacionAutorizada+=recovery;
  result.limpiezaAutorizada+=clean;
  result.garantiasComprometidas+=guarantee;
  if(verified)result.ingresosConAcreditacion+=operationalIncome;
  else{
   result.ingresosNoAcreditados+=operationalIncome;
   result.aprobadasSinComprobante++;
  }
 }
 const attrs=['recuperacionAutorizada','limpiezaAutorizada','garantiasComprometidas',
  'ingresosNoAcreditados','ingresosConAcreditacion',
  'ingresosAutorizadosVigentes','ingresosNoAcreditadosVigentes','garantiasComprometidasVigentes',
  'limpiezaComprometidaVigente'];
 for(const name of attrs)result[name]=result[name]/100;
 result.ingresosAutorizados=result.recuperacionAutorizada;
 return result;
}
module.exports={resumenAutorizaciones};
