'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const base=(window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api').replace(/\/$/,'')+'/casa-club/tarjetas-rojas';
 const token=()=>localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let casas=new Map(),seleccion=null,busy=false;
 async function api(path,method='GET',body){
  const response=await fetch(base+path,{method,cache:'no-store',
   headers:{Authorization:'Bearer '+token(),...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw Error(result.message||'No se pudo actualizar la tarjeta roja.');
  return result.data;
 }
 const contar=id=>casas.get(Number(id))?.tarjetasActivas??'—';
 function actualizarCeldas(){
  document.querySelectorAll('[data-red-count-id]').forEach(el=>{
   const total=contar(el.dataset.redCountId);
   el.textContent=String(total);
   el.style.fontWeight=Number(total)>0?'900':'500';
   el.style.color=Number(total)>0?'#b32f45':'#526174';
  });
 }
 async function actualizar(){
  // Para SEGURIDAD este endpoint jamás incluye residente, teléfono o correo.
  const rows=await api('/viviendas');
  casas=new Map(rows.map(h=>[Number(h.id),{
   id:Number(h.id),calle:h.calle,numero:h.numero,tarjetasActivas:Number(h.tarjetasActivas||0)
  }]));
  actualizarCeldas();
 }
 const dialog=$('segRedDialog');
 async function mostrar(id){
  const casa=casas.get(Number(id));
  if(!casa)throw Error('No se encontró la vivienda. Actualiza el padrón.');
  seleccion=await api('/casas/'+Number(id));
  $('segRedTitle').textContent='Tarjetas rojas · '+casa.calle+' '+casa.numero;
  $('segRedStatus').textContent=seleccion.totalActivas+' tarjeta(s) activa(s) · '+(seleccion.bloqueada?'Casa Club suspendida':'Sin suspensión vigente');
  $('segRedCards').innerHTML=seleccion.tarjetas.length?seleccion.tarjetas.map(t=>
   '<div class="seg-red-card"><strong>Tarjeta #'+Number(t.id)+' · '+(t.activa?'Activa':'Retirada')+'</strong>'+
   '<p>Incidencia registrada para la vivienda.</p>'+
   (t.activa?'<button type="button" data-quitar-roja="'+Number(t.id)+'">Quitar tarjeta</button>':
   '<small>Retirada con justificación registrada</small>')+'</div>'
  ).join(''):'<p>Sin tarjetas rojas para esta vivienda.</p>';
  if(!dialog.open)dialog.showModal();
 }
 $('segCuotasRows').addEventListener('click',e=>{
  const button=e.target.closest('[data-red-manage]');
  if(!button||busy)return;
  button.disabled=true;
  mostrar(button.dataset.redManage).catch(error=>$('segCuotasStatus').textContent=error.message)
   .finally(()=>{button.disabled=false});
 });
 $('segRedClose').addEventListener('click',()=>dialog.close());
 $('segRedAddForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!seleccion)return;
  const motivo=$('segRedReason').value.trim();if(motivo.length<5)return;
  const id=seleccion.casaId;busy=true;
  try{
   await api('/casas/'+id,'POST',{motivo});
   $('segRedReason').value='';
   await actualizar();await mostrar(id);
  }catch(error){$('segRedStatus').textContent=error.message}
  finally{busy=false}
 });
 $('segRedCards').addEventListener('click',async e=>{
  const button=e.target.closest('[data-quitar-roja]');if(!button||busy||!seleccion)return;
  const motivoRetiro=prompt('Motivo para retirar la tarjeta (mínimo 5 caracteres):');
  if(motivoRetiro===null)return;
  if(motivoRetiro.trim().length<5){$('segRedStatus').textContent='Escribe por qué se retira la tarjeta.';return}
  const id=seleccion.casaId;busy=true;
  try{
   await api('/'+button.dataset.quitarRoja+'/retirar','PATCH',{motivoRetiro:motivoRetiro.trim()});
   await actualizar();await mostrar(id);
  }catch(error){$('segRedStatus').textContent=error.message}
  finally{busy=false}
 });
 window.MJSeguridadRojas={contar,actualizarCeldas,actualizar};
 actualizar().catch(error=>$('segCuotasStatus').textContent='Tarjetas rojas: '+error.message);
})();
