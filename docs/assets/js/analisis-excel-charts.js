(function(root){
 'use strict';
 // ExcelJS genera el contenido del libro, pero no gráficos nativos.
 // Inyectamos partes DrawingML/ChartML válidas en el XLSX (OpenXML/ZIP).
 // Son objetos de gráfico editables en Excel, con referencias a celdas y
 // caché de valores; no imágenes PNG ni elementos rasterizados.
 const xml=v=>String(v??'').replace(/[<>&"']/g,c=>({
  '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'
 }[c]));
 const color=v=>/^[A-Fa-f0-9]{6}$/.test(String(v||''))?v:'769EBA';
 const paleta=['76B79B','87A9D9','E8B28D','AE9AC9','E1C674','8DBEC6','BA96A2','8BC0A0'];
 const chartType='http://schemas.openxmlformats.org/drawingml/2006/chart';
 const drawType='http://schemas.openxmlformats.org/drawingml/2006/main';
 const chartRel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const pkgRel='http://schemas.openxmlformats.org/package/2006/relationships';
 const cover=r=>r.map((v,i)=>'<c:pt idx="'+i+'"><c:v>'+xml(v)+'</c:v></c:pt>').join('');
 function cats(source){
  return '<c:cat><c:strRef><c:f>'+xml(source.categories)+'</c:f>'+
   '<c:strCache><c:ptCount val="'+source.categoryValues.length+'"/>'+
   cover(source.categoryValues)+'</c:strCache></c:strRef></c:cat>';
 }
 function vals(series){
  return '<c:val><c:numRef><c:f>'+xml(series.ref)+'</c:f>'+
   '<c:numCache><c:formatCode>General</c:formatCode>'+
   '<c:ptCount val="'+series.points.length+'"/>'+
   cover(series.points)+'</c:numCache></c:numRef></c:val>';
 }
 function points(series,selectedPalette){
  return series.points.map((_,i)=>'<c:dPt><c:idx val="'+i+'"/>'+
   '<c:spPr><a:solidFill><a:srgbClr val="'+color(selectedPalette[i%selectedPalette.length])+
   '"/></a:solidFill></c:spPr></c:dPt>').join('');
 }
 // El XML de gráficos se mantiene en el formato conservador que Excel
 // abrió correctamente antes de añadir etiquetas de punto individuales.
 // Los porcentajes, importes y cantidades se muestran en nombres de
 // categorías que apuntan a fórmulas de la hoja Resumen.
 function serie(source,series,index,colors,vary=false){
  return '<c:ser><c:idx val="'+index+'"/><c:order val="'+index+'"/>'+
   '<c:tx><c:v>'+xml(series.name)+'</c:v></c:tx>'+
   (vary?points(series,colors):'<c:spPr><a:solidFill><a:srgbClr val="'+color(colors[index%colors.length])+
    '"/></a:solidFill></c:spPr>')+
   cats(source)+vals(series)+'</c:ser>';
 }
 function title(value){
  return '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p>'+
   '<a:pPr><a:defRPr/></a:pPr><a:r><a:rPr lang="es-MX" sz="1250" b="1"/>'+
   '<a:t>'+xml(value)+'</a:t></a:r><a:endParaRPr lang="es-MX"/>'+
   '</a:p></c:rich></c:tx><c:overlay val="0"/></c:title>';
 }
 // Títulos concisos en los ejes; no añaden etiquetas encima de las barras.
 function axisTitle(value){
  if(!value)return '';
  return '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p>'+
   '<a:pPr><a:defRPr lang="es-MX" sz="900"/></a:pPr>'+
   '<a:r><a:rPr lang="es-MX" sz="900"/><a:t>'+xml(value)+'</a:t></a:r>'+
   '<a:endParaRPr lang="es-MX"/></a:p></c:rich></c:tx>'+
   '<c:overlay val="0"/></c:title>';
 }
 function axes(x,y,horizontal,xTitle='',yTitle='',maxValue=null){
  const catPos=horizontal?'l':'b',valPos=horizontal?'b':'l';
  return '<c:catAx><c:axId val="'+x+'"/><c:scaling><c:orientation val="minMax"/></c:scaling>'+
   '<c:delete val="0"/><c:axPos val="'+catPos+'"/>'+
   axisTitle(horizontal?yTitle:xTitle)+
   '<c:tickLblPos val="nextTo"/>'+
   '<c:crossAx val="'+y+'"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblOffset val="100"/></c:catAx>'+
   '<c:valAx><c:axId val="'+y+'"/><c:scaling><c:orientation val="minMax"/>'+
   (maxValue>0?'<c:max val="'+maxValue+'"/>':'')+'</c:scaling>'+
   '<c:delete val="0"/><c:axPos val="'+valPos+'"/><c:majorGridlines>'+
   '<c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E6EDF2"/></a:solidFill></a:ln></c:spPr>'+
   '</c:majorGridlines>'+
   axisTitle(horizontal?xTitle:yTitle)+
   '<c:numFmt formatCode="#,##0.##" sourceLinked="0"/>'+
   '<c:tickLblPos val="nextTo"/><c:crossAx val="'+x+'"/>'+
   '<c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>';
 }
 function graficar(spec,id){
  if(!spec.source?.categoryValues?.length)throw Error('Gráfica sin categorías: '+spec.title);
  const source=spec.source,colors=spec.colors||paleta,round=spec.kind==='doughnut';
  const series=source.values;
  const x=110000+id*11,y=110001+id*11;
  let plot;
  if(round){
   // No generar c:dLbls: los porcentajes aparecen en la leyenda inferior.
   plot='<c:doughnutChart><c:varyColors val="1"/>'+
    serie(source,series[0],0,colors,true)+
    '<c:firstSliceAng val="270"/><c:holeSize val="60"/></c:doughnutChart>';
  }else{
   const stacked=spec.kind==='stacked',horizontal=stacked||spec.kind==='bar';
   plot='<c:barChart><c:barDir val="'+(horizontal?'bar':'col')+'"/>'+
    '<c:grouping val="'+(stacked?'stacked':'clustered')+'"/>'+
    '<c:varyColors val="0"/>'+
    series.map((item,i)=>serie(source,item,i,colors,false)).join('')+
    '<c:gapWidth val="65"/>'+(stacked?'<c:overlap val="100"/>':'')+
    '<c:axId val="'+x+'"/><c:axId val="'+y+'"/></c:barChart>'+
    axes(x,y,horizontal,spec.xTitle||'',spec.yTitle||'');
  }
  // Cada color se explica exclusivamente en el pie. Las barras de una
  // serie también llevan leyenda ("Monto (MXN)") y un único color.
  const legend='<c:legend><c:legendPos val="b"/><c:layout/>'+
   '<c:overlay val="0"/></c:legend>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
   '<c:chartSpace xmlns:c="'+chartType+'" xmlns:a="'+drawType+'" xmlns:r="'+chartRel+'">'+
   '<c:lang val="es-MX"/><c:roundedCorners val="1"/>'+
   '<c:chart>'+title(spec.title)+'<c:plotArea><c:layout/>'+plot+'</c:plotArea>'+
   legend+'<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>'+
   '</c:chartSpace>';
 }
 function anchor(spec,n){
  const point=(name,pos)=>'<xdr:'+name+'><xdr:col>'+pos[0]+'</xdr:col>'+
   '<xdr:colOff>0</xdr:colOff><xdr:row>'+pos[1]+'</xdr:row>'+
   '<xdr:rowOff>0</xdr:rowOff></xdr:'+name+'>';
  return '<xdr:twoCellAnchor editAs="oneCell">'+point('from',spec.from)+point('to',spec.to)+
   '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr>'+
   '<xdr:cNvPr id="'+(n+1)+'" name="'+xml(spec.title)+'"/>'+
   '<xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>'+
   '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>'+
   '<a:graphic><a:graphicData uri="'+chartType+'"><c:chart xmlns:c="'+chartType+
   '" xmlns:r="'+chartRel+'" r:id="rId'+n+'"/></a:graphicData></a:graphic>'+
   '</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
 }
 function uniqueRel(existing){
  const ids=[...existing.matchAll(/\bId="rId(\d+)"/g)].map(x=>Number(x[1]));
  return 'rId'+(Math.max(0,...ids)+1);
 }
 async function insertarGraficas(buffer,specs,JSZip){
  if(!JSZip?.loadAsync)throw Error('No está disponible JSZip para insertar gráficas editables.');
  if(!Array.isArray(specs)||!specs.length)return buffer;
  const zip=await JSZip.loadAsync(buffer),get=async p=>{
   const file=zip.file(p);if(!file)throw Error('Falta componente XLSX: '+p);
   return file.async('string');
  };
  const sheet='xl/worksheets/sheet1.xml';
  let sheetXml=await get(sheet);
  if(/<drawing(?:\s|>)/.test(sheetXml))throw Error('Esta hoja ya tiene dibujos; no se pueden sustituir.');
  const sheetRelsPath='xl/worksheets/_rels/sheet1.xml.rels';
  let rels=zip.file(sheetRelsPath)?await get(sheetRelsPath):
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Relationships xmlns="'+pkgRel+'"></Relationships>';
  const drawId=1;
  const drawingName='drawing'+drawId+'.xml';
  const drawingPath='xl/drawings/'+drawingName;
  if(zip.file(drawingPath))throw Error('Ya existe un dibujo en el libro.');
  const relId=uniqueRel(rels);
  const link='<Relationship Id="'+relId+'" Type="'+chartRel+
   '/drawing" Target="../drawings/'+drawingName+'"/>';
  if(rels.includes('</Relationships>'))rels=rels.replace('</Relationships>',link+'</Relationships>');
  else {
   const open=rels.indexOf('<Relationships '),end=rels.indexOf('/>',open);
   if(open<0||end<0)throw Error('Relaciones del libro con formato inesperado');
   rels=rels.slice(0,end)+'>'+link+'</Relationships>'+rels.slice(end+2);
  }
  sheetXml=sheetXml.replace('</worksheet>',
   '<drawing xmlns:r="'+chartRel+'" r:id="'+relId+'"/></worksheet>');
  zip.file(sheet,sheetXml);zip.file(sheetRelsPath,rels);
  let drawings='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
   '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"'+
   ' xmlns:a="'+drawType+'" xmlns:r="'+chartRel+'">';
  let drawingRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
   '<Relationships xmlns="'+pkgRel+'">';
  let types=await get('[Content_Types].xml');
  for(let i=0;i<specs.length;i++){
   const n=i+1;
   const path='xl/charts/chart'+n+'.xml';
   if(zip.file(path))throw Error('El libro ya contiene chart'+n);
   zip.file(path,graficar(specs[i],n));
   drawings+=anchor(specs[i],n);
   drawingRels+='<Relationship Id="rId'+n+'" Type="'+chartRel+
    '/chart" Target="../charts/chart'+n+'.xml"/>';
   types=types.replace('</Types>','<Override PartName="/'+path+
    '" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>');
  }
  drawings+='</xdr:wsDr>';drawingRels+='</Relationships>';
  zip.file(drawingPath,drawings);
  zip.file('xl/drawings/_rels/'+drawingName+'.rels',drawingRels);
  types=types.replace('</Types>','<Override PartName="/'+drawingPath+
   '" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  zip.file('[Content_Types].xml',types);
  return zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'});
 }
 const api={insertarGraficas,graficar};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MJFinanceExcelCharts=api;
})(typeof window==='undefined'?globalThis:window);
