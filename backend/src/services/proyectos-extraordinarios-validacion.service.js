'use strict';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
const key=(calle,numero)=>norm(calle)+'|'+norm(numero).replace(/^0+(?=\d)/,'');
const cents=value=>{
 const x=Number(value);const n=Math.round(x*100);
 if(!Number.isFinite(x)||!Number.isSafeInteger(n)||n<0||n>1000000000||Math.abs(x*100-n)>0.001)
  throw fail(400,'Importe inválido (0 a 10,000,000 MXN con máximo 2 decimales)');
 return n;
};
const fechaValida=value=>typeof value==='string'&&/^\d{4}-(?:0[1-9]|1[0-2])-\d{2}$/.test(value)&&
 new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
function validarPaquete(body,padron){
 if(!body||Number(body.version)!==1||Number(body.padronEsperado)!==231)
  throw fail(400,'Archivo no compatible: se requiere versión 1 y padrón esperado de 231 viviendas.');
 if(!Array.isArray(body.proyectos)||!body.proyectos.length||body.proyectos.length>10)
  throw fail(400,'Selecciona de 1 a 10 proyectos válidos.');
 if(!Array.isArray(padron)||padron.length!==231)
  throw fail(409,'El padrón confirmado no contiene exactamente 231 viviendas: no se generaron cargos.');
 const map=new Map();
 for(const house of padron){
  const k=key(house.calleCorrecta||house.calle,house.numero);
  if(map.has(k))throw fail(409,'El padrón contiene direcciones duplicadas ('+(house.calleCorrecta||house.calle)+' '+house.numero+').');
  map.set(k,house);
 }
 const used=new Set();
 const proyectos=body.proyectos.map(raw=>{
  const codigo=String(raw.codigo||'').trim().toUpperCase();
  const nombre=String(raw.nombre||'').trim();
  if(!/^[A-Z0-9][A-Z0-9-]{5,89}$/.test(codigo)||used.has(codigo)||nombre.length<8||nombre.length>300)
   throw fail(400,'Código de proyecto duplicado o nombre inválido.');
  used.add(codigo);
  if(!fechaValida(raw.fechaInicio)||raw.fechaInicio.slice(-2)!=='01')
   throw fail(400,'La fecha inicial de '+nombre+' debe ser YYYY-MM-01.');
  const cuotaBase=cents(raw.cuotaBase);
  if(!cuotaBase)throw fail(400,'La cuota base debe ser mayor a $0.');
  const overrides=new Map();
  const errors=[];
  const especiales=raw.tarifasEspeciales||[];
  if(!Array.isArray(especiales)||especiales.length>231)throw fail(400,'Reglas especiales inválidas');
  let sinConfirmar=0;
  for(const v of especiales){
   const k=key(v.calle,v.numero);const house=map.get(k);
   if(!house){errors.push('Tarifa especial sin vivienda: '+String(v.calle)+' '+String(v.numero));continue;}
   if(overrides.has(String(house.id))){errors.push('Tarifa especial duplicada: '+String(v.calle)+' '+String(v.numero));continue;}
   const m=cents(v.monto);
   if(!m)throw fail(400,'Cada tarifa especial debe ser mayor a $0.');
   overrides.set(String(house.id),m);
   if(v.requiereConfirmacion)sinConfirmar++;
  }
  const cargos=padron.map(h=>({casaId:Number(h.id),montoCentavos:overrides.get(String(h.id))??cuotaBase,
   calle:h.calleCorrecta||h.calle,numero:String(h.numero)}));
  const byHouse=new Map(cargos.map(c=>[String(c.casaId),c]));
  const refs=new Set();
  const aportaciones=[];
  const aportes=raw.aportaciones||[];
  if(!Array.isArray(aportes)||aportes.length>5000)throw fail(400,'El archivo contiene demasiadas aportaciones.');
  for(const a of aportes){
   const k=key(a.calle,a.numero),house=map.get(k);
   if(!house){errors.push('Pago sin vivienda: '+String(a.calle)+' '+String(a.numero));continue;}
   if(!fechaValida(a.fecha)){errors.push('Pago sin fecha válida: '+String(a.calle)+' '+String(a.numero));continue;}
   const ref=String(a.referencia||'').trim();
   if(!/^[A-Za-z0-9][A-Za-z0-9:_./-]{5,119}$/.test(ref)||refs.has(ref)){
    errors.push('Referencia duplicada o inválida: '+ref);continue;
   }
   refs.add(ref);
   const m=cents(a.monto);
   if(!m){errors.push('Importe de pago en cero: '+String(a.calle)+' '+String(a.numero));continue;}
   aportaciones.push({casaId:Number(house.id),fecha:a.fecha,referencia:ref,montoCentavos:m});
  }
  const abonado=new Map();
  for(const a of aportaciones)abonado.set(a.casaId,(abonado.get(a.casaId)||0)+a.montoCentavos);
  let esperado=0,total=0,saldo=0,favor=0,cumplidos=0,parciales=0,pendientes=0;
  for(const c of cargos){
   const paid=abonado.get(c.casaId)||0;
   esperado+=c.montoCentavos;total+=paid;
   saldo+=Math.max(0,c.montoCentavos-paid);
   favor+=Math.max(0,paid-c.montoCentavos);
   if(paid>=c.montoCentavos)cumplidos++;
   else if(paid>0)parciales++;
   else pendientes++;
  }
  const source=raw.fuenteResumen||null;
  const summaryDifference=source&&Number.isFinite(Number(source.totalAnunciado))&&
   cents(source.totalAnunciado)!==total;
  const warnings=[];
  if(summaryDifference)warnings.push('El resumen del Excel y las filas individuales tienen importes distintos; prevalecerá el detalle revisado.');
  if(source?.duplicados?.length)warnings.push('El Excel contiene direcciones repetidas; revisar las filas originales.');
  if(source&&Number.isInteger(Number(source.direccionesUnicas))&&Number(source.direccionesUnicas)<padron.length)
   warnings.push('El archivo tiene '+source.direccionesUnicas+' direcciones únicas y el padrón oficial '+padron.length+
    '. Se generará la cuota a todas las viviendas del padrón, sin inventar pagos para las ausentes.');
  if(sinConfirmar)warnings.push(sinConfirmar+' tarifas especiales fueron inferidas y necesitan autorización de Administración.');
  const sourceAddresses=new Set((raw.aportaciones||[]).map(a=>key(a.calle,a.numero)));
  const sinPago=padron.filter(h=>!sourceAddresses.has(key(h.calleCorrecta||h.calle,h.numero))).length;
  return {codigo,nombre,fechaInicio:raw.fechaInicio,cuotaBaseCentavos:cuotaBase,cargos,aportaciones,errors,warnings,
   cuotasEspeciales:overrides.size,tarifasPorConfirmar:sinConfirmar,sourceDifference:Boolean(summaryDifference),
   resumen:{viviendas:padron.length,cuotasEspeciales:overrides.size,abonaron:abonado.size,
    cumplidos,parciales,pendientes,totalEsperado:esperado/100,recaudado:total/100,
    saldoPendiente:saldo/100,saldoFavor:favor/100,ausentesEnPagos:sinPago}};
 });
 return {proyectos,errors:proyectos.flatMap(p=>p.errors),warnings:proyectos.flatMap(p=>p.warnings)};
}
module.exports={norm,key,cents,fechaValida,validarPaquete,fail};
