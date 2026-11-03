'use strict';
// Correcciones de totales mediante asientos firmados: jamás borrar ni
// sobrescribir una erogación individual, incluso cuando hay varias en el mes.
const {categorias}=require('./categorias-egresos.service');
const LEGACY={CFE:['CFE','LUZ'],SIAPA:['SIAPA','AGUA'],
 CUOTA_EXTRAORDINARIA:['CUOTA_EXTRAORDINARIA','PROYECTOS']};
const PREFIX='AJUSTE MENSUAL DEL TOTAL';
function fail(message,status=400){
 return Object.assign(new Error(message),{status});
}
function cents(value){
 if(typeof value!=='number'&&typeof value!=='string')throw fail('Monto inválido');
 const text=String(value).trim();
 if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(text))
  throw fail('Ingresa un importe de $0 a $100,000,000 con máximo dos decimales');
 const n=Math.round(Number(text)*100);
 if(!Number.isSafeInteger(n)||n>10000000000)throw fail('Monto fuera de rango');
 return n;
}
function periodoValido(periodo){
 if(typeof periodo!=='string'||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(periodo))
  throw fail('Selecciona un mes y año válidos');
 const [year,month]=periodo.split('-').map(Number);
 const inicio=periodo+'-01';
 const fin=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
 return {inicio,fin};
}
function validarCambio(body){
 const categoria=String(body?.categoria||'').trim().toUpperCase();
 if(!categorias.includes(categoria))throw fail('Categoría de egreso inválida');
 const periodo=String(body?.periodo||'');
 const {inicio,fin}=periodoValido(periodo);
 return {categoria,periodo,inicio,fin,nuevo:cents(body.totalPagado),
  anterior:cents(body.totalAnterior)};
}
function categoriasEquivalentes(categoria){
 return LEGACY[categoria]||[categoria];
}
function totalCentavos(rows){
 return (rows||[]).reduce((sum,row)=>{
  const value=Number(row.monto);
  if(!Number.isFinite(value))throw fail('Hay un monto histórico inválido; revisa el egreso',409);
  return sum+Math.round(value*100);
 },0);
}
function prepararAjuste(cambio,rows){
 const actual=totalCentavos(rows);
 if(actual!==cambio.anterior)throw fail(
  'El importe mensual cambió desde que abriste el historial. Actualiza el análisis y vuelve a editar.',409);
 const diferencia=cambio.nuevo-actual;
 if(cambio.nuevo<0)throw fail('El total no puede ser negativo');
 return {...cambio,actual,diferencia,
  concepto:PREFIX+' '+cambio.categoria+': '+(actual/100).toFixed(2)+' -> '+(cambio.nuevo/100).toFixed(2)};
}
const esAjuste=row=>String(row?.concepto||'').startsWith(PREFIX+' ');
module.exports={PREFIX,validarCambio,categoriasEquivalentes,totalCentavos,prepararAjuste,esAjuste};
