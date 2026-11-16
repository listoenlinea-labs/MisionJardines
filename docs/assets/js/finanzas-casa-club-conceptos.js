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
  $('financeClubExpenseProofArea').hidden=!editing||!row.comprobanteDisponible;
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
  if(!source?.comprobanteDisponible||busy)return;
  setBusy(true);status('Consultando comprobante privado...');
  try{
   const api=(window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api')+'/finanzas';
   const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
   const res=await fetch(api+'/egresos/'+Number(source.id)+'/comprobante',
    {headers:{Authorization:'Bearer '+token},cache:'no-store'});
   if(!res.ok)throw Error('No fue posible visualizar el comprobante.');
   const blob=await res.blob();
   if(!['application/pdf','image/png','image/jpeg'].includes(blob.type))throw Error('Tipo de comprobante no admitido.');
   resetProof();proofUrl=URL.createObjectURL(blob);
   const el=document.createElement(blob.type==='application/pdf'?'iframe':'img');
   el.src=proofUrl;
   if(el.tagName==='IFRAME')el.title='Comprobante de gasto de Casa Club';
   else el.alt='Comprobante del concepto '+source.concepto;
   const area=$('financeClubExpensePreview');area.replaceChildren(el);area.hidden=false;
   status('Comprobante cargado.');
  }catch(e){status(e.message);}
  finally{setBusy(false);}
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
  const file=$('financeClubExpenseFile').files?.[0];
  setBusy(true);status('Guardando concepto...');
  try{
   const comprobante=await encode(file);
   if(source){
    const previo=snapshot(source);
    const changed=Object.keys(item).some(k=>item[k]!==previo[k]);
    if(changed)await ctx.request('/egresos/'+Number(source.id)+'/casa-club',{anterior:previo,nuevo:item},'PATCH');
    if(comprobante)await ctx.request('/egresos/'+Number(source.id)+'/comprobante',{comprobante},'PUT');
    if(!changed&&!comprobante){status('No hay cambios por guardar.');return;}
   }else{
    await ctx.request('/egresos',{
     ...item,ambito:'CASA_CLUB',categoria:$('financeClubExpenseCategory').value,
     ...(comprobante?{comprobante}:{})
    });
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
