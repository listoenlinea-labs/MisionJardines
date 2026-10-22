(function (root) {
 'use strict';

 const dinero=v=>Math.round(Number(v||0)*100)/100;
 const fecha=v=>v?String(v).slice(0,10):'';
 const texto=v=>{
  const value=String(v??'');
  // No interpretar datos externos (nombre/referencia) como fórmulas de Excel.
  return /^[\s]*[=+@-]/.test(value)?"'"+value:value;
 };
 const mesUltimo=h=>h.ultimoMesPagado?`${h.ultimoMesPagado.mes} ${h.ultimoMesPagado.anio}`:'Sin pago';
 const datosVivienda=h=>[h.casaId,texto(h.calle),texto(h.numero),texto(h.nombre),texto(h.estatus),
  dinero(h.montoPagado),dinero(h.ultimoPago?.monto),mesUltimo(h),
  dinero(h.saldoPendiente),h.ultimoPago?.fecha?fecha(h.ultimoPago.fecha):'',
  texto(h.ultimoPago?.referencia),Array.isArray(h.mesesPendientes)?h.mesesPendientes.length:Number(h.mesesPendientes||0),
  dinero(h.recargosPendientes),Number(h.tags?.detalle?.length||0),dinero(h.tarifaMensual||300),
  h.ultimoMesPagado?.pagoAnual?'Pago anual':String(h.estatus||'').toUpperCase()==='PAGO_PARCIAL'?'Abono parcial':'Mensual'];
 const headersVivienda=['ID vivienda','Calle','Número','Residente','Estado del mes','Pagado en el mes (MXN)',
  'Último movimiento (MXN)','Último mes pagado','Saldo pendiente (MXN)',
  'Fecha último movimiento','Referencia','Meses pendientes','Recargos pendientes (MXN)','TAGs','Cuota mensual por cobrar (MXN)','Modalidad'];


 // La anualidad es un subconjunto de viviendas pagadas, NO una tercera clase
 // que se pueda sumar a Pagadas y Sin Pagar.
 const pagoCompleto=h=>String(h.estatus||'').toUpperCase()==='PAGADO';
 const anualConfirmado=h=>pagoCompleto(h)&&Boolean(h.ultimoMesPagado?.pagoAnual);
 const monto=n=>dinero(n);
 function prepararDashboard(data,viviendas){
  const completas=viviendas.filter(pagoCompleto);
  const pendientes=viviendas.filter(h=>!pagoCompleto(h));
  const anuales=completas.filter(anualConfirmado);
  const historico=Boolean(data.esCargaHistorica);
  const bank=data.ingresosReportados||{};
  const manuales=monto(data.totalManualConcepto),clubManual=monto(data.manualesCasaClub);
  const ingresos=[
   [historico?'Mantenimiento · cuotas':'Mantenimiento · banco',
     monto(historico?data.cobrosCuotasRegistrados:bank.mantenimiento)],
   ['Extraordinarias · banco',historico?0:monto(bank.extraordinarios)],
   ['Casa club · banco',historico?0:monto(bank.casaClub)],
   ['Extraordinarias · manual',monto(manuales-clubManual)],
   ['Casa club · manual',clubManual],
   ['Ingresos adicionales',monto(data.ingresosAdicionales)]
  ];
  const egresos=Object.entries(data.egresosCategorias||{}).map(([nombre,valor])=>[nombre,monto(valor)]);
  if(!egresos.length)egresos.push(['Sin egresos',0]);
  // Los grupos se derivan del padrón si el endpoint no incluye un desglose.
  // Así las gráficas siempre tienen un origen completo y no exportan vacío.
  const agrupadas=new Map();
  for(const h of viviendas){
   const calle=String(h.calle||'Sin calle');
   if(!agrupadas.has(calle))agrupadas.set(calle,{pagadas:0,pendientes:0});
   agrupadas.get(calle)[pagoCompleto(h)?'pagadas':'pendientes']++;
  }
  const calles=[...agrupadas].sort(([a],[b])=>a.localeCompare(b,'es-MX',{numeric:true}))
   .map(([calle,conteo])=>[calle,conteo.pagadas,conteo.pendientes]);
  if(!calles.length)calles.push(['Sin viviendas',0,0]);
  return {
   status:[['Pagado completo',completas.length],['Sin pago completo',pendientes.length]],
   anual:[['Pago anual',anuales.length],['Pago mensual',completas.length-anuales.length]],
   ingresos,egresos,calles,
   indicadores:{
    completas:completas.length,pendientes:pendientes.length,anuales:anuales.length,
    totalIngresos:monto(data.ingresosParaBalance),totalEgresos:monto(data.totalEgresos),
    saldoInicial:monto(data.saldoInicial),saldoDisponible:monto(data.balanceReportado)
   },
   origenIngresos:historico?'Base de cuotas históricas (no sumar otra vez los mismos depósitos)':
    'Base de bancos validados y movimientos manuales'
  };
 }

 function prepararReporte(data,tipo){
  const todas=Array.isArray(data.viviendasMantenimiento)?data.viviendasMantenimiento:data.viviendas||[];
  const periodo=String(data.periodo||'');
  const sheet=(nombre,columnas,filas)=>({nombre,columnas,filas});
  const hojaViviendas=(nombre,filas)=>sheet(nombre,headersVivienda,filas.map(datosVivienda));
  const conteoPagadas=todas.filter(h=>h.pagada).length;
  const resumen=[['Período de análisis',periodo],['Viviendas en padrón',todas.length],
   ['Con pago registrado',conteoPagadas],['Sin pago registrado',todas.length-conteoPagadas],
   ['Nota','La exportación incluye todas las viviendas; ignora búsqueda, filtros y paginación.']];
  if(tipo==='padron'){
   const completas=todas.filter(pagoCompleto),pendientes=todas.filter(h=>!pagoCompleto(h));
   const dashboard=prepararDashboard(data,todas);
   const finanzas=[
    ...dashboard.ingresos.map(([n,v])=>['Ingreso',texto(n),v,dashboard.origenIngresos]),
    ...dashboard.egresos.map(([n,v])=>['Egreso',texto(n),v,'Egresos del mes seleccionado'])
   ];
   return {nombre:'Casas_en_padron',titulo:'Padrón y dashboard financiero',
    hojas:[hojaViviendas('Todas las viviendas',todas),
     hojaViviendas('Pago registrado',completas),
     hojaViviendas('Sin Pagar',pendientes),
     sheet('Finanzas',['Tipo','Concepto','Monto (MXN)','Procedencia / criterio'],finanzas),
     sheet('Desglose por calle',['Calle','Pagadas','Sin pago completo','Total','Porcentaje pagado'],
      dashboard.calles.map(([calle,pagadas,ped])=>[texto(calle),pagadas,ped,pagadas+ped,
       pagadas+ped?Math.round(pagadas/(pagadas+ped)*10000)/100:0]))],
    dashboard,
    resumen:[...resumen,
     ['Pagaron cuota completa',dashboard.indicadores.completas],
     ['Sin pago completo (incluye abonos parciales)',dashboard.indicadores.pendientes],
     ['Pago anual confirmado (subconjunto pagadas)',dashboard.indicadores.anuales],
     ['Nota de corte','El último mes pagado muestra todo el historial; el estado pagado corresponde al período seleccionado.'],
     ['Criterio de ingresos',dashboard.origenIngresos],
     ['Nota contable','Los ingresos por cuotas históricas y depósitos pueden representar el mismo dinero. No se suman dos veces.']]};
  }
  if(tipo==='pagadas')return {nombre:'Con_pago_registrado',titulo:'Viviendas con pago registrado',
   hojas:[hojaViviendas('Con pago',todas.filter(h=>h.pagada))],resumen};
  if(tipo==='pendientes')return {nombre:'Sin_pago_completo',titulo:'Viviendas sin pago registrado',
   hojas:[hojaViviendas('Sin pago',todas.filter(h=>!h.pagada)),
    hojaViviendas('Abonos parciales',todas.filter(h=>String(h.estatus).toUpperCase()==='PAGO_PARCIAL'))],
   resumen:[...resumen,['Nota de abonos','Los abonos parciales cuentan en la tarjeta «Con pago registrado», pero se detallan por separado.']]};
  if(tipo!=='historicas')throw Error('Tipo de reporte inválido');
  const cuotas=data.cuotasPeriodoDetalle||[];
  const pagos=data.pagosPeriodoDetalle||[];
  const ingresos=data.ingresosManuales||[];
  const manuales=data.manualesConceptoPeriodoDetalle||[];
  const hojas=[sheet('Cuotas del período',
   ['ID cuota','ID vivienda','Calle','Número','Residente','Año','Mes','Estado','Cuota (MXN)',
    'Pagado (MXN)','Recargo (MXN)','Saldo (MXN)','Fecha pago','Forma de pago','Referencia','Folio','Origen'],
   cuotas.map(q=>[q.id,q.casaId,texto(q.calle),texto(q.numero),texto(q.nombre),q.anio,texto(q.mes),
    texto(q.estatus),dinero(q.montoCuota),dinero(q.montoPagado),dinero(q.recargo),
    dinero(q.saldoPendiente),fecha(q.fechaPago),texto(q.formaPago),texto(q.referencia),texto(q.folio),texto(q.origen)])),
   sheet('Bancos validados',
    ['ID operación','ID vivienda','Calle','Número','Residente','Concepto','Monto (MXN)',
     'Recargo (MXN)','Fecha de operación','Referencia'],
    pagos.map(p=>[p.id,p.casaId,texto(p.calle),texto(p.numero),texto(p.nombre),texto(p.tipo),
     dinero(p.monto),dinero(p.recargo),fecha(p.fecha),texto(p.referencia)])),
   sheet('Ingresos adicionales', ['Tipo','Concepto','Monto (MXN)','Fecha','Referencia'],
    ingresos.map(i=>[texto(i.tipo),texto(i.concepto),dinero(i.monto),fecha(i.fecha),texto(i.referencia)])),
   sheet('Pagos manuales por concepto',
    ['ID movimiento','ID vivienda','Calle','Número','Concepto','Monto (MXN)','Forma de pago','Fecha','Referencia'],
    manuales.map(p=>[p.id,p.casaId,texto(p.calle),texto(p.numero),texto(p.tipo),
     dinero(p.monto),texto(p.formaPago),fecha(p.fecha),texto(p.referencia)]))];
  const detalles=[['Base del indicador',data.esCargaHistorica?'Cuotas históricas':'Bancos validados'],
   ['Cuotas históricas registradas (MXN)',dinero(data.cobrosCuotasRegistrados)],
   ['Ingresos bancarios validados (MXN)',dinero(data.ingresosValidados)],
   ['Ingresos adicionales (MXN)',dinero(data.ingresosAdicionales)],
   ['Pagos manuales por concepto (MXN)',dinero(data.totalManualConcepto)],
   ['Importe del indicador (MXN)',dinero(data.ingresosParaBalance)],
   ['Advertencia','Los abonos históricos y depósitos bancarios pueden ser el mismo dinero; no sumarlos si el período está importado.']];
  return {nombre:data.esCargaHistorica?'Cuotas_historicas':'Ingresos_validados',
   titulo:data.esCargaHistorica?'Cuotas históricas e ingresos':'Ingresos validados y conciliación',
   hojas,resumen:[...resumen,...detalles]};
 }

 async function descargarReporte(data,tipo,ExcelJS){
  if(!ExcelJS?.Workbook)throw Error('No se cargó el generador de archivos Excel. Actualiza la página e inténtalo nuevamente.');
  const reporte=prepararReporte(data,tipo);
  const workbook=new ExcelJS.Workbook();
  workbook.creator='Administración Misión Jardines';
  workbook.title=reporte.titulo;
  workbook.created=new Date();
  const addSheet=(nombre,cabeceras,filas)=>{
   const ws=workbook.addWorksheet(nombre,{views:[{state:'frozen',ySplit:1}]});
   ws.addRow(cabeceras);
   ws.getRow(1).height=29;
   ws.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FF1F4737'}};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE9F4EB'}};
    cell.alignment={vertical:'middle',wrapText:true};});
   filas.forEach((values,index)=>{
    const row=ws.addRow(values);
    if(index%2===1)row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF7FAF8'}};});
   });
   ws.autoFilter={from:{row:1,column:1},to:{row:1,column:cabeceras.length}};
   ws.columns.forEach((column,index)=>{
    const longest=Math.max(String(cabeceras[index]||'').length,
     ...filas.map(row=>String(row[index]??'').length));
    column.width=Math.min(43,Math.max(14,longest+2));
    if(/\(MXN\)|^Monto/.test(cabeceras[index]))column.numFmt='"$"#,##0.00;[Red]("$"#,##0.00)';
   });
   ws.pageSetup={fitToPage:true,fitToWidth:1,fitToHeight:0,orientation:'landscape'};
   ws.getColumn(4).width=Math.max(ws.getColumn(4).width||14,Math.min(36,ws.getColumn(4).width||14));
   return ws;
  };
  const resumenWs=addSheet('Resumen',['Indicador','Dato'],reporte.resumen);
  reporte.hojas.forEach(h=>addSheet(h.nombre,h.columnas,h.filas));
  let chartSpecs=[];
  if(reporte.dashboard){
   const info=reporte.dashboard;
   // Las series de las gráficas se alimentan de celdas editables de Resumen.
   const table=(row,col,title,columns,values)=>{
    resumenWs.getCell(row,col).value=title;
    resumenWs.getCell(row,col).font={bold:true,color:{argb:'FF1F4737'},size:12};
    columns.forEach((name,j)=>{const cell=resumenWs.getCell(row+1,col+j);
     cell.value=name;cell.font={bold:true,color:{argb:'FF1F4737'}};
     cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE9F4EB'}};});
    values.forEach((entry,i)=>entry.forEach((value,j)=>{
     const cell=resumenWs.getCell(row+2+i,col+j);
     cell.value=value;
     if(typeof value==='number')cell.numFmt=j===1&&/INGRESOS|EGRESOS/.test(title)?'"$"#,##0.00':'#,##0.##';
    }));
    const letter=n=>{let out='';while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26)}return out;};
    const ref=(c)=>"'Resumen'!$"+letter(c)+"$"+(row+2)+":$"+letter(c)+"$"+(row+1+values.length);
    return {categories:ref(col),categoryValues:values.map(v=>String(v[0])),
     values:columns.slice(1).map((n,i)=>({name:n,ref:ref(col+i+1),points:values.map(v=>Number(v[i+1]||0))}))};
   };
   const estado=table(15,1,'ESTADO DEL PADRÓN',['Estado','Viviendas'],info.status);
   const anual=table(15,4,'ANUALIDADES CONFIRMADAS',['Modalidad','Viviendas'],info.anual);
   const ingresos=table(22,1,'INGRESOS PARA EL BALANCE',['Origen / concepto','MXN'],info.ingresos);
   const calles=table(22,4,'CUMPLIMIENTO POR CALLE',['Calle','Pagadas','Pendientes'],info.calles);
   const egresos=table(37,1,'EGRESOS POR CATEGORÍA',['Categoría','MXN'],info.egresos);
   resumenWs.getColumn(1).width=38;resumenWs.getColumn(2).width=25;
   resumenWs.getColumn(4).width=34;resumenWs.getColumn(5).width=17;
   resumenWs.getColumn(6).width=17;
   for(let i=7;i<=25;i++)resumenWs.getColumn(i).width=12;
   resumenWs.getCell('A47').value='Importe del indicador de ingresos';
   resumenWs.getCell('B47').value=info.indicadores.totalIngresos;
   resumenWs.getCell('A48').value='Egresos registrados';
   resumenWs.getCell('B48').value=info.indicadores.totalEgresos;
   resumenWs.getCell('A49').value='Saldo inicial (se presenta aparte)';
   resumenWs.getCell('B49').value=info.indicadores.saldoInicial;
   resumenWs.getCell('A50').value='Saldo reportado';
   resumenWs.getCell('B50').value=info.indicadores.saldoDisponible;
   for(let n=47;n<=50;n++)resumenWs.getCell('B'+n).numFmt='"$"#,##0.00';
   chartSpecs=[
    {title:'Cumplimiento de mantenimiento',kind:'doughnut',source:estado,from:[7,2],to:[15,17],colors:['76B79B','E9B38D']},
    {title:'Anualidades entre las viviendas pagadas',kind:'doughnut',source:anual,from:[16,2],to:[24,17],colors:['8CA9D7','76B79B']},
    {title:'Ingresos por concepto (sin duplicar)',kind:'column',source:ingresos,from:[7,19],to:[15,35]},
    {title:'Cumplimiento por calle',kind:'stacked',source:calles,from:[16,19],to:[24,35]},
    {title:'Egresos por categoría',kind:'bar',source:egresos,from:[7,37],to:[18,54]}
   ];
  }
  let buffer=await workbook.xlsx.writeBuffer();
  if(chartSpecs.length){
   if(!root.MJFinanceExcelCharts?.insertarGraficas)
    throw Error('No se cargó el complemento de gráficas editables para Excel. Actualiza la página.');
   buffer=await root.MJFinanceExcelCharts.insertarGraficas(buffer,chartSpecs,root.JSZip);
  }
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=`MJ_${reporte.nombre}_${data.anio}_${String(data.mes).padStart(2,'0')}.xlsx`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),20000);
  return reporte;
 }
 const api={prepararReporte,descargarReporte};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MJFinanceExport=api;
})(typeof window==='undefined'?globalThis:window);
