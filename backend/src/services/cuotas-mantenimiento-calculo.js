'use strict';
// Fuente financiera compartida. El último periodo PAGADO fija el corte;
// ni los huecos anteriores ni la fecha física del TAG generan deuda adicional.
const {createHash}=require('node:crypto');
const {BASE,RECARGO,MAX_MESES}=require('./mensualidades-mantenimiento');
const {centavos}=require('./vigencia-calculo');
const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const INICIO=2026*12; // Solo para una vivienda SIN ningún periodo pagado.
const cents=v=>Math.max(0,Math.round(Number(v||0)*100));
const indice=c=>Number(c.anio)*12+MESES.indexOf(String(c.mes).toUpperCase());
const periodo=n=>`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;
const pagada=c=>String(c?.estatusPago).toUpperCase()==='PAGADO'&&cents(c?.montoPagado)>0;
const cubierta=c=>['CONDONADO','CANCELADO'].includes(String(c?.estatusPago).toUpperCase())||pagada(c);
const fail=m=>Object.assign(new Error(m),{status:409});
function ultimoPagado(cuotas=[]){
 return cuotas.reduce((last,c)=>pagada(c)&&MESES.includes(String(c.mes).toUpperCase())&&Number.isInteger(Number(c.anio))&&
  (!last||indice(c)>indice(last))?c:last,null);
}
function inicioDesdeUltimo(cuotas){
 const ultimo=ultimoPagado(cuotas);
 return ultimo?indice(ultimo)+1:INICIO;
}
function primerPendiente(cuotas){
 const map=new Map(cuotas.map(c=>[indice(c),c]));
 let n=inicioDesdeUltimo(cuotas);
 // Solo salta exenciones explícitas; no busca huecos del historial pagado.
 while(cubierta(map.get(n)))n++;
 return n;
}
function fechaDesdeCuotas(cuotas){
 const ultimo=ultimoPagado(cuotas);
 return ultimo?periodo(indice(ultimo)+1)+'-10':null;
}
function recargoAbonado(c,tarifa){
 const paid=cents(c?.montoPagado);
 return Math.min(RECARGO*100,paid,c?.recargoPagado!=null?cents(c.recargoPagado):Math.max(0,paid-tarifa*100));
}
function estadoPeriodo(c,n,fecha,tarifa=BASE,exento=false){
 const pagado=cents(c?.montoPagado),abonadoRecargo=recargoAbonado(c,tarifa);
 const prueba=tarifa===10&&n===2026*12+9&&c?.origenImportacion==='PRUEBA_10_PESOS'&&cents(c.montoCuota)===1000&&cents(c.recargo)===0;
 const multa=!prueba&&!exento&&fecha>periodo(n)+'-10'?RECARGO*100:0;
 const recargoTotal=Math.max(multa,abonadoRecargo),total=tarifa*100+recargoTotal;
 const faltante=cubierta(c)?0:Math.max(0,total-pagado);
 return {total,pagado,faltante,recargoTotal,recargoPendiente:cubierta(c)?0:Math.max(0,multa-abonadoRecargo)};
}
function huella(cuotas,tarifa){
 return createHash('sha256').update(JSON.stringify({tarifa,cuotas:cuotas.map(c=>[String(c.id),c.anio,c.mes,c.estatusPago,cents(c.montoPagado),cents(c.montoCuota),cents(c.recargo),cents(c.saldoPendiente),c.recargoPagado==null?null:cents(c.recargoPagado)]).sort((a,b)=>a[0].localeCompare(b[0]))})).digest('hex');
}
function contextoCuotas(cuotas,fecha,tarifa=BASE){
 const inicio=inicioDesdeUltimo(cuotas);
 const limite=Number(fecha.slice(0,4))*12+Number(fecha.slice(5,7))-1;
 const meses=Math.max(0,limite-inicio+1);
 const ultimoVencido=Number(fecha.slice(8,10))>10?limite:limite-1;
 const vencidos=Math.max(0,ultimoVencido-inicio+1);
 // Solo se agregan créditos YA REGISTRADOS después del último corte.
 // Ningún mes ausente se consulta ni se evalúa para calcular el adeudo.
 let principalAplicado=0,recargosAplicados=0,exenciones=0,exencionesVencidas=0;
 const primero=primerPendiente(cuotas);
 let parcial=null,exencionPrueba=0;
 for(const c of cuotas){
  const n=indice(c);
  if(n<inicio)continue;
  if(['CONDONADO','CANCELADO'].includes(String(c.estatusPago).toUpperCase())){
   if(n<=limite)exenciones++;
   if(n<=ultimoVencido)exencionesVencidas++;
   continue;
  }
  const recargo=recargoAbonado(c,tarifa);
  if(n<=limite)principalAplicado+=Math.max(0,cents(c.montoPagado)-recargo);
  if(n<=ultimoVencido)recargosAplicados+=recargo;
  if(n===primero)parcial=c;
  if(tarifa===10&&n===2026*12+9&&n<=ultimoVencido&&c.origenImportacion==='PRUEBA_10_PESOS'&&
   cents(c.montoCuota)===1000&&cents(c.recargo)===0)exencionPrueba=RECARGO*100;
 }
 const recargo=Math.max(0,(vencidos-exencionesVencidas)*RECARGO*100-recargosAplicados-exencionPrueba);
 const principal=Math.max(0,(meses-exenciones)*tarifa*100-principalAplicado);
 const saldoParcial=parcial?Math.max(0,cents(parcial.montoPagado)-recargoAbonado(parcial,tarifa)):0;
 return {fuente:'CUOTAS',base:tarifa,tarifa,recargo:recargo/100,adeudoTotal:(principal+recargo)/100,
  mesesPendientes:meses-exenciones,fechaCorteActual:periodo(limite+1)+'-10',
  fechaUltimoCortePagado:fechaDesdeCuotas(cuotas),
  minimo:(recargo+Math.max(0,tarifa*100-saldoParcial))/100,minimoReporte:Math.max(1,recargo)/100,
  saldoParcial:saldoParcial/100,fechaFinalCuotas:fechaDesdeCuotas(cuotas),
  primerPeriodoPendiente:periodo(primero),huella:huella(cuotas,tarifa)};
}
function planificar(cuotas,fecha,monto,tarifa,exencionesRecargo=[]){
 const amount=centavos(monto);
 if(!amount)throw fail('El importe debe ser mayor que cero');
 const ctx=contextoCuotas(cuotas,fecha,tarifa,exencionesRecargo),fee=cents(ctx.recargo);
 if(amount<fee)throw fail('El depósito debe cubrir los recargos pendientes de $'+ctx.recargo.toFixed(2));
 const inicio=inicioDesdeUltimo(cuotas);
 const map=new Map(cuotas.map(c=>[indice(c),c]));
 const cambios=new Map();
 const get=n=>{
  if(!cambios.has(n)){
   const c=map.get(n),s=estadoPeriodo(c,n,fecha,tarifa);
   cambios.set(n,{anio:Math.floor(n/12),mes:MESES[n%12],periodo:periodo(n),id:c?.id||null,
    antesPagado:s.pagado,total:s.total,recargo:s.recargoTotal,
    recargoPagado:s.recargoTotal-s.recargoPendiente,abono:0,abonoRecargo:0});
  }
  return cambios.get(n);
 };
 const limite=Number(fecha.slice(0,4))*12+Number(fecha.slice(5,7))-1;
 // Solo los periodos pendientes DESPUÉS del último pagado requieren reparto.
 for(let n=inicio;n<=limite;n++){
  const s=estadoPeriodo(map.get(n),n,fecha,tarifa,require('./recargos-exenciones.service').exentoEn(exencionesRecargo,periodo(n)));
  if(s.recargoPendiente){
   const p=get(n);p.abono=s.recargoPendiente;p.abonoRecargo=s.recargoPendiente;
   p.recargoPagado+=s.recargoPendiente;
  }
 }
 let restante=amount-fee;
 for(let n=inicio;restante>0;n++){
  if(n>=2100*12)throw fail('Año fuera de rango');
  if(cubierta(map.get(n)))continue;
  const p=get(n),falta=Math.max(0,p.total-p.antesPagado-p.abono);
  if(!falta&&!p.abono)throw fail('La siguiente mensualidad tiene saldo cubierto pero no está marcada pagada; requiere conciliación antes de avanzar');
  const abono=Math.min(falta,restante);p.abono+=abono;restante-=abono;
  if([...cambios.values()].filter(p=>p.abono&&p.antesPagado+p.abono===p.total).length>MAX_MESES)
   throw fail('Registra como máximo 36 mensualidades por movimiento');
 }
 const aplicaciones=[...cambios.values()].filter(p=>p.abono>0);
 const meses=aplicaciones.filter(p=>p.antesPagado+p.abono===p.total).length;
 if(meses>MAX_MESES)throw fail('Registra como máximo 36 mensualidades por movimiento');
 const despues=cuotas.map(c=>({...c}));
 for(const p of aplicaciones){
  const row={anio:p.anio,mes:p.mes,montoPagado:(p.antesPagado+p.abono)/100,
   estatusPago:p.antesPagado+p.abono===p.total?'PAGADO':'PAGO_PARCIAL',
   montoCuota:p.total/100,recargo:p.recargo/100,recargoPagado:p.recargoPagado/100,
   saldoPendiente:(p.total-p.antesPagado-p.abono)/100};
  const i=despues.findIndex(c=>Number(c.anio)===p.anio&&c.mes===p.mes);
  if(i<0)despues.push(row);else despues[i]={...despues[i],...row};
 }
 const nuevo=contextoCuotas(despues,fecha,tarifa);
 return {...ctx,version:2,fechaCalculo:fecha,monto:amount/100,tarifa,aplicaciones,meses,
  abonoParcial:meses===0,saldoDespues:nuevo.saldoParcial,faltante:nuevo.minimo,
  fechaFinalObjetivo:fechaDesdeCuotas(despues),recargo:fee/100,total:amount/100,
  cortesRecargo:aplicaciones.filter(p=>p.abonoRecargo>0).map(p=>p.periodo+'-10')};
}
module.exports={MESES,INICIO,indice,periodo,pagada,cubierta,ultimoPagado,inicioDesdeUltimo,primerPendiente,
 estadoPeriodo,fechaDesdeCuotas,contextoCuotas,planificar,huella};
