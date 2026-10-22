'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {prepararReporte}=require('../../docs/assets/js/analisis-excel.js');
const {graficar,insertarGraficas}=require('../../docs/assets/js/analisis-excel-charts.js');

const casa=(id,estado,ultimo=null,extra={})=>({
 casaId:id,calle:'Gardenias',numero:String(id),nombre:'Persona '+id,
 estatus:estado,pagada:estado!=='PENDIENTE',montoPagado:estado==='PENDIENTE'?0:300,
 ultimoMesPagado:ultimo,saldoPendiente:estado==='PAGADO'?0:300,
 ultimoPago:estado==='PENDIENTE'?null:{monto:300,fecha:'2026-10-19'},
 ...extra
});
const todas=[
 casa(4,'PAGADO',{mes:'DICIEMBRE',anio:2026,pagoAnual:true},{ultimoPago:{monto:600,fecha:'2026-10-22'}}),
 casa(5,'PAGADO',{mes:'OCTUBRE',anio:2026}),
 casa(6,'PENDIENTE',{mes:'AGOSTO',anio:2026}),
 casa(7,'PAGO_PARCIAL',{mes:'SEPTIEMBRE',anio:2026})
];
const data={
 anio:2026,mes:10,periodo:'OCTUBRE 2026',viviendasMantenimiento:todas,
 calles:[{calle:'Gardenias',pagadas:3,pendientes:1}],
 esCargaHistorica:false,ingresosReportados:{mantenimiento:1200,extraordinarios:500,casaClub:300},
 ingresosAdicionales:50,totalManualConcepto:100,manualesCasaClub:70,
 ingresosParaBalance:2150,egresosCategorias:{LUZ:500,AGUA:300},totalEgresos:800,
 saldoInicial:20,balanceReportado:1370
};

test('padrón genera hojas independientes y anualidad con corte diciembre explícito',()=>{
 const report=prepararReporte(data,'padron');
 assert.deepEqual(report.hojas.map(h=>h.nombre),
  ['Todas las viviendas','Pago registrado','Sin Pagar','Finanzas','Desglose por calle']);
 assert.equal(report.hojas[0].filas.length,4);
 assert.equal(report.hojas[1].filas.length,2);
 assert.equal(report.hojas[2].filas.length,2);
 const anual=report.hojas[1].filas.find(f=>f[2]==='4');
 assert.equal(anual[7],'DICIEMBRE 2026');
 assert.equal(anual[15],'Pago anual');
 assert.equal(report.hojas[2].filas.find(f=>f[2]==='6')[7],'AGOSTO 2026');
 assert.equal(report.hojas[2].filas.find(f=>f[2]==='7')[15],'Abono parcial');
 assert.deepEqual(report.dashboard.status,[['Pagado completo',2],['Sin pago completo',2]]);
 assert.deepEqual(report.dashboard.anual,[['Pago anual',1],['Pago mensual',1]]);
});

test('ingresos por concepto coinciden con el indicador sin duplicar depósitos',()=>{
 const actual=prepararReporte(data,'padron').dashboard;
 assert.equal(actual.ingresos.reduce((sum,[,n])=>sum+n,0),2150);
 const historico=prepararReporte({...data,esCargaHistorica:true,cobrosCuotasRegistrados:650,
   ingresosParaBalance:800},'padron').dashboard;
 assert.equal(historico.ingresos.reduce((sum,[,n])=>sum+n,0),800);
 assert.equal(historico.ingresos[0][0],'Mantenimiento · cuotas');
 assert.equal(historico.ingresos[1][1],0,'no contabiliza dos veces las transferencias');
 assert.equal(historico.origenIngresos.includes('no sumar'),true);
});

test('ChartML produce gráficas editables referenciando celdas, nunca rasterizadas',()=>{
 const src={categories:"'Resumen'!$A$18:$A$19",
  categoryValues:['Pagado completo','Sin pago completo'],
  values:[{name:'Viviendas',ref:"'Resumen'!$B$18:$B$19",points:[2,2]}]};
 const xml=graficar({kind:'doughnut',title:'Cumplimiento',source:src},1);
 assert.match(xml,/<c:doughnutChart>/);
 assert.match(xml,/<c:f>\&apos;Resumen\&apos;!\$A\$18:\$A\$19<\/c:f>/);
 assert.match(xml,/<c:numCache>/);
 assert.doesNotMatch(xml,/<(?:xdr:pic|a:blip|image)/);
 const barras=graficar({kind:'stacked',title:'Por calle',source:{...src,values:[
  src.values[0],{name:'Pendientes',ref:"'Resumen'!$C$18:$C$19",points:[1,0]}]}},2);
 assert.match(barras,/<c:barDir val="bar"/);
 assert.match(barras,/<c:grouping val="stacked"/);
 assert.match(barras,/<c:valAx>/);
});
test('ZIP registra relaciones, partes ChartML y objetos DrawingML vinculados',async()=>{
 const files=new Map([
  ['xl/worksheets/sheet1.xml','<worksheet xmlns="test"><sheetData/></worksheet>'],
  ['[Content_Types].xml','<Types></Types>']
 ]);
 const zip={
  file(name,contents){
   if(arguments.length>1){files.set(name,contents);return this;}
   return files.has(name)?{async:async()=>files.get(name)}:null;
  },
  generateAsync:async()=>files
 };
 const JSZip={loadAsync:async()=>zip};
 const source={categories:"'Resumen'!$A$18:$A$19",
  categoryValues:['Pagado completo','Sin pago completo'],
  values:[{name:'Viviendas',ref:"'Resumen'!$B$18:$B$19",points:[2,2]}]};
 const result=await insertarGraficas(new ArrayBuffer(0),[
  {kind:'doughnut',title:'Cumplimiento',source,from:[7,2],to:[15,17]},
  {kind:'column',title:'Ingresos',source,from:[7,19],to:[15,35]}
 ],JSZip);
 assert.equal(result,files);
 assert.equal([...files.keys()].filter(name=>/xl\/charts\/chart\d+\.xml/.test(name)).length,2);
 assert.match(files.get('xl/worksheets/sheet1.xml'),/<drawing[^>]+r:id="rId1"/);
 assert.match(files.get('xl/drawings/drawing1.xml'),/xdr:twoCellAnchor/);
 assert.match(files.get('xl/drawings/_rels/drawing1.xml.rels'),/chart2\.xml/);
 assert.match(files.get('[Content_Types].xml'),/drawingml.chart\+xml/);
 assert.match(files.get('[Content_Types].xml'),/drawing\+xml/);
});
test('selector anual solo funciona para Mantenimiento y no toca datos de otras pestañas',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
 const js=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-cuotas.js'),'utf8');
 assert.match(html,/<option value="PAGO_ANUAL">Pago anual<\/option>/);
 assert.match(js,/status==='PAGO_ANUAL'/);
 assert.match(js,/h\.ultimoMesPagado\?\.pagoAnual/);
 assert.match(js,/choice of \['ADVERTENCIAS','PAGO_ANUAL'\]/);
 assert.match(html,/analisis-excel-charts\.js/);
 assert.match(html,/jszip@3\.10\.1/);
});

test('Excel estable: ChartML no inserta etiquetas individuales incompatibles',()=>{
 const base={categories:"'Resumen'!$AF$17:$AF$18",
  categoryValues:['Pagadas · 85.7%','Pendientes · 14.3%'],
  values:[{name:'Viviendas',ref:"'Resumen'!$B$17:$B$18",points:[198,33]}]};
 const charts=[
  {kind:'doughnut',title:'Cumplimiento',source:base},
  {kind:'bar',title:'Ingresos',source:base,xTitle:'Monto (MXN)',yTitle:'Concepto'},
  {kind:'stacked',title:'Calles',source:{...base,values:[
   base.values[0],{name:'Pendientes',ref:"'Resumen'!$F$17:$F$18",points:[18,4]}
  ]},xTitle:'Viviendas',yTitle:'Calle'}
 ];
 charts.forEach((config,i)=>{
  const xml=graficar(config,i+1);
  assert.doesNotMatch(xml,/<c:dLbls>|<c:dLbl>/,
   'ChartML no usa etiquetas de punto que provocaron el aviso de reparación');
  assert.match(xml,/<c:legendPos val="b"\/>/);
  assert.match(xml,/<c:strRef><c:f>\&apos;Resumen\&apos;!/);
  assert.match(xml,/<c:numRef><c:f>\&apos;Resumen\&apos;!/);
  assert.doesNotMatch(xml,/<a:blip|<xdr:pic/);
 });
});

test('Porcentajes, montos y cantidades se presentan en fuentes de categorías calculadas',()=>{
 const js=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-excel.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
 for(const token of ['estadoEtiquetas','anualEtiquetas','ingresoEtiquetas',
  'callesEtiquetas','egresosEtiquetas'])assert.ok(js.includes('source:'+token));
 assert.match(js,/formula:formulas\[i\],result:label/);
 assert.match(js,/SUM\(\$B\$17:\$B\$18\)/);
 assert.match(js,/SUM\(\$E\$17:\$E\$18\)/);
 assert.match(js,/TEXT\(B/);
 assert.match(js,/formatMoney/);
 assert.match(js,/streetLabels/);
 assert.match(html,/analisis-excel-charts\.js\?v=20261022-recuperar-graficas/);
 assert.match(html,/analisis-excel\.js\?v=20261022-recuperar-graficas/);
});
test('Las zonas de gráficos en Resumen se amplían sin superponerse',()=>{
 const js=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-excel.js'),'utf8');
 assert.match(js,/kind:'bar',[\s\S]*?source:ingresoEtiquetas/);
 assert.match(js,/xTitle:'Monto \(MXN\)',yTitle:'Concepto'/);
 assert.match(js,/colors:\['76B79B','E9B38D'\]/);
 assert.match(js,/\.sort\(\(a,b\)=>b\[1\]-a\[1\]\)/);
 assert.match(js,/from:\[7,24\],to:\[18,50\]/);
 assert.match(js,/from:\[19,24\],to:\[30,50\]/);
 assert.match(js,/from:\[7,53\],to:\[20,81\]/);
});

test('Regresion: restaurar las cinco graficas y ocultar AF:AJ sin perder etiquetas',()=>{
 const excel=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-excel.js'),'utf8');
 const chart=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-excel-charts.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
 assert.match(excel,/getColumn\(column\)\.hidden=true/);
 assert.match(excel,/formula:formulas\[i\],result:label/);
 for(const name of ['estadoEtiquetas','anualEtiquetas','ingresoEtiquetas','callesEtiquetas','egresosEtiquetas'])
  assert.ok(excel.includes('source:'+name),'Chart must reference its calculated categories: '+name);
 assert.match(chart,/plotVisOnly val="0"/);
 assert.doesNotMatch(chart,/<c:dLbls>|<c:dLbl>/);
 assert.match(html,/20261022-recuperar-graficas/);
});
test('Regresion ChartML: porcentajes y montos sin etiquetas incompatibles',()=>{
 const sources=[
  {kind:'doughnut',title:'Cumplimiento',source:{categories:"'Resumen'!$AF$17:$AF$18",
    categoryValues:['Pagado completo · 85.7%','Sin pago completo · 14.3%'],
    values:[{name:'Viviendas',ref:"'Resumen'!$B$17:$B$18",points:[198,33]}]}},
  {kind:'bar',title:'Ingresos',source:{categories:"'Resumen'!$AH$24:$AH$25",
    categoryValues:['Mantenimiento · cuotas · $59,650.00','Otros · $400.00'],
    values:[{name:'Monto (MXN)',ref:"'Resumen'!$B$24:$B$25",points:[59650,400]}]}}
 ];
 sources.forEach((spec,i)=>{
  const xml=graficar(spec,i+1);
  assert.match(xml,/<c:legendPos val="b"\/>/);
  assert.match(xml,/<c:plotVisOnly val="0"\/>/);
  assert.match(xml,/<c:strRef><c:f>\&apos;Resumen\&apos;!/);
  assert.match(xml,/<c:numRef><c:f>\&apos;Resumen\&apos;!/);
  assert.doesNotMatch(xml,/<c:dLbl|<a:blip|<xdr:pic/);
 });
});
