(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const modal=$('manualReceiptsModal');
 if(!modal)return;
 const api=(window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api')+'/finanzas/recibos-manuales';
 const token=()=>localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
 const meses=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
 const abrev=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
 let houses=[],selection=null,fromFocus=null,saving=false,history=[],offset=0,historyMore=false;
 let activeReceipt=null,pdfUrl=null,pdfBlob=null,historyLoaded=false;
 let nameEdited=false,numberChoices=[],numberChoiceIndex=-1;

 function today(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
   timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {year:Number(parts.year),month:Number(parts.month),
   iso:parts.year+'-'+parts.month+'-'+parts.day,
   label:parts.day+'/'+parts.month+'/'+parts.year};
 }
 function writeStatus(id,message){$(id).textContent=message||'';}
 async function read(path='',options={}){
  const response=await fetch(api+path,{cache:'no-store',...options,headers:{
   Authorization:'Bearer '+token(),...(options.headers||{})
  }});
  if(response.status===401){location.replace('login.html');throw Error('Sesión caducada');}
  if(!response.ok){
   const json=await response.json().catch(()=>({}));
   throw Error(json.message||'No se pudo consultar el historial de recibos manuales.');
  }
  return response;
 }
 async function json(path='',payload=null){
  const options=payload===null?{}:{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify(payload)};
  const data=await (await read(path,options)).json();
  if(!data.ok)throw Error(data.message||'No se completó la operación');
  return data;
 }
 function field(id,value){$(id).value=String(value??'');}
 // Los recibos siguen permitiendo datos libres; seleccionar una casa solo
 // llena los campos sin registrar pagos ni actualizar el padrón.
 function streetKey(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .trim().replace(/\s+/g,' ').toLocaleLowerCase('es-MX');
 }
 function houseNumberKey(value){
  return String(value||'').trim().toLocaleLowerCase('es-MX');
 }
 function streetValue(){
  return $('manualReceiptStreet').value==='__OTHER__'
   ?$('manualReceiptOtherStreet').value.trim():$('manualReceiptStreet').value;
 }
 function refreshStreetInitial(){
  const calle=streetValue().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  field('manualReceiptInitial',calle.charAt(0).toUpperCase());
  updatePreview();
 }
 function closeNumberChoices(){
  numberChoices=[];numberChoiceIndex=-1;
  $('manualReceiptNumberOptions').hidden=true;
  $('manualReceiptNumber').setAttribute('aria-expanded','false');
  $('manualReceiptNumber').removeAttribute('aria-activedescendant');
 }
 function prefill(house){
  selection=house||null;
  if(!house)return;
  field('manualReceiptStreet',house.calle);
  $('manualReceiptOtherStreetWrap').hidden=true;
  $('manualReceiptOtherStreet').required=false;
  field('manualReceiptOtherStreet','');
  field('manualReceiptNumber',house.numero);
  field('manualReceiptName',house.nombre||'');
  nameEdited=false;
  closeNumberChoices();
  refreshStreetInitial();
 }
 function context(){
  const current=typeof window.MJManualReceiptContext==='function'
   ?window.MJManualReceiptContext():{viviendas:[],selectedHouseId:null};
  houses=(current.viviendas||[]).filter(h=>
    Number.isSafeInteger(h.casaId)&&h.casaId>0&&h.calle&&h.numero)
   .sort((a,b)=>(a.calle+' '+a.numero).localeCompare(b.calle+' '+b.numero,'es-MX',{numeric:true}));
  const streetSelect=$('manualReceiptStreet');
  streetSelect.replaceChildren();
  streetSelect.add(new Option('Selecciona una calle',''));
  const unique=new Map();
  for(const house of houses){
   const key=streetKey(house.calle);
   if(key&&!unique.has(key))unique.set(key,String(house.calle).trim());
  }
  [...unique.values()].sort((a,b)=>a.localeCompare(b,'es-MX',{numeric:true,sensitivity:'base'}))
   .forEach(street=>streetSelect.add(new Option(street,street)));
  streetSelect.add(new Option('Otra calle / captura manual','__OTHER__'));
  return current.selectedHouseId;
 }
 function exactHouse(){
  const street=streetKey(streetValue());
  const number=houseNumberKey($('manualReceiptNumber').value);
  if(!street||!number||$('manualReceiptStreet').value==='__OTHER__')return null;
  const matches=houses.filter(h=>streetKey(h.calle)===street&&houseNumberKey(h.numero)===number);
  return matches.length===1?matches[0]:null;
 }
 function updateHouseMatch(force=false){
  const house=exactHouse();
  selection=house;
  if(force||!nameEdited){
   field('manualReceiptName',house?.nombre||'');
   nameEdited=false;
  }
  updatePreview();
 }
 function useNumberChoice(house){
  field('manualReceiptNumber',house.numero);
  selection=house;
  field('manualReceiptName',house.nombre||'');
  nameEdited=false;
  closeNumberChoices();
  updatePreview();
  $('manualReceiptNumber').focus();
 }
 function moveNumberChoice(next){
  if(!numberChoices.length)return;
  numberChoiceIndex=(next+numberChoices.length)%numberChoices.length;
  const buttons=$('manualReceiptNumberOptions').querySelectorAll('[role="option"]');
  buttons.forEach((button,index)=>button.setAttribute('aria-selected',String(index===numberChoiceIndex)));
  const selected=buttons[numberChoiceIndex];
  if(selected){
   $('manualReceiptNumber').setAttribute('aria-activedescendant',selected.id);
   selected.scrollIntoView({block:'nearest'});
  }
 }
 function showNumberChoices(){
  const container=$('manualReceiptNumberOptions');
  closeNumberChoices();container.replaceChildren();
  const street=streetKey(streetValue());
  if(!street||$('manualReceiptStreet').value==='__OTHER__')return;
  const query=houseNumberKey($('manualReceiptNumber').value);
  const candidates=houses.filter(h=>streetKey(h.calle)===street &&
    houseNumberKey(h.numero).includes(query));
  candidates.sort((a,b)=>
    Number(houseNumberKey(b.numero)===query)-Number(houseNumberKey(a.numero)===query)||
    String(a.numero).localeCompare(String(b.numero),'es-MX',{numeric:true}));
  numberChoices=candidates.slice(0,20);
  if(!numberChoices.length){
   const info=document.createElement('p');
   info.className='manual-receipt-number-empty';
   info.textContent='Sin coincidencias. Puedes escribir un número manualmente.';
   container.appendChild(info);
  }else{
   numberChoices.forEach((house,index)=>{
    const option=document.createElement('button');
    option.type='button';option.id='manualReceiptNumberOption'+index;
    option.setAttribute('role','option');option.setAttribute('aria-selected','false');
    const number=document.createElement('strong');number.textContent=house.numero;
    const resident=document.createElement('small');resident.textContent=house.nombre||'Sin residente registrado';
    option.append(number,resident);
    option.addEventListener('mousedown',event=>event.preventDefault());
    option.addEventListener('click',()=>useNumberChoice(house));
    container.appendChild(option);
   });
  }
  container.hidden=false;
  $('manualReceiptNumber').setAttribute('aria-expanded','true');
 }
 function updatePreview(){
  const mm=Number($('manualReceiptFolioMonth').value),year=$('manualReceiptFolioYear').value;
  const init=$('manualReceiptInitial').value.trim().toUpperCase()||'_';
  const number=$('manualReceiptNumber').value.trim().toUpperCase()||'_';
  $('manualReceiptFolioPreview').textContent='MJ-'+(abrev[mm-1]||'___')+'-'+
   (year||'____')+'-XXXXXXXXXX-'+init+number+'-M';
 }
 function renderDraft(){
  const val=id=>$(id).value.trim();
  const set=(id,value)=>{$(id).textContent=value||'—'};
  set('manualDraftFolio',$('manualReceiptFolioPreview').textContent);
  set('manualDraftDate',val('manualReceiptDate'));
  set('manualDraftName',val('manualReceiptName'));
  set('manualDraftStreet',val('manualReceiptStreet'));
  set('manualDraftNumber',val('manualReceiptNumber'));
  set('manualDraftConcept',val('manualReceiptConceptTitle'));
  set('manualDraftPeriod',(meses[Number(val('manualReceiptCoveredMonth'))-1]||'—')+' '+val('manualReceiptCoveredYear'));
  set('manualDraftDetail',val('manualReceiptConceptDetail'));
  const amount=Number(val('manualReceiptAmount'));
  set('manualDraftAmount',Number.isSafeInteger(amount)&&amount>0?'$'+amount.toLocaleString('es-MX')+' MXN':'—');
  set('manualDraftMethod',val('manualReceiptMethod'));
  set('manualDraftSeal',val('manualReceiptSeal').toUpperCase());
 }
 $('manualReceiptReview').addEventListener('click',()=>{
  const expanded=$('manualReceiptReview').getAttribute('aria-expanded')==='true';
  $('manualReceiptDraft').hidden=expanded;
  $('manualReceiptReview').setAttribute('aria-expanded',String(!expanded));
  $('manualReceiptReview').textContent=expanded?'Ver borrador':'Ocultar borrador';
  if(!expanded){renderDraft();$('manualReceiptDraft').scrollIntoView({block:'nearest',behavior:'smooth'});}
 });
 $('manualReceiptForm').addEventListener('input',()=>{if(!$('manualReceiptDraft').hidden)renderDraft();});
 $('manualReceiptForm').addEventListener('change',()=>{if(!$('manualReceiptDraft').hidden)renderDraft();});

 function reset(){
  $('manualReceiptForm').reset();
  $('manualReceiptDraft').hidden=true;
  $('manualReceiptReview').setAttribute('aria-expanded','false');
  $('manualReceiptReview').textContent='Ver borrador';
  const t=today();
  field('manualReceiptFolioMonth',t.month);
  field('manualReceiptCoveredMonth',t.month);
  field('manualReceiptFolioYear',t.year);
  field('manualReceiptCoveredYear',t.year);
  field('manualReceiptDate',t.label);
  field('manualReceiptConceptTitle','Pago de mantenimiento');
  field('manualReceiptConceptDetail','Mantenimiento');
  field('manualReceiptSeal','PAGADO');
  field('manualReceiptMethod','EFECTIVO');
  field('manualReceiptStreet','');
  field('manualReceiptNumber','');
  field('manualReceiptName','');
  field('manualReceiptOtherStreet','');
  $('manualReceiptOtherStreetWrap').hidden=true;
  $('manualReceiptOtherStreet').required=false;
  selection=null;nameEdited=false;
  closeNumberChoices();
  writeStatus('manualReceiptStatus','');
  updatePreview();
 }
 function mode(next){
  $('manualReceiptNew').hidden=next!=='new';
  $('manualReceiptHistory').hidden=next!=='history';
  $('manualReceiptView').hidden=next!=='view';
  $('manualReceiptTabNew').classList.toggle('active',next==='new');
  $('manualReceiptTabHistory').classList.toggle('active',next==='history');
  $('manualReceiptTabNew').setAttribute('aria-selected',String(next==='new'));
  $('manualReceiptTabHistory').setAttribute('aria-selected',String(next==='history'));
  if(next==='history'&&!historyLoaded)void loadHistory(true);
 }
 function open(){
  fromFocus=document.activeElement;
  reset();
  let selectedId=context();
  // Facilitar el caso de una única casa encontrada por la búsqueda (Rosas 18),
  // incluso si aún no hicieron clic en la fila para seleccionarla.
  if(selectedId==null){
   const search=String($('financeSearch')?.value||'').trim().toLocaleLowerCase('es-MX');
   if(search){
    const matched=houses.filter(h=>
     [h.calle+' '+h.numero,h.nombre].some(value=>String(value||'').toLocaleLowerCase('es-MX').includes(search)));
    if(matched.length===1)selectedId=matched[0].casaId;
   }
  }
  if(selectedId!=null){
   const house=houses.find(h=>h.casaId===Number(selectedId));
   if(house)prefill(house);
  }
  modal.hidden=false;
  mode('new');
  $('manualReceiptName').focus();
 }
 function releasePdf(){
  $('manualReceiptPdfPreview').src='about:blank';
  if(pdfUrl)URL.revokeObjectURL(pdfUrl);
  pdfUrl=null;pdfBlob=null;activeReceipt=null;
  $('manualReceiptDownload').disabled=true;
 }
 function close(){
  if(saving)return;
  modal.hidden=true;
  releasePdf();
  writeStatus('manualReceiptStatus','');
  if(fromFocus?.isConnected)fromFocus.focus();
  fromFocus=null;
 }
 $('financeManualReceiptOpen').addEventListener('click',open);
 $('manualReceiptsClose').addEventListener('click',close);
 modal.addEventListener('click',e=>{if(e.target===modal)close()});
 document.addEventListener('keydown',e=>{
  if(modal.hidden)return;
  if(e.key==='Escape'){e.preventDefault();close();return;}
  if(e.key!=='Tab')return;
  const enabled=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')]
   .filter(x=>x.getClientRects().length>0&&!x.closest('[hidden]'));
  if(!enabled.length)return;
  if(e.shiftKey&&document.activeElement===enabled[0]){e.preventDefault();enabled.at(-1).focus();}
  else if(!e.shiftKey&&document.activeElement===enabled.at(-1)){e.preventDefault();enabled[0].focus();}
 });
 $('manualReceiptStreet').addEventListener('change',()=>{
  const other=$('manualReceiptStreet').value==='__OTHER__';
  $('manualReceiptOtherStreetWrap').hidden=!other;
  $('manualReceiptOtherStreet').required=other;
  field('manualReceiptOtherStreet','');
  field('manualReceiptNumber','');
  field('manualReceiptName','');
  nameEdited=false;selection=null;
  closeNumberChoices();refreshStreetInitial();
  if(other)$('manualReceiptOtherStreet').focus();
  else if($('manualReceiptStreet').value)$('manualReceiptNumber').focus();
 });
 $('manualReceiptOtherStreet').addEventListener('input',()=>{
  selection=null;refreshStreetInitial();
 });
 $('manualReceiptNumber').addEventListener('input',()=>{
  updateHouseMatch();
  showNumberChoices();
 });
 $('manualReceiptNumber').addEventListener('focus',showNumberChoices);
 $('manualReceiptNumber').addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(!$('manualReceiptNumberOptions').hidden){
    event.preventDefault();closeNumberChoices();
   }return;}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();
   if($('manualReceiptNumberOptions').hidden)showNumberChoices();
   moveNumberChoice(numberChoiceIndex+(event.key==='ArrowDown'?1:-1));
  }else if(event.key==='Enter'&&!$('manualReceiptNumberOptions').hidden&&numberChoiceIndex>=0){
   event.preventDefault();useNumberChoice(numberChoices[numberChoiceIndex]);
  }
 });
 $('manualReceiptNumber').addEventListener('blur',()=>{
  // En pantallas táctiles el blur puede ocurrir antes del click de una
  // sugerencia. Cerramos después para permitir elegirla en iPhone/Android.
  setTimeout(()=>{
   if(document.activeElement!==$('manualReceiptNumber'))closeNumberChoices();
  },180);
 });
 $('manualReceiptName').addEventListener('input',()=>{nameEdited=true;});
 document.addEventListener('click',event=>{
  if(!event.target.closest('.manual-receipt-number-combo'))closeNumberChoices();
 });
 for(const id of ['manualReceiptInitial','manualReceiptFolioMonth','manualReceiptFolioYear'])
  $(id).addEventListener('input',updatePreview);
 $('manualReceiptClear').addEventListener('click',()=>{
  reset();$('manualReceiptName').focus();
 });
 $('manualReceiptTabNew').addEventListener('click',()=>mode('new'));
 $('manualReceiptTabHistory').addEventListener('click',()=>mode('history'));
 $('manualReceiptViewBack').addEventListener('click',()=>{releasePdf();mode('history')});
 function payload(){
  // El servidor calcula fecha, folio aleatorio y referencia, nunca el navegador.
  const sello=$('manualReceiptSeal').value.trim().toUpperCase();
  if(!/^PAGADO(?:\b|$)/.test(sello))throw Error('El sello debe empezar con PAGADO.');
  const amount=$('manualReceiptAmount').value;
  if(!/^[1-9]\d*$/.test(amount))throw Error('El monto debe ser un número entero positivo, sin centavos.');
  return {
   casaId:selection?.casaId??null,
   calle:streetValue().trim(),
   inicialCalle:$('manualReceiptInitial').value.trim().toUpperCase(),
   numeroCasa:$('manualReceiptNumber').value.trim(),
   nombre:$('manualReceiptName').value.trim(),
   mesFolio:Number($('manualReceiptFolioMonth').value),
   anioFolio:Number($('manualReceiptFolioYear').value),
   conceptoPago:$('manualReceiptConceptTitle').value.trim(),
   mesCubierto:Number($('manualReceiptCoveredMonth').value),
   anioCubierto:Number($('manualReceiptCoveredYear').value),
   conceptoDetalle:$('manualReceiptConceptDetail').value.trim(),
   monto:Number(amount),formaPago:$('manualReceiptMethod').value,sello
  };
 }
 $('manualReceiptForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(saving)return;
  try{
   const params=payload();
   const confirmText='¿Guardar recibo manual para '+params.nombre+' por $'+params.monto.toLocaleString('es-MX')+
    ' MXN? Este documento no registra un pago en Análisis de cuotas.';
   if(!window.confirm(confirmText))return;
   saving=true;$('manualReceiptSave').disabled=true;
   writeStatus('manualReceiptStatus','Guardando recibo manual en su historial independiente…');
   const result=await json('',params);
   const row=result.data;
   // Una vez confirmado, no reemitir en caso de error al mostrar el PDF.
   historyLoaded=false;
   saving=false;
   $('manualReceiptSave').disabled=false;
   writeStatus('manualReceiptStatus','Guardado con folio '+row.folio+'.');
   mode('view');
   await showPdf(row);
  }catch(e){
   saving=false;$('manualReceiptSave').disabled=false;
   writeStatus('manualReceiptStatus',e.message);
  }
 });
 async function showPdf(row){
  releasePdf();
  activeReceipt=row;
  mode('view');
  $('manualReceiptViewFolio').textContent=row.folio;
  writeStatus('manualReceiptViewStatus','Cargando PDF del historial independiente…');
  try{
   const response=await read('/'+row.id+'/pdf');
   pdfBlob=await response.blob();
   if(!pdfBlob.type.includes('pdf'))throw Error('El servidor no devolvió un PDF.');
   if(modal.hidden||activeReceipt?.id!==row.id)return;
   pdfUrl=URL.createObjectURL(pdfBlob);
   $('manualReceiptPdfPreview').src=pdfUrl;
   $('manualReceiptDownload').disabled=false;
   writeStatus('manualReceiptViewStatus',row.nombre+' · $'+Number(row.monto).toLocaleString('es-MX')+
     ' MXN · '+row.formaPago+' · '+row.referencia);
  }catch(e){
   writeStatus('manualReceiptViewStatus','El recibo quedó guardado, pero no se pudo mostrar el PDF: '+e.message+
    '. Puedes volver a intentarlo desde Historial.');
  }
 }
 $('manualReceiptDownload').addEventListener('click',()=>{
  if(!pdfUrl||!pdfBlob||!activeReceipt)return;
  const link=document.createElement('a');link.href=pdfUrl;link.download=activeReceipt.folio+'.pdf';
  document.body.appendChild(link);link.click();link.remove();
 });
 function renderHistory(){
  const root=$('manualReceiptHistoryList'),search=$('manualReceiptSearch').value.trim().toLowerCase();
  root.replaceChildren();
  const rows=history.filter(r=>[r.folio,r.nombre,r.calle,r.numeroCasa,r.conceptoPago]
   .join(' ').toLowerCase().includes(search));
  if(!rows.length){
   const msg=document.createElement('p');
   msg.textContent=history.length?'No hay coincidencias entre los recibos cargados.':'Todavía no hay recibos manuales.';
   root.appendChild(msg);
  }
  rows.forEach(row=>{
   const item=document.createElement('div');item.className='manual-receipt-history-item';
   const info=document.createElement('div');
   const name=document.createElement('strong');name.textContent=row.folio;
   const text=document.createElement('p');
   text.textContent=row.calle+' '+row.numeroCasa+' · '+row.nombre+' · '+
     Number(row.monto).toLocaleString('es-MX')+' MXN · '+row.fechaEmision;
   info.append(name,text);
   const button=document.createElement('button');button.type='button';button.className='soft';
   button.textContent='Ver PDF';button.setAttribute('aria-label','Ver recibo '+row.folio);
   button.addEventListener('click',()=>void showPdf(row));
   item.append(info,button);root.appendChild(item);
  });
  $('manualReceiptHistoryMore').hidden=!historyMore;
 }
 async function loadHistory(resetPage=false){
  if(resetPage){history=[];offset=0;historyLoaded=false;}
  writeStatus('manualReceiptHistoryStatus','Consultando historial independiente…');
  $('manualReceiptHistoryMore').disabled=true;
  try{
   const data=await json('?offset='+offset);
   const rows=Array.isArray(data.data)?data.data:[];
   history.push(...rows);offset+=rows.length;historyMore=Boolean(data.mas);
   historyLoaded=true;renderHistory();
   writeStatus('manualReceiptHistoryStatus',history.length+' recibos cargados (los nuevos se muestran primero).');
  }catch(e){writeStatus('manualReceiptHistoryStatus',e.message);}
  finally{$('manualReceiptHistoryMore').disabled=false;}
 }
 $('manualReceiptHistoryMore').addEventListener('click',()=>void loadHistory(false));
 $('manualReceiptSearch').addEventListener('input',renderHistory);
})();
