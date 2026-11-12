'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 if(!$('clubRojasRows'))return;
 const base=(window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api').replace(/\/$/,'')+'/casa-club/tarjetas-rojas';
 const token=()=>localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
 const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const date=x=>x?new Date(x).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short',year:'numeric'}):'—';
 let casas=[],historial=[],seleccion=null,busy=false;
 async function request(path,method='GET',body){
  const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+token(),
   ...(body?{'Content-Type':'application/json'}:{})},cache:'no-store',
   ...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok)throw Error(d.message||'No se completó la operación.');
  return d.data;
 }
 function pintarCasas(){
  const filtro=norm($('clubRojasSearch').value);
  const words=filtro.split(/\s+/).filter(Boolean);
  const data=casas.filter(h=>words.every(w=>norm([h.calle,h.numero,h.residente].join(' ')).includes(w)));
  data.sort((a,b)=>a.calle.localeCompare(b.calle,'es',{numeric:true})||
    String(a.numero).localeCompare(String(b.numero),'es',{numeric:true}));
  $('clubRojasSummary').textContent=data.length+' vivienda(s) encontradas.';
  $('clubRojasRows').innerHTML=data.length?data.map(h=>
   '<tr><td>'+escape(h.calle)+'</td><td>'+escape(h.numero)+'</td><td>'+escape(h.residente)+'</td>'+
   '<td><strong class="club-rojas-count">'+Number(h.tarjetasActivas||0)+'</strong></td>'+
   '<td>'+escape(date(h.ultimaTarjeta))+'</td>'+
   '<td><button type="button" class="soft" data-roja-casa="'+Number(h.id)+'">Asignar / retirar</button></td></tr>'
  ).join(''):'<tr><td colspan="6">No se encontraron viviendas.</td></tr>';
 }
 function pintarHistorial(){
  const words=norm($('clubRojasHistorySearch').value).split(/\s+/).filter(Boolean);
  const data=historial.filter(h=>words.every(w=>norm([h.calle,h.numero,h.residente].join(' ')).includes(w)));
  $('clubRojasHistorySummary').textContent=data.length+' movimiento(s) registrados.';
  $('clubRojasHistoryRows').innerHTML=data.length?data.map(h=>
   '<tr><td>'+escape(date(h.fecha))+'</td><td>'+escape(h.calle)+'</td><td>'+escape(h.numero)+'</td>'+
   '<td>'+escape(h.residente)+'</td><td><strong class="club-rojas-count">'+Number(h.tarjetasActivas||0)+'</strong></td>'+
   '<td>'+escape(h.tipo==='RETIRADA'?'Retirada':'Asignada')+'</td><td>'+escape(h.motivo||'—')+'</td>'+
   '<td>'+escape(h.usuarioId?'Usuario #'+h.usuarioId:'—')+'</td></tr>'
  ).join(''):'<tr><td colspan="8">No hay movimientos para esta búsqueda.</td></tr>';
 }
 async function actualizarCasas(){casas=await request('/viviendas');pintarCasas()}
 async function actualizarHistorial(){historial=await request('/historial');pintarHistorial()}
 const dialog=$('clubRojasManageDialog');
 async function abrirCasa(id){
  const data=await request('/casas/'+Number(id));
  seleccion=data;
  $('clubRojasManageTitle').textContent='Tarjetas · '+data.casa.calle+' '+data.casa.numero;
  $('clubRojasManageStatus').textContent=data.totalActivas+' tarjeta(s) activa(s) · '+(data.bloqueada?'Reserva suspendida':'Sin suspensión vigente');
  $('clubRojasManageCards').innerHTML=data.tarjetas.length?data.tarjetas.map(t=>
   '<div class="club-rojas-card-entry"><b>#'+Number(t.id)+' · '+(t.activa?'Activa':'Retirada')+'</b>'+
   '<p>'+escape(t.motivo)+'</p><small>Asignada: '+escape(date(t.asignadaEn))+'</small>'+
   (t.activa?'<button type="button" class="danger" data-roja-retirar="'+Number(t.id)+'">Quitar tarjeta</button>':
    '<small>Retirada: '+escape(date(t.retiradaEn))+'</small>')+'</div>'
  ).join(''):'<p>No hay tarjetas registradas para esta casa.</p>';
  if(!dialog.open)dialog.showModal();
 }
 $('clubRojasRows').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-roja-casa]');if(!btn)return;
  btn.disabled=true;
  try{await abrirCasa(btn.dataset.rojaCasa)}
  catch(error){$('clubRojasSummary').textContent=error.message}
  finally{btn.disabled=false}
 });
 $('clubRojasAddForm').addEventListener('submit',async e=>{
  e.preventDefault();if(busy||!seleccion)return;
  const motivo=$('clubRojasReason').value.trim();
  if(motivo.length<5)return;
  busy=true;
  try{
   await request('/casas/'+seleccion.casaId,'POST',{motivo});
   $('clubRojasReason').value='';
   await abrirCasa(seleccion.casaId);
   await Promise.all([actualizarCasas(),actualizarHistorial()]);
  }catch(error){$('clubRojasManageStatus').textContent=error.message}
  finally{busy=false}
 });
 $('clubRojasManageCards').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-roja-retirar]');
  if(!btn||busy)return;
  const motivoRetiro=prompt('Explica por qué debe retirarse esta tarjeta (al menos 5 caracteres):');
  if(motivoRetiro===null)return;
  if(motivoRetiro.trim().length<5){$('clubRojasManageStatus').textContent='El motivo del retiro debe tener al menos 5 caracteres.';return}
  busy=true;btn.disabled=true;
  try{
   await request('/'+btn.dataset.rojaRetirar+'/retirar','PATCH',{motivoRetiro:motivoRetiro.trim()});
   await abrirCasa(seleccion.casaId);
   await Promise.all([actualizarCasas(),actualizarHistorial()]);
  }catch(error){$('clubRojasManageStatus').textContent=error.message}
  finally{busy=false}
 });
 $('clubRojasManageClose').addEventListener('click',()=>dialog.close());
 $('clubRojasSearch').addEventListener('input',pintarCasas);
 $('clubRojasHistorySearch').addEventListener('input',pintarHistorial);
 $('clubRojasHistoryRefresh').addEventListener('click',()=>void actualizarHistorial().catch(e=>$('clubRojasHistorySummary').textContent=e.message));
 window.MJClubRojasAdmin={
  async mostrar(pestaña){
   try{
    if(pestaña==='tarjetas')await actualizarCasas();
    if(pestaña==='historial-rojas')await actualizarHistorial();
   }catch(error){$(pestaña==='tarjetas'?'clubRojasSummary':'clubRojasHistorySummary').textContent=error.message}
  }
 };
})();
