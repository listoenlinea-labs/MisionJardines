'use strict';
// Reglas del flujo de Casa Club, sin generar asientos ni duplicar limpieza:
// recuperación = ingreso; depósito = garantía reembolsable;
// limpieza = costo previsto, no ingreso operativo.
const cent=x=>Math.round(Number(x||0)*100);
const numero=x=>cent(x)/100;
const texto=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const limpiezaRegistrada=e=>/LIMPIEZA|ASEO/.test(texto(e?.concepto)||'')||
  /LIMPIEZA|ASEO/.test(texto(e?.categoria)||'');
function resumenFinancieroClub({reservasPagadas=[],egresos=[]}={}){
 let recuperacionCents=0,limpiezaCents=0,garantiasCents=0,garantiasDevueltasCents=0;
 const seen=new Set();
 for(const r of reservasPagadas){
  if(!r||r.pagado===false)continue;
  const key=String(r.id??'');
  if(key&&seen.has(key))continue;
  if(key)seen.add(key);
  recuperacionCents+=cent(r.cuotaRecuperacion);
  limpiezaCents+=cent(r.limpieza);
  garantiasCents+=cent(r.depositoGarantia);
  if(r.garantiaDevuelta)garantiasDevueltasCents+=cent(r.depositoGarantia);
 }
 let gastosCents=0,registradaCents=0;
 for(const e of egresos){
  const amount=cent(e.monto);
  if(!Number.isSafeInteger(amount)||amount<0)continue;
  gastosCents+=amount;
  if(limpiezaRegistrada(e))registradaCents+=amount;
 }
 // La parte registrada sustituye a la reserva para ese gasto.
 // No se resta dos veces el mismo servicio de limpieza en la gráfica.
 const pendienteCents=Math.max(0,limpiezaCents-registradaCents);
 return {
  ingresos:recuperacionCents/100,
  egresos:(gastosCents+pendienteCents)/100,
  diferencia:(recuperacionCents-gastosCents-pendienteCents)/100,
  recuperacion:recuperacionCents/100,
  limpiezaRecaudada:limpiezaCents/100,
  limpiezaRegistrada:registradaCents/100,
  limpiezaPorProvisionar:pendienteCents/100,
  egresosRegistrados:gastosCents/100,
  garantiasRecibidas:garantiasCents/100,
  garantiasDevueltas:garantiasDevueltasCents/100,
  garantiasPorDevolver:(garantiasCents-garantiasDevueltasCents)/100,
  criterio:'Los $1,000 de recuperación son ingreso; $300 de limpieza es costo reservado y $700 es garantía reembolsable. Se usan las tarifas guardadas de cada reserva.'
 };
}
module.exports={resumenFinancieroClub,limpiezaRegistrada};
