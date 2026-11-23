(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const dlg=$('financeClubExpenseModal'),form=$('financeClubExpenseForm');
 if(!dlg||!form)return;
 const context=()=>window.MJFinanceClubExpenseContext?.();
 let source=null,busy=false,proofUrl=null;
 const status=text=>{$('financeClubExpenseStatus').textContent=text;};
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const snapshot=x=>({concepto:String(x.concepto||'').trim(),fecha:String(x.fecha||'').slice(0,10),
  monto:Math.round(Number(x.monto||0)),pagado:Boolean(Number(x.pagado))});
 function resetProof(){
  const area=$('financeClubExpensePreview');
  area.replaceChildren();area.hidden=true;
  if(proofUrl){URL.revokeObjectURL(proofUrl);proofUrl=null;}
 }
 function close(){if(busy)return;resetProof();dlg.close();}
 function loadRow(row){
  source=row||null;resetProof();form.reset();
  const editing=Boolean(row);
  $('financeClubExpenseTitle').textContent=editing?'Detalle y edición del concepto':'Agregar concepto de Casa Club';
  $('financeClubExpenseConcept').value=editing?String(row.concepto||''):'';
  $('financeClubExpenseAmount').value=editing?String(Math.round(Number(row.monto||0))):'';
  $('financeClubExpenseDate').value=editing?String(row.fecha||'').slice(0,10):today();
  $('financeClubExpensePaid').checked=editing?Boolean(Number(row.pagado)):true;
  $('financeClubExpenseCategory').value=editing?String(row.categoria||'OTROS'):'OTROS';
  $('financeClubExpenseCategory').disabled=editing;
  $('financeClubExpenseDelete').hidden=!editing;
  $('financeClubExpenseProofArea').hidden=!editing;
  status('');
  dlg.showModal();$('financeClubExpenseConcept').focus();
 }
 async function encode(file){
  if(!file)return null;
  if(!file.size||file.size>1024*1024)throw Error('El comprobante debe pesar entre 1 byte y 1 MB.');
  if(!['application/pdf','image/png','image/jpeg'].includes(file.type))
   throw Error('Solo se aceptan PDF, PNG o JPG/JPEG.');
  const bytes=new Uint8Array(await file.arrayBuffer()),parts=[];
  for(let i=0;i<bytes.length;i+=8192)parts.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
  return {mime:file.type,base64:btoa(parts.join(''))};
 }
 const setBusy=value=>{
  busy=value;
  ['financeClubExpenseClose','financeClubExpenseCancel','financeClubExpenseDelete',
   'financeClubExpenseSave','financeClubExpenseShowProof'].forEach(id=>{$(id).disabled=value;});
 };
 $('financeClubExpenseOpen').addEventListener('click',()=>{
  if(context()?.activeConcept!=='CASA_CLUB')return;
  loadRow(null);
 });
 $('financeExpenseChart').addEventListener('click',event=>{
  const trigger=event.target.closest('[data-club-expense-detail]');
  if(!trigger||context()?.activeConcept!=='CASA_CLUB')return;
  const row=(context()?.data?.egresosCasaClubAnuales||[]).find(x=>Number(x.id)===Number(trigger.dataset.clubExpenseDetail));
  if(row)loadRow(row);
 });
 $('financeClubExpenseClose').addEventListener('click',close);
 $('financeClubExpenseCancel').addEventListener('click',close);
 dlg.addEventListener('cancel',event=>{if(busy)event.preventDefault();else resetProof();});
 $('financeClubExpenseShowProof').addEventListener('click',async()=>{
  if(!source||busy)return;
  setBusy(true);status('Consultando comprobantes privados...');
  try{
   const api=(window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api')+'/finanzas';
   const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
   const path='/egresos/'+Number(source.id)+'/comprobantes';
   const response=await fetch(api+path,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
   const result=await response.json();
   if(!response.ok||!result.ok)throw Error(result.message||'No se pudo consultar la lista.');
   resetProof();
   const area=$('financeClubExpensePreview');area.hidden=false;
   const rows=result.data||[];
   if(!rows.length){area.textContent='Este concepto no tiene comprobantes adjuntos.';return;}
   const buttons=document.createElement('div'),viewer=document.createElement('div');
   buttons.style.display='flex';buttons.style.flexWrap='wrap';buttons.style.gap='8px';
   area.append(buttons,viewer);
   for(const item of rows){
    const b=document.createElement('button');b.type='button';b.className='soft';
    b.textContent=item.nombre||'Comprobante '+item.id;
    b.addEventListener('click',async()=>{
     try{
      const file=await fetch(api+path+'/'+Number(item.id),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if(!file.ok)throw Error('No se pudo abrir el comprobante seleccionado.');
      const blob=await file.blob();
      if(!['application/pdf','image/png','image/jpeg'].includes(blob.type))throw Error('Formato no compatible.');
      if(proofUrl)URL.revokeObjectURL(proofUrl);
      proofUrl=URL.createObjectURL(blob);
      const el=document.createElement(blob.type==='application/pdf'?'iframe':'img');
      el.src=proofUrl;if(el.tagName==='IFRAME')el.title='Comprobante de Casa Club';
      else el.alt='Comprobante '+(item.nombre||'');
      viewer.replaceChildren(el);status('Mostrando '+(item.nombre||'comprobante')+'.');
     }catch(e){status(e.message);}
    });buttons.append(b);
   }
   buttons.firstElementChild?.click();
  }catch(e){status(e.message);}finally{setBusy(false);}
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const ctx=context();
  if(!ctx||ctx.activeConcept!=='CASA_CLUB')return status('La pestaña cambió. Abre nuevamente el concepto.');
  const item={concepto:$('financeClubExpenseConcept').value.trim(),
   fecha:$('financeClubExpenseDate').value,monto:Number($('financeClubExpenseAmount').value),
   pagado:$('financeClubExpensePaid').checked};
  if(!item.concepto||!Number.isSafeInteger(item.monto)||item.monto<1||!/^\d{4}-\d{2}-\d{2}$/.test(item.fecha))
   return status('Completa concepto, fecha e importe entero.');
  const files=[...($('financeClubExpenseFile').files||[])];
  if(files.length>12)return status('Selecciona máximo 12 comprobantes por operación.');
  setBusy(true);status('Guardando concepto y comprobantes...');
  try{
   let id=Number(source?.id)||0;
   if(source){
    const previo=snapshot(source);
    const changed=Object.keys(item).some(k=>item[k]!==previo[k]);
    if(changed)await ctx.request('/egresos/'+id+'/casa-club',{anterior:previo,nuevo:item},'PATCH');
    if(!changed&&!files.length){status('No hay cambios por guardar.');return;}
   }else{
    const saved=await ctx.request('/egresos',{...item,ambito:'CASA_CLUB',
     categoria:$('financeClubExpenseCategory').value});
    id=Number(saved.id);
    if(!Number.isSafeInteger(id)||id<=0)throw Error('El concepto quedó registrado pero no llegó su ID. Consulta el historial.');
   }
   let uploaded=0;
   for(const file of files){
    try{
     await ctx.request('/egresos/'+id+'/comprobantes',{nombre:file.name,comprobante:await encode(file)});
     uploaded++;
    }catch(error){
     throw Error('El concepto se guardó y '+uploaded+' de '+files.length+
      ' comprobantes se adjuntaron. '+error.message+' Puedes adjuntar los restantes al editarlo.');
    }
   }
   resetProof();dlg.close();
   const ok=await ctx.load();
   if(!ok)alert('Concepto guardado. Actualiza Análisis para consultar el nuevo resumen.');
  }catch(error){status(error.message||'No se pudo guardar el concepto.');}
  finally{setBusy(false);}
 });
 $('financeClubExpenseDelete').addEventListener('click',async()=>{
  if(!source||busy)return;
  const ctx=context();
  if(!ctx||ctx.activeConcept!=='CASA_CLUB')return;
  if(!confirm('¿Eliminar el concepto «'+source.concepto+'» por '+ctx.fmt(source.monto)+
   '? Se eliminará también su comprobante, y se conservará una auditoría.'))return;
  setBusy(true);status('Eliminando concepto...');
  try{
   await ctx.request('/egresos/'+Number(source.id)+'/casa-club',{anterior:snapshot(source)},'DELETE');
   resetProof();dlg.close();
   const ok=await ctx.load();if(!ok)alert('Concepto eliminado. Actualiza el análisis para consultar las cifras.');
  }catch(error){status(error.message||'No se pudo eliminar el concepto.');}
  finally{setBusy(false);}
 });
})();
