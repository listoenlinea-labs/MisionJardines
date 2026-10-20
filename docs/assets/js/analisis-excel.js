(function (root) {
 'use strict';

 const dinero=v=>Math.round(Number(v||0));
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
  dinero(h.recargosPendientes),Number(h.tags?.detalle?.length||0),dinero(h.tarifaMensual||300)];
 const headersVivienda=['ID vivienda','Calle','Número','Residente','Estado del mes','Pagado en el mes (MXN)',
  'Último movimiento (MXN)','Último mes pagado','Saldo pendiente (MXN)',
  'Fecha último movimiento','Referencia','Meses pendientes','Recargos pendientes (MXN)','TAGs','Cuota mensual por cobrar (MXN)'];

 function prepararReporte(data,tipo){
  const todas=Array.isArray(data.viviendasMantenimiento)?data.viviendasMantenimiento:data.viviendas||[];
  const periodo=String(data.periodo||'');
  const sheet=(nombre,columnas,filas)=>({nombre,columnas,filas});
  const hojaViviendas=(nombre,filas)=>sheet(nombre,headersVivienda,filas.map(datosVivienda));
  const conteoPagadas=todas.filter(h=>h.pagada).length;
  const resumen=[['Período de análisis',periodo],['Viviendas en padrón',todas.length],
   ['Con pago registrado',conteoPagadas],['Sin pago registrado',todas.length-conteoPagadas],
   ['Nota','La exportación incluye todas las viviendas; ignora búsqueda, filtros y paginación.']];
  if(tipo==='padron')return {nombre:'Casas_en_padron',titulo:'Padrón completo de viviendas',
   hojas:[hojaViviendas('Todas las viviendas',todas)],resumen};
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
   filas.forEach(values=>ws.addRow(values));
   ws.autoFilter={from:{row:1,column:1},to:{row:1,column:cabeceras.length}};
   ws.columns.forEach((column,index)=>{
    const longest=Math.max(String(cabeceras[index]||'').length,
     ...filas.map(row=>String(row[index]??'').length));
    column.width=Math.min(45,Math.max(13,longest+2));
   });
   return ws;
  };
  addSheet('Resumen',['Indicador','Dato'],reporte.resumen);
  reporte.hojas.forEach(h=>addSheet(h.nombre,h.columnas,h.filas));
  const buffer=await workbook.xlsx.writeBuffer();
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
