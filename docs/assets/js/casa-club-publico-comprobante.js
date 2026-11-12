'use strict';
/* Casa Club sin sesión: misma lectura de comprobantes que Pagos, misma
   confirmación independiente Titan. Nunca confirmar por OCR del navegador. */
(()=>{
 const API=(window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api')+'/casa-club';
 const $=id=>document.getElementById(id);
 let acceso=null,data='',meta={name:'',mime:''},escaneo=0,leyendo=false,validadoOcr=false;
 let enProceso=false,estadoEnCurso=false,intervalo=null,totalEsperado=null;
 let titular='MARIA DEL ROCIO BAHENA JUAREZ',terminaciones=['4409'];
 const money=n=>Number(n||0).toLocaleString('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0});
 const setStatus=(msg,type='')=>{
  const host=$('clubProofResult');host.textContent=msg;
  host.className='club-proof-result'+(type?' '+type:'');
 };
 async function post(path,body){
  const response=await fetch(API+'/publico/comprobante'+path,{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
   cache:'no-store'
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok||!json.ok)throw Error(json.message||'No se pudo procesar la solicitud.');
  return json.data;
 }
 function parse(link){
  const hash=String(link||'').includes('#')?String(link).slice(String(link).indexOf('#')):String(link);
  const m=/^#comprobante=(\d+)\.([a-f0-9]{64})$/.exec(hash);
  const id=Number(m?.[1]);
  return m&&Number.isSafeInteger(id)&&id>0?{reservaId:id,claveAcceso:m[2]}:null;
 }
 function current(){return acceso?{reservaId:acceso.reservaId,claveAcceso:acceso.claveAcceso}:null;}
 function steps(n){
  ['clubProofStepOne','clubProofStepTwo','clubProofStepThree'].forEach((id,i)=>{
   $(id).classList.toggle('done',i<n);
   $(id).classList.toggle('active',i===n);
  });
 }
 function resetFile(){
  escaneo++;data='';meta={name:'',mime:''};validadoOcr=false;
  $('clubProofFile').value='';
  $('clubProofPreviewWrap').hidden=true;
  $('clubProofPreview').removeAttribute('src');
  for(const id of ['clubProofFolio','clubProofAmount','clubProofDate','clubProofTime'])$(id).value='';
  $('clubProofRead').disabled=true;
  $('clubProofSubmit').disabled=true;
 }
 async function refresh(){
  if(!acceso||estadoEnCurso)return;
  estadoEnCurso=true;
  try{
   const status=await post('/estado',current());
   totalEsperado=Number(status.total);
   titular=status.destinatario||titular;terminaciones=status.terminacionesCuenta?.length?status.terminacionesCuenta:[status.terminacionCuenta||'4409'];
   window.MJClubCuenta?.render('clubProofBankDetails',status.datosTransferencia,{
    conceptoTransferencia:status.conceptoTransferencia,monto:status.total
   });
   const p=status.comprobante;
   const pagado=status.pagado&&status.estatusReserva==='APROBADA';
   $('clubProofRetry').hidden=!(p?.estado==='RECHAZADO');
   $('clubProofReceipt').hidden=!p;
   if(pagado){
    steps(3);
    setStatus('Pago bancario verificado. Tu fecha quedó confirmada automáticamente, sin autorización de Administración.','success');
    $('clubPublicProofForm').hidden=true;
    $('clubProofRetry').hidden=true;
    clearInterval(intervalo);intervalo=null;
   }else if(status.estatusReserva==='CANCELADA'||status.estatusReserva==='RECHAZADA'){
    steps(0);
    setStatus('Esta reservación está cancelada o rechazada. Contacta a Administración antes de hacer otro depósito.','error');
    $('clubPublicProofForm').hidden=true;
    clearInterval(intervalo);intervalo=null;
   }else if(p?.estado==='RECHAZADO'){
    steps(1);
    setStatus('La validación bancaria no fue aceptada. Puedes solicitar una nueva revisión del mismo comprobante, sin subirlo dos veces.','error');
    $('clubPublicProofForm').hidden=true;
   }else if(p){
    steps(1);
    setStatus('Comprobante recibido. Titan está comparando importe, fecha, cuenta e identificadores. La fecha sigue apartada mientras se verifica.','pending');
    $('clubPublicProofForm').hidden=true;
   }else{
    steps(0);
    $('clubPublicProofForm').hidden=false;
    setStatus('Tu solicitud ya está apartada provisionalmente. Adjunta el comprobante de tu depósito para que Titan lo valide.','pending');
   }
  }catch(error){
   setStatus('No pudimos consultar el resultado: '+error.message+'. Conserva el enlace para reintentar.','error');
  }finally{estadoEnCurso=false;}
 }
 function schedule(){
  if(intervalo)clearInterval(intervalo);
  intervalo=setInterval(()=>void refresh(),12000);
 }
 function open(link){
  const parsed=parse(link);
  if(!parsed)return;
  acceso=parsed;
  // No persistir el enlace privado en sessionStorage ni usarlo como precarga.
  // Fragmento, no query: el token no se envía a logs ni en Referer HTTP.
  if(location.hash!=='#comprobante='+parsed.reservaId+'.'+parsed.claveAcceso)
   history.replaceState(null,'','#comprobante='+parsed.reservaId+'.'+parsed.claveAcceso);
  $('clubProofIntro').hidden=true;
  $('clubPublicProofFlow').hidden=false;
  $('clubPublicProofForm').hidden=false;
  resetFile();steps(0);
  void refresh();schedule();
  const target=$('clubPaymentDetails').hidden?$('clubPublicProofFlow'):$('clubPaymentDetails');
  target.scrollIntoView({behavior:'smooth',block:'start'});
 }
 async function fileUrl(file){
  return new Promise((resolve,reject)=>{
   const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('No se pudo leer el archivo.'));
   r.readAsDataURL(file);
  });
 }
 async function image(src){
  return new Promise((resolve,reject)=>{
   const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('No se pudo procesar la imagen.'));
   im.src=src;
  });
 }
 function jpeg(canvas){
  let q=.9,encoded=canvas.toDataURL('image/jpeg',q);
  while(encoded.length>1350000&&q>.42){q-=.1;encoded=canvas.toDataURL('image/jpeg',q);}
  if(encoded.length>1500000)throw Error('La imagen es demasiado grande. Selecciona una copia más ligera.');
  return encoded;
 }
 async function convertirArchivo(file){
  if(file.type==='application/pdf'){
   if(!window.mjPdfJs)throw Error('El lector PDF todavía se está cargando. Intenta de nuevo.');
   const pdf=await window.mjPdfJs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
   const page=await pdf.getPage(1);
   const viewport=page.getViewport({scale:1.7});
   const canvas=document.createElement('canvas');
   canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
   return jpeg(canvas);
  }
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))
   throw Error('Formato no admitido. Adjunta JPG, PNG, WEBP o PDF.');
  const im=await image(await fileUrl(file)),max=2800;
  const upscale=im.width>=500&&im.width<1150?Math.min(1.75,1150/im.width):1;
  const scale=Math.min(upscale,max/Math.max(im.width,im.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(im.width*scale));
  canvas.height=Math.max(1,Math.round(im.height*scale));
  canvas.getContext('2d').drawImage(im,0,0,canvas.width,canvas.height);
  return jpeg(canvas);
 }
 async function leer(){
  if(!data||leyendo)return;
  const revision=++escaneo;
  leyendo=true;validadoOcr=false;$('clubProofSubmit').disabled=true;$('clubProofRead').disabled=true;
  $('clubProofOcrStatus').textContent='Leyendo el comprobante y comprobando la cuenta destino…';
  let worker=null;
  try{
   if(!window.Tesseract||!window.MJComprobante)throw Error('El lector OCR no está disponible. Revisa tu conexión.');
   worker=await Tesseract.createWorker('spa+eng',1,{
    logger:status=>{if(revision===escaneo&&status.status==='recognizing text')
     $('clubProofOcrStatus').textContent='Reconociendo información bancaria: '+Math.round((status.progress||0)*100)+'%';}
   });
   await worker.setParameters({tessedit_pageseg_mode:Tesseract.PSM.AUTO});
   const readings=[(await worker.recognize(data))?.data?.text||''];
   if(revision!==escaneo)return;
   const one=window.MJComprobante.extract(readings[0]);
   const check=window.MJComprobante.verifyDestination(readings[0],titular,terminaciones);
   if(!check.ok||!one.amount||!one.date||!one.time||!(one.claveRastreo||one.referencia||one.folio)){
    try{
     await worker.setParameters({tessedit_pageseg_mode:Tesseract.PSM.SPARSE_TEXT});
     const extra=(await worker.recognize(data))?.data?.text||'';
     if(extra.trim())readings.push(extra);
    }catch(_){/* segunda lectura opcional */}
   }
   if(revision!==escaneo)return;
   const texto=readings.join(window.MJComprobante.OCR_PASS_MARKER);
   const destino=window.MJComprobante.verifyDestination(texto,titular,terminaciones);
   if(!destino.ok)throw Error(destino.message+' Adjunta un comprobante donde se vea el beneficiario y alguna terminación oficial: '+terminaciones.join(', ')+'.');
   const parsed=window.MJComprobante.extract(texto);
   const codigo=parsed.claveRastreo||parsed.referencia||parsed.folio||window.MJComprobante.candidatosOperacion(texto)[0]||'';
   if(!codigo||!parsed.amount||!parsed.date||!parsed.time)
    throw Error('Faltan clave/referencia, monto, fecha u hora en la imagen. Adjunta una captura más clara.');
   if(Number.isFinite(totalEsperado)&&totalEsperado>0&&Math.round(Number(parsed.amount)*100)!==Math.round(totalEsperado*100))
    throw Error('El depósito debe ser exactamente '+money(totalEsperado)+'. El comprobante indica '+money(parsed.amount)+'.');
   $('clubProofFolio').value=codigo;
   $('clubProofAmount').value=parsed.amount;
   $('clubProofDate').value=parsed.date;
   $('clubProofTime').value=parsed.time;
   validadoOcr=true;$('clubProofSubmit').disabled=false;
   $('clubProofOcrStatus').textContent='Destinatario y terminación verificados en la imagen. Confirma el envío para que Titan compruebe el depósito.';
  }catch(e){
   if(revision===escaneo)$('clubProofOcrStatus').textContent='No se pudo completar la lectura: '+e.message;
  }finally{
   if(worker)await worker.terminate().catch(()=>{});
   leyendo=false;$('clubProofRead').disabled=!data;
  }
 }
 $('clubProofFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0];resetFile();if(!file)return;
  const revision=escaneo;
  try{
   meta={name:file.name||'comprobante',mime:file.type||''};
   data=await convertirArchivo(file);
   if(revision!==escaneo)return;
   $('clubProofPreview').src=data;$('clubProofPreviewWrap').hidden=false;
   $('clubProofRead').disabled=false;
   await leer();
  }catch(err){if(revision===escaneo)$('clubProofOcrStatus').textContent=err.message;}
 });
 $('clubProofRead').addEventListener('click',()=>void leer());
 $('clubPublicProofForm').addEventListener('submit',async e=>{
  e.preventDefault();if(enProceso||!validadoOcr||!acceso)return;
  enProceso=true;$('clubProofSubmit').disabled=true;
  $('clubProofSubmit').textContent='Enviando comprobante…';
  try{
   await post('',{...current(),
    folioOperacion:$('clubProofFolio').value.trim(),
    fechaOperacion:$('clubProofDate').value,
    horaOperacion:$('clubProofTime').value,
    monto:Number($('clubProofAmount').value),
    comprobanteData:data,comprobanteNombre:meta.name,comprobanteMime:meta.mime
   });
   resetFile();
   setStatus('Comprobante reportado. Iniciamos la verificación bancaria con Titan.','pending');
   await refresh();
  }catch(error){
   setStatus('No se pudo registrar el comprobante: '+error.message,'error');
   $('clubProofOcrStatus').textContent='Revisa la imagen y vuelve a intentarlo. No se registró un depósito.';
  }finally{
   enProceso=false;$('clubProofSubmit').textContent='Enviar comprobante a Titan';
   $('clubProofSubmit').disabled=!validadoOcr;
  }
 });
 $('clubProofRefresh').addEventListener('click',()=>void refresh());
 $('clubProofRetry').addEventListener('click',async()=>{
  if(!acceso)return;
  $('clubProofRetry').disabled=true;
  try{
   await post('/reintentar',current());
   setStatus('Titan volverá a comprobar el archivo original, sin duplicar el reporte.','pending');
   await refresh();
  }catch(e){setStatus(e.message,'error');}
  finally{$('clubProofRetry').disabled=false;}
 });
 $('clubProofReceipt').addEventListener('click',async()=>{
  if(!acceso)return;
  const button=$('clubProofReceipt');button.disabled=true;
  try{
   const response=await fetch(API+'/publico/comprobante/recibo',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(current()),cache:'no-store'
   });
   if(!response.ok){const e=await response.json().catch(()=>({}));throw Error(e.message||'No hay recibo disponible');}
   const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');
   a.href=url;a.download='Recibo_CasaClub_'+acceso.reservaId+'.pdf';document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){setStatus(e.message,'error');}finally{button.disabled=false;}
 });
 window.MJClubPublicProof={open,refresh};
 // En la URL pública genérica no se recupera ningún comprobante anterior.
 if(parse(location.hash))open(location.hash);
})();
