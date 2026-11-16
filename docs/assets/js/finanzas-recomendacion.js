(function(root){
 'use strict';
 // Heurística transparente. NO predice vencimientos ni demuestra saldo bancario.
 const clean=n=>Math.max(0,Math.floor(Number(n)||0));
 const group=x=>x==='Mantenimiento'?'MANTENIMIENTO':x==='Casa Club'?'CASA_CLUB':'EXTRAORDINARIO';
 const sourceGroup=s=>s.origen==='MANTENIMIENTO'?'MANTENIMIENTO':s.origen==='CASA_CLUB'?'CASA_CLUB':'EXTRAORDINARIO';
 const essential=e=>e.grupo==='Mantenimiento'&&/CFE|LUZ|SIAPA|AGUA|SEGURIDAD|VIGILANCIA|INTERNET|ELECTRICIDAD|NOMINA|NÓMINA|SUELDO/i.test(e.nombre+' '+e.categoria);
 const prior=e=>e.pagado===false?0:1;
 function recommend({sources=[],expenses=[],assignments=[],period='',reservePercent=20}={}){
  const sourceList=sources.filter(s=>clean(s.free)>0).map(s=>({
   ...s,available:clean(s.free),originalAvailable:clean(s.free)
  }));
  const spent=new Map();
  for(const a of assignments)spent.set(Number(a.egresoId),(spent.get(Number(a.egresoId))||0)+clean(a.monto));
  const sorted=expenses.map(e=>({...e,left:Math.max(0,clean(e.monto)-(spent.get(e.id)||0))}))
   .filter(e=>e.left>0).sort((a,b)=>
    prior(a)-prior(b)||Number(essential(b))-Number(essential(a))||
    String(a.fecha||'').localeCompare(String(b.fecha||''))||b.left-a.left||a.id-b.id);
  const proposed=[],details=[],uncovered=[],sourceBefore=sourceList.reduce((n,s)=>n+s.available,0);
  let crossed=0,matched=0;
  for(const expense of sorted){
   const originType=group(expense.grupo);
   const options=sourceList.filter(s=>s.available>0).sort((a,b)=>{
    const ar=sourceGroup(a)===originType?0:1;
    const br=sourceGroup(b)===originType?0:1;
    return ar-br||b.available-a.available||String(a.id).localeCompare(String(b.id));
   });
   for(const source of options){
    if(expense.left<=0)break;
    const same=sourceGroup(source)===originType;
    // Fondos extraordinarios son por proyecto: no reasignar a otro proyecto
    // sin identificar inequívocamente el proyecto destino.
    if(!same&&source.origen.startsWith('PROYECTO:'))continue;
    if(same&&originType==='EXTRAORDINARIO'&&source.origen!=='PROYECTO:'+expense.proyectoId)continue;
    if(!same&&originType==='CASA_CLUB')continue; // Club requiere conciliación previa.
    if(!same&&sourceGroup(source)==='CASA_CLUB')continue; // Nunca prestar Casa Club automáticamente.
    if(!same&&!essential(expense)&&expense.pagado!==false)continue;
    let capacity=source.available;
    if(!same){
     // Reservar 20% de la fuente original para su función primaria.
     const reserve=Math.ceil(source.originalAvailable*reservePercent/100);
     capacity=Math.max(0,source.available-reserve);
    }
    const amount=Math.min(expense.left,capacity);
    if(amount<=0)continue;
    source.available-=amount;expense.left-=amount;
    if(same)matched+=amount;else crossed+=amount;
    const reason=same?
     'Se utiliza primero dinero de su mismo ámbito para evitar préstamos entre partidas.':
     'El gasto está pendiente y es esencial; se propone apoyo temporal de mantenimiento, conservando una reserva preventiva del '+reservePercent+'% de esta fuente visible.';
    const item={egresoId:expense.id,origen:source.origen,
     origenPeriodo:source.origenPeriodo,monto:amount};
    proposed.push(item);
    details.push({egresoId:expense.id,expense:expense.nombre,expenseGroup:expense.grupo,
     source:source.name,amount,reason,temporary:!same,
     sourceRemaining:source.available,expenseRemaining:expense.left});
   }
   if(expense.left>0)uncovered.push({egresoId:expense.id,expense:expense.nombre,
    amount:expense.left,reason:'No hay fondos elegibles suficientes bajo las reglas de protección del plan.'});
  }
  const assigned=proposed.reduce((n,a)=>n+a.monto,0);
  return {proposed,details,uncovered,summary:{
   totalProposed:assigned,withinArea:matched,crossArea:crossed,
   unallocatedSources:sourceBefore-assigned,
   uncoveredExpenses:uncovered.reduce((n,x)=>n+x.amount,0),
   period,priority:'Pendientes primero; después servicios esenciales; fecha más antigua; monto mayor.',
   disclaimer:'Sugerencia basada en registros, no en saldos bancarios verificados ni vencimientos contractuales. No efectúa transferencias ni se guarda automáticamente.'}};
 }
 const api={recommend,essential};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MJFinanceRecommendation=api;
})(typeof window==='undefined'?globalThis:window);
