'use strict';
// Fuente compartida por Análisis y Pagos. Nunca consulta TAGs ni TCP.
const {createHash}=require('node:crypto');
const {BASE,RECARGO,MAX_MESES}=require('./mensualidades-mantenimiento');
const {centavos}=require('./vigencia-calculo');
const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const INICIO=2026*12+8;
const cents=v=>Math.max(0,Math.round(Number(v||0)*100));
const indice=c=>Number(c.anio)*12+MESES.indexOf(String(c.mes).toUpperCase());
const periodo=n=>`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;
const cubierta=c=>['CONDONADO','CANCELADO'].includes(String(c?.estatusPago).toUpperCase()) || (String(c?.estatusPago).toUpperCase()==='PAGADO'&&cents(c?.montoPagado)>0);
const fail=m=>Object.assign(new Error(m),{status:409});
function estadoPeriodo(c,n,fecha,tarifa=BASE){
 const pagado=cents(c?.montoPagado);
 const prueba=tarifa===10&&n===2026*12+9&&c?.origenImportacion==='PRUEBA_10_PESOS'&&cents(c.montoCuota)===1000&&cents(c.recargo)===0;
 const multa=!prueba&&fecha>periodo(n)+'-10'?RECARGO*100:0;
 const total=tarifa!==BASE?tarifa*100+Math.max(multa,cents(c?.recargo)):
  Math.max(tarifa*100,cents(c?.montoCuota),tarifa*100+cents(c?.recargo),tarifa*100+multa);
 const faltante=cubierta(c)?0:tarifa!==BASE?Math.max(0,total-pagado):Math.max(0,total-pagado,cents(c?.saldoPendiente));
 const recargoTotal=Math.max(multa,cents(c?.recargo));
 const recargoPendiente=c?.recargoPagado!=null?Math.min(faltante,Math.max(0,recargoTotal-cents(c.recargoPagado))):
  multa?Math.min(multa,Math.max(0,faltante-Math.max(0,tarifa*100-pagado))):0;
 return {total:Math.max(total,pagado+faltante),pagado,faltante,recargoTotal,recargoPendiente};
}
function fechaDesdeCuotas(cuotas){
 const map=new Map(cuotas.map(c=>[indice(c),c]));let n=INICIO;
 while(n<2100*12&&cubierta(map.get(n)))n++;
 return n===INICIO?null:periodo(n)+'-10';
}
function huella(cuotas,tarifa){
 return createHash('sha256').update(JSON.stringify({tarifa,cuotas:cuotas.map(c=>[String(c.id),c.anio,c.mes,c.estatusPago,cents(c.montoPagado),cents(c.montoCuota),cents(c.recargo),cents(c.saldoPendiente),c.recargoPagado==null?null:cents(c.recargoPagado)]).sort((a,b)=>a[0].localeCompare(b[0]))})).digest('hex');
}
function contextoCuotas(cuotas,fecha,tarifa){
 const limit=Number(fecha.slice(0,4))*12+Number(fecha.slice(5,7))-1;
 const map=new Map(cuotas.map(c=>[indice(c),c]));let deuda=0,recargo=0,primero=null;
 for(let n=INICIO;n<=limit;n++){
  const s=estadoPeriodo(map.get(n),n,fecha,tarifa);deuda+=s.faltante;recargo+=s.recargoPendiente;
  if(s.faltante&&primero===null)primero=n;
 }
 if(primero===null){primero=limit+1;while(cubierta(map.get(primero)))primero++;}
 const state=estadoPeriodo(map.get(primero),primero,fecha,tarifa);
 return {fuente:'CUOTAS',base:tarifa,tarifa,recargo:recargo/100,adeudoTotal:deuda/100,
  minimo:(recargo+state.faltante-state.recargoPendiente)/100,minimoReporte:Math.max(1,recargo)/100,
  saldoParcial:Math.max(0,state.pagado-(state.recargoTotal-state.recargoPendiente))/100,
  fechaFinalCuotas:fechaDesdeCuotas(cuotas),primerPeriodoPendiente:periodo(primero),huella:huella(cuotas,tarifa)};
}
function planificar(cuotas,fecha,monto,tarifa){
 const amount=centavos(monto);if(!amount)throw fail('El importe debe ser mayor que cero');
 const ctx=contextoCuotas(cuotas,fecha,tarifa);const fee=cents(ctx.recargo);
 if(amount<fee)throw fail('El depósito debe cubrir los recargos pendientes de $'+ctx.recargo.toFixed(2));
 const map=new Map(cuotas.map(c=>[indice(c),c]));const cambios=new Map();
 const get=n=>{if(!cambios.has(n)){const c=map.get(n),s=estadoPeriodo(c,n,fecha,tarifa);cambios.set(n,{anio:Math.floor(n/12),mes:MESES[n%12],periodo:periodo(n),id:c?.id||null,antesPagado:s.pagado,total:s.total,recargo:s.recargoTotal,recargoPagado:s.recargoTotal-s.recargoPendiente,abono:0,abonoRecargo:0});}return cambios.get(n)};
 const limit=Number(fecha.slice(0,4))*12+Number(fecha.slice(5,7))-1;
 // Cubrir recargos vencidos antes de repartir principal; su pago se guarda explícito.
 for(let n=INICIO;n<=limit;n++){const s=estadoPeriodo(map.get(n),n,fecha,tarifa);if(s.recargoPendiente){const p=get(n);p.abono=s.recargoPendiente;p.abonoRecargo=s.recargoPendiente;p.recargoPagado+=s.recargoPendiente;}}
 let restante=amount-fee,meses=0;
 for(let n=INICIO;restante>0;n++){
  if(n>=2100*12)throw fail('Año fuera de rango');
  if(cubierta(map.get(n)))continue;
  const p=get(n);const falta=Math.max(0,p.total-p.antesPagado-p.abono);
  const abono=Math.min(falta,restante);p.abono+=abono;restante-=abono;
  if([...cambios.values()].filter(p=>p.abono&&p.antesPagado+p.abono===p.total).length>MAX_MESES)throw fail('Registra como máximo 36 mensualidades por movimiento');
 }
 const aplicaciones=[...cambios.values()].filter(p=>p.abono>0);
 meses=aplicaciones.filter(p=>p.antesPagado+p.abono===p.total).length;
 if(meses>MAX_MESES)throw fail('Registra como máximo 36 mensualidades por movimiento');
 const despues=cuotas.map(c=>({...c}));
 for(const p of aplicaciones){const row={anio:p.anio,mes:p.mes,montoPagado:(p.antesPagado+p.abono)/100,estatusPago:p.antesPagado+p.abono===p.total?'PAGADO':'PAGO_PARCIAL'};const i=despues.findIndex(c=>Number(c.anio)===p.anio&&c.mes===p.mes);if(i<0)despues.push(row);else despues[i]={...despues[i],...row};}
 const nuevo=contextoCuotas(despues.map(c=>{const p=aplicaciones.find(p=>p.anio===Number(c.anio)&&p.mes===c.mes);return p?{...c,montoCuota:p.total/100,recargo:p.recargo/100,recargoPagado:p.recargoPagado/100,saldoPendiente:(p.total-p.antesPagado-p.abono)/100}:c}),fecha,tarifa);
 return {...ctx,version:1,fechaCalculo:fecha,monto:amount/100,tarifa,aplicaciones,meses,
  abonoParcial:meses===0,saldoDespues:nuevo.saldoParcial,faltante:nuevo.minimo,
  fechaFinalObjetivo:fechaDesdeCuotas(despues),recargo:fee/100,total:amount/100,
  cortesRecargo:aplicaciones.filter(p=>p.abonoRecargo>0).map(p=>p.periodo+'-10')};
}
module.exports={MESES,INICIO,indice,periodo,cubierta,estadoPeriodo,fechaDesdeCuotas,contextoCuotas,planificar,huella};
