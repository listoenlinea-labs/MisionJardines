(function(root){
 'use strict';
 const money=v=>Math.round(Number(v||0)*100)/100;
 const cents=v=>Math.round(Number(v||0)*100);
 const safe=value=>{const t=String(value??'');return /^\s*[=+\-@]/.test(t)?"'"+t:t;};
 const date=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
 const isNoAplica=h=>h.estatus==='NO_APLICA'||h.noAplica===true;
 const paid=h=>Number(h.montoPagado||0)>0;
 const complete=h=>h.estatus==='PAGADO'&&!isNoAplica(h);
 const numericOrder=(a,b)=>String(a.calle).localeCompare(String(b.calle),'es-MX',{numeric:true})||
  String(a.numero).localeCompare(String(b.numero),'es-MX',{numeric:true});
 const headers=['ID vivienda','Calle','Número','Residente','Estado del proyecto',
  'Meta individual (MXN)','Abonado (MXN)','Último abono (MXN)','Saldo pendiente (MXN)',
  'Saldo a favor (MXN)','Fecha último abono','Referencia último abono','TAGs'];
 function prepararReporteProyecto(data,tipo,projectId,movimientos=[]){
  if(!['padron','pagadas','pendientes','historicas'].includes(String(tipo)))
   throw Error('Tipo de reporte extraordinario inválido');
  const id=Number(projectId),projects=data?.proyectosExtraordinarios||[];
  const project=projects.find(x=>Number(x.id)===id);
  if(!project)throw Error('Selecciona un proyecto extraordinario antes de descargar Excel.');
  const from=data.viviendasMantenimiento||data.viviendas||[];
  const byId=new Map((project.viviendasDetalle||[]).map(h=>[Number(h.casaId),h]));
  const houses=[...from].sort(numericOrder).map(h=>{
   const detail=byId.get(Number(h.casaId));
   if(!detail)throw Error('El proyecto no contiene los cargos de todas las viviendas. Actualiza el análisis.');
   return {...detail,casaId:Number(h.casaId),calle:h.calle,numero:h.numero,nombre:h.nombre,
    tags:h.tags,estatus:String(detail.estatus||'PENDIENTE').toUpperCase()};
  });
  const rows=houses.map(h=>[h.casaId,safe(h.calle),safe(h.numero),safe(h.nombre),
   safe(isNoAplica(h)?'No aplica':h.estatus==='PAGADO'?'Meta alcanzada':
    h.estatus==='PAGO_PARCIAL'?'Abonando':'Sin aportes'),
   money(h.montoCuota),money(h.montoPagado),money(h.ultimoPago?.monto),
   money(h.saldoPendiente),money(h.saldoFavor),date(h.ultimoPago?.fecha),
   safe(h.ultimoPago?.referencia),Number(h.tags?.detalle?.length||0)]);
  const pagos=houses.filter(paid),completas=houses.filter(complete);
  const pendientes=houses.filter(h=>!complete(h)&&!isNoAplica(h));
  const exentas=houses.filter(isNoAplica),parciales=houses.filter(h=>paid(h)&&!complete(h));
  const ids=items=>new Set(items.map(h=>h.casaId));
  const rowById=new Map(rows.map(r=>[r[0],r]));
  const list=items=>[...ids(items)].map(id=>rowById.get(id));
  const total=houses.reduce((a,h)=>a+cents(h.montoCuota),0)/100;
  const recaudado=houses.reduce((a,h)=>a+cents(h.montoPagado),0)/100;
  const pendiente=houses.reduce((a,h)=>a+cents(h.saldoPendiente),0)/100;
  const saldoFavor=houses.reduce((a,h)=>a+cents(h.saldoFavor),0)/100;
  const grouped=new Map();
  for(const h of houses){
   const key=String(h.calle||'Sin calle');
   if(!grouped.has(key))grouped.set(key,{cumplidas:0,pendientes:0,exentas:0,abonos:0});
   const t=grouped.get(key);
   if(isNoAplica(h))t.exentas++;
   else if(complete(h))t.cumplidas++;
   else t.pendientes++;
   t.abonos+=cents(h.montoPagado);
  }
  const streets=[...grouped].sort((a,b)=>a[0].localeCompare(b[0],'es-MX',{numeric:true}))
   .map(([name,v])=>[safe(name),v.cumplidas,v.pendientes,v.exentas,v.abonos/100]);
  const listMov=Array.isArray(movimientos)?movimientos:[];
  const originals=listMov.filter(p=>Number(p.monto)>0);
  const sourceLabel=origen=>{
   const key=String(origen||'').toUpperCase();
   if(key==='BANCO')return 'Banco validado';
   if(key==='ADMIN')return 'Registro administrativo';
   if(key==='HISTORICO'||key==='EXCEL_HISTORICO')return 'Importación histórica';
   return 'Aportación: '+key;
  };
  const incomeMap=new Map();
  for(const p of originals){
   const label=sourceLabel(p.origen);
   incomeMap.set(label,(incomeMap.get(label)||0)+cents(p.monto));
  }
  const incomes=[...incomeMap].sort((a,b)=>a[0].localeCompare(b[0]))
   .map(([label,value])=>[label,value/100]);
  if(!incomes.length)incomes.push(['Sin aportaciones',0]);
  const movements=originals.map(p=>{
   const h=houses.find(x=>x.casaId===Number(p.casaId));
   return [Number(p.casaId),safe(h?.calle||''),safe(h?.numero||''),
    safe(h?.nombre||''),date(p.fecha),money(p.monto),
    safe(p.referencia),safe(sourceLabel(p.origen)),safe(p.formaPago),Number(p.cargoId||0)];
  }).sort((a,b)=>String(b[4]).localeCompare(String(a[4]))||a[0]-b[0]);
  const householdTotal=houses.length-exentas.length;
  const sheet=(nombre,columnas,filas)=>({nombre,columnas,filas});
  const finanzas=[
   ['Proyecto','Costo objetivo',money(total),'Suma de las metas individuales actuales'],
   ['Proyecto','Aportaciones registradas',money(recaudado),'Movimientos del proyecto, no ingresos bancarios independientes'],
   ['Proyecto','Saldo por recaudar',money(pendiente),'Suma de saldos de las viviendas'],
   ['Proyecto','Saldo a favor',money(saldoFavor),'No descontar de otras viviendas'],
   ['Proyecto','No aplica',exentas.length,'Casas sin cargo; no cuentan como pagadas'],
   ['Balance contra meta','Diferencia de aportaciones contra meta',money(recaudado-total),
    'Un valor negativo significa pendiente por recaudar; la meta es presupuesto, no gasto realizado'],
   ...incomes.map(([label,value])=>['Origen',safe(label),money(value),
    'Clasificación de movimientos registrados; no duplicar con depósitos bancarios'])
  ];
  const balanceProyecto=root.MJFinanceBalance?.proyecto(project)||{
   tipo:'META_PROYECTO',ingresos:money(recaudado),egresos:money(total),
   diferencia:money(recaudado-total),estado:recaudado>total?'SALDO_A_FAVOR':recaudado<total?'SALDO_EN_CONTRA':'EN_EQUILIBRIO',
   criterio:'Aportaciones acumuladas menos meta presupuestada; la meta no es un egreso pagado.'};
  const dashboard={
   esProyecto:true,proyectoId:id,balanceMensual:balanceProyecto,
   status:[['Meta alcanzada',completas.length],['Sin meta completa',pendientes.length]],
   anual:[['Meta alcanzada',completas.length],['Abonando',parciales.length]],
   ingresos:incomes,egresos:[
    ['Meta del proyecto',money(total)],['Recaudado',money(recaudado)],
    ['Pendiente',money(pendiente)],['Saldo a favor',money(saldoFavor)]
   ],
   calles:streets.map(x=>[String(x[0]),x[1],x[2]]),
   indicadores:{completas:completas.length,pendientes:pendientes.length,
    anuales:exentas.length,totalIngresos:recaudado,totalEgresos:pendiente,
    saldoInicial:exentas.length,saldoDisponible:total},
   origenIngresos:'Movimientos históricos y confirmados de este proyecto; no duplicar en caja.'
  };
  const label={padron:'Padrón completo',pagadas:'Casas con aportaciones',
   pendientes:'Sin meta completa',historicas:'Todos los movimientos'}[tipo];
  const resumen=[
   ['Reporte extraordinario',label],['Proyecto',safe(project.nombre)],
   ['Clave del proyecto',safe(project.codigo||'')],['Fecha de inicio',date(project.fechaInicio)],
   ['Viviendas en padrón',houses.length],
   ['Con aportaciones registradas',pagos.length],
   ['Meta alcanzada',completas.length],['Abonos parciales',parciales.length],
   ['Sin meta completa',pendientes.length],['No aplica',exentas.length],
   ['Costo total actual (MXN)',money(total)],
   ['Aportaciones registradas (MXN)',money(recaudado)],
   ['Pendiente por recaudar (MXN)',money(pendiente)],
   ['Saldo a favor (MXN)',money(saldoFavor)],
   ['Diferencia contra meta (MXN)',money(recaudado-total)],
   ['Estado de diferencia',recaudado>total?'Sobre la meta':recaudado<total?'Por recaudar':'Meta cubierta'],
   ['Alcance','Solo proyecto seleccionado; incluye las 231 viviendas sin depender de filtros ni paginación.'],
   ['Criterio financiero','El historial de aportaciones puede incluir importaciones bancarias y registros manuales. No duplicar depósitos en caja.']
  ];
  const hojas=[
   sheet('Todas las viviendas',headers,rows),
   sheet('Pago registrado',headers,list(pagos)),
   sheet('Sin Pagar',headers,list(pendientes)),
   sheet('Finanzas',['Tipo','Concepto','Monto / viviendas','Procedencia / criterio'],finanzas),
   sheet('Desglose por calle',['Calle','Meta alcanzada','Sin meta completa','No aplica','Abonado (MXN)','Viviendas'],
    streets.map(x=>[...x,x[1]+x[2]+x[3]])),
   sheet('Aportaciones',['ID vivienda','Calle','Número','Residente','Fecha','Monto (MXN)',
    'Referencia','Origen','Forma de pago','ID cargo'],movements),
   sheet('No aplica',headers,list(exentas)),
   sheet('Abonos parciales',headers,list(parciales))
  ];
  const idSafe=String(project.codigo||project.id).replace(/[^A-Za-z0-9_-]/g,'_').slice(0,60);
  return {nombre:'Proyecto_'+idSafe+'_'+tipo,archivo:'MJ_Extraordinarias_'+idSafe+'_'+tipo+'.xlsx',
   titulo:'Cuotas extraordinarias · '+project.nombre,hojas,dashboard,resumen};
 }
 const api={prepararReporteProyecto};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MJFinanceExcelProyectos=api;
})(typeof window==='undefined'?globalThis:window);
