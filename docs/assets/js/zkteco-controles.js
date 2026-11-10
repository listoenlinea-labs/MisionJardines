(function(){
'use strict';
// Módulo independiente: no llama a la API /zkteco ni cambia pagos.
const $=id=>document.getElementById(id);
const API='https://api-misionjardines.listoenlinea.host/api/controles-remotos';
const escape=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const targets={SIN_ASIGNAR:'Sin asignar',PORTON_1_ENTRADA:'Portón 1 · Entrada',PORTON_1_SALIDA:'Portón 1 · Salida',PORTON_2_ENTRADA:'Portón 2 · Entrada',PORTON_2_SALIDA:'Portón 2 · Salida',ACCESO_PEATONAL:'Acceso peatonal'};
let rows=[],filtered=[],page=1,editing=null,validityHouse=null,loaded=false,opened=new Set();
const size=8;
function notify(s){$('remotePageStatus').textContent=s;try{window.toast?.(s,6500)}catch(_){}}
function err(id,e){$(id).textContent=String(e?.message||e);$(id).classList.add('show')}
function clear(id){$(id).textContent='';$(id).classList.remove('show')}
function auth(){return localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken')||''}
async function request(path,opt={}){
 const r=await fetch(API+path,{...opt,cache:'no-store',headers:{Authorization:'Bearer '+auth(),...(opt.body?{'Content-Type':'application/json'}:{})}});
 const data=await r.json().catch(()=>({}));
 if(!r.ok||!data.ok)throw Error(data.message||'No fue posible acceder a los controles');
 return data;
}
const label=c=>[c.calleCorrecta||c.calle,c.numero].filter(Boolean).join(' ');
function active(c){if(!c.activo)return false;return !(c.fechaFin&&String(c.fechaFin).slice(0,10)<new Date().toISOString().slice(0,10))}
function allControls(){return rows.flatMap(c=>c.controles||[])}
function details(casa){
 if(!(casa.controles||[]).length)return '<div class="tag-panel"><div class="empty">Esta vivienda tiene 0 controles registrados.</div></div>';
 return '<div class="tag-panel"><div class="tag-list">'+casa.controles.map(c=>{
  const on=active(c),buttons=['A','B','C','D'].map(k=>k+': '+(targets[c.botones?.[k]]||'Sin asignar')).join(' · ');
  return '<div class="remote-detail"><div class="remote-code">'+escape(c.codigo)+'<div class="tag-meta">'+escape(c.descripcion||'Control PO')+'</div></div>'+
   '<div><span class="status '+(on?'on':'off')+'"><i class="dot"></i>'+(on?'Activo':c.activo?'Vencido':'Bloqueado')+'</span><div class="tag-meta">Solo inventario</div></div>'+
   '<div class="remote-buttons-text">'+escape(buttons)+'</div><div><strong>'+escape(c.fechaFin?String(c.fechaFin).slice(0,10):'Sin límite')+'</strong><div class="tag-meta">Vigencia</div></div>'+
   '<div class="remote-detail-actions"><button class="btn mini" data-act="edit" data-id="'+c.id+'">Editar</button>'+
   '<button class="btn mini '+(c.activo?'danger':'primary')+'" data-act="block" data-id="'+c.id+'">'+(c.activo?'Bloquear':'Activar')+'</button>'+
   '<button class="btn mini ghost-danger" data-act="delete" data-id="'+c.id+'">Eliminar</button></div></div>';
 }).join('')+'</div></div>';
}
function render(){
 const count=filtered.length,pages=Math.max(1,Math.ceil(count/size));page=Math.max(1,Math.min(page,pages));
 const controls=filtered.flatMap(c=>c.controles||[]);
 $('remoteHouses').textContent=count;$('remoteEnabled').textContent=controls.filter(active).length;
 $('remoteBlocked').textContent=controls.filter(c=>!active(c)).length;
 $('remoteRows').innerHTML=filtered.slice((page-1)*size,page*size).map(c=>{
 const cs=c.controles||[],on=cs.some(active),off=cs.length&&!cs.some(x=>x.activo),expanded=opened.has(Number(c.id));
 const last=cs.map(x=>x.updatedAt).filter(Boolean).sort().at(-1);
 return '<article class="house-card"><div class="house-top"><div class="house-address"><strong>'+escape(label(c))+'</strong><span>'+
 cs.length+' '+(cs.length===1?'control':'controles')+' asociados</span></div>'+
 '<div class="house-cell house-state"><span class="mobile-label">Estado</span><span class="status '+(!cs.length?'none':on?'on':'off')+
 '"><i class="dot"></i>'+(!cs.length?'Sin controles':on?'Habilitada':'Bloqueada')+'</span></div>'+
 '<div class="house-cell house-last"><span class="mobile-label">Última modificación</span><b>'+escape(last?new Date(last).toLocaleString('es-MX'):'—')+'</b></div>'+
 '<div class="house-actions remote-house-actions"><span class="mobile-label">Acciones</span>'+
 '<button class="btn mini" data-act="validity" data-house="'+c.id+'">Editar vigencia</button>'+
 '<button class="btn mini" data-act="create" data-house="'+c.id+'">+ Control</button>'+
 '<button class="btn mini '+(off?'primary':'danger')+'" '+(!cs.length?'disabled':'')+' data-act="house-block" data-house="'+c.id+'">'+(off?'Activar todos':'Bloquear todos')+'</button></div></div>'+
 '<button class="tag-toggle" type="button" data-act="expand" data-house="'+c.id+'"><span>'+(expanded?'Ocultar controles':'Ver controles')+'</span><span>'+cs.length+' controles</span></button>'+
 '<div '+(expanded?'':'hidden')+'>'+details(c)+'</div></article>';
 }).join('')||'<div class="empty">No se encontraron viviendas.</div>';
 $('remotePageInfo').textContent='Página '+page+' de '+pages+' · '+count+' viviendas';
 let p=Array.from({length:Math.min(7,pages)},(_,i)=>(pages<=7?1:Math.max(1,Math.min(pages-6,page-3)))+i);
 $('remotePages').innerHTML='<button type="button" class="page-btn" data-page="'+(page-1)+'" '+(page<=1?'disabled':'')+'>Anterior</button>'+
 p.map(n=>'<button class="page-btn '+(n===page?'active':'')+'" data-page="'+n+'">'+n+'</button>').join('')+
 '<button type="button" class="page-btn" data-page="'+(page+1)+'" '+(page>=pages?'disabled':'')+'>Siguiente</button>';
}
function filter(reset=true){
 if(reset)page=1;
 const street=$('remoteStreet').value.trim().toLowerCase(),code=$('remoteCodeSearch').value.trim().toLowerCase();
 filtered=rows.filter(c=>(!street||label(c).toLowerCase().includes(street))&&(!code||(c.controles||[]).some(t=>t.codigo.toLowerCase().includes(code))));
 const coll=new Intl.Collator('es-MX',{numeric:true,sensitivity:'base'}),order=$('remoteOrder').value;
 filtered.sort((a,b)=>{
  if(order==='vivienda')return coll.compare(label(a),label(b));
  const last=c=>(c.controles||[]).map(t=>t.createdAt||'').sort().at(-1)||'';
  const cmp=coll.compare(last(a),last(b));
  return (order==='alta_asc'?cmp:-cmp)||coll.compare(label(a),label(b));
 });
 render();
}
async function refresh(){
 try{const data=await request('/viviendas');rows=data.data||[];loaded=true;filter(false);notify('Inventario actualizado · sin conexión PO1000');}
 catch(e){notify(e.message);if(!loaded)$('remoteRows').innerHTML='<div class="modal-error show">'+escape(e.message)+'</div>'}
}
async function reload(){const data=await request('/viviendas');rows=data.data||[];filter(false)}
const options=Object.entries(targets).map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join('');
for(const b of ['A','B','C','D'])$('remoteButton'+b).innerHTML=options;
function edit(casaId,id=null){
 const house=rows.find(c=>Number(c.id)===Number(casaId));if(!house)return;
 const control=id?house.controles.find(x=>Number(x.id)===Number(id)):null;editing=control?.id||null;
 $('remoteHouseModal').innerHTML=rows.map(c=>'<option value="'+c.id+'">'+escape(label(c))+'</option>').join('');
 $('remoteHouseModal').value=String(house.id);
 $('remoteModalTitle').textContent=control?'Editar control '+control.codigo:'Agregar control a '+label(house);
 $('remoteControlCode').value=control?.codigo||'';$('remoteDescription').value=control?.descripcion||'';
 $('remoteEndDate').value=control?.fechaFin?String(control.fechaFin).slice(0,10):'';
 for(const b of ['A','B','C','D'])$('remoteButton'+b).value=control?.botones?.[b]||'SIN_ASIGNAR';
 clear('remoteModalError');$('remoteEditModal').hidden=false;
}
function close(){$('remoteEditModal').hidden=true;editing=null}
async function save(){
 const house=Number($('remoteHouseModal').value);
 const body={casaId:house,codigo:$('remoteControlCode').value.trim(),descripcion:$('remoteDescription').value.trim(),
 fechaFin:$('remoteEndDate').value,botones:Object.fromEntries(['A','B','C','D'].map(b=>[b,$('remoteButton'+b).value]))};
 $('remoteSave').disabled=true;clear('remoteModalError');
 try{
  const result=await request(editing?'/controles/'+editing:'/viviendas/'+house+'/controles',{method:editing?'PATCH':'POST',body:JSON.stringify(body)});
  close();await reload();notify(result.message);
 }catch(e){err('remoteModalError',e)}finally{$('remoteSave').disabled=false}
}
function getControl(id){return allControls().find(c=>Number(c.id)===Number(id))}
async function toggleOne(id){
 const c=getControl(id);if(!c)return;const blocked=!!c.activo;
 if(!confirm((blocked?'Bloquear':'Activar')+' '+c.codigo+' SOLO en inventario?\\nEsto NO desactiva ni activa el PO1000.'))return;
 try{const r=await request('/controles/'+id+'/bloqueo',{method:'PATCH',body:JSON.stringify({bloqueado:blocked})});await reload();notify(r.message)}catch(e){notify(e.message)}
}
async function toggleHouse(id){
 const casa=rows.find(c=>Number(c.id)===Number(id));if(!casa)return;
 const blocked=!(casa.controles||[]).every(c=>!c.activo);
 if(!confirm((blocked?'Bloquear':'Activar')+' los controles de '+label(casa)+' SOLO en inventario?\\nNO modifica el PO1000.'))return;
 try{const r=await request('/viviendas/'+id+'/bloqueo',{method:'PATCH',body:JSON.stringify({bloqueado:blocked})});await reload();notify(r.message)}catch(e){notify(e.message)}
}
async function remove(id){
 const c=getControl(id);if(!c||!confirm('Eliminar registro '+c.codigo+'?\\nEl control seguirá en la memoria del PO1000.'))return;
 try{const r=await request('/controles/'+id,{method:'DELETE'});await reload();notify(r.message)}catch(e){notify(e.message)}
}
function validity(id){
 const c=rows.find(c=>Number(c.id)===Number(id));if(!c)return;validityHouse=id;
 $('remoteValidityTitle').textContent='Vigencia de '+label(c);
 const dates=[...new Set((c.controles||[]).map(x=>x.fechaFin).filter(Boolean))];
 $('remoteValidityEnd').value=dates.length===1?String(dates[0]).slice(0,10):'';
 clear('remoteValidityError');$('remoteValidityModal').hidden=false;
}
async function saveValidity(){
 $('remoteValiditySave').disabled=true;
 try{const r=await request('/viviendas/'+validityHouse+'/vigencia',{method:'PATCH',body:JSON.stringify({fechaFin:$('remoteValidityEnd').value})});
 $('remoteValidityModal').hidden=true;validityHouse=null;await reload();notify(r.message)}
 catch(e){err('remoteValidityError',e)}finally{$('remoteValiditySave').disabled=false}
}
async function logs(){
 $('remoteLogsModal').hidden=false;$('remoteLogsList').innerHTML='<div class="empty">Cargando historial…</div>';
 try{const r=await request('/logs');$('remoteLogsList').innerHTML=(r.data||[]).map(x=>'<div class="log-item"><div class="log-top"><span class="log-action">'+escape(x.accion)+'</span><span class="log-time">'+escape(new Date(x.createdAt).toLocaleString('es-MX'))+'</span></div><div class="tag-meta">Control #'+escape(x.controlId||'—')+' · Vivienda #'+escape(x.casaId||'—')+' · Usuario #'+escape(x.actorId||'—')+'</div></div>').join('')||'<div class="empty">Sin movimientos registrados.</div>'}
 catch(e){$('remoteLogsList').innerHTML='<div class="modal-error show">'+escape(e.message)+'</div>'}
}
function tab(tags){
 $('accessTagsPanel').hidden=!tags;$('accessRemotesPanel').hidden=tags;
 $('accessTabTags').setAttribute('aria-selected',String(tags));$('accessTabRemotes').setAttribute('aria-selected',String(!tags));
 if(!tags&&!loaded)void refresh();
}
$('accessTabTags').onclick=()=>tab(true);$('accessTabRemotes').onclick=()=>tab(false);
$('remoteSearch').onclick=()=>filter();
$('remoteClear').onclick=()=>{$('remoteStreet').value='';$('remoteCodeSearch').value='';$('remoteOrder').value='alta_desc';filter()};
$('remoteRefresh').onclick=refresh;$('remoteOrder').onchange=()=>filter();
for(const id of ['remoteStreet','remoteCodeSearch'])$(id).onkeydown=e=>{if(e.key==='Enter')filter()};
$('remotePages').onclick=e=>{const b=e.target.closest('button[data-page]');if(!b||b.disabled)return;page=Number(b.dataset.page);render()};
$('remoteRows').onclick=e=>{
 const b=e.target.closest('button[data-act]');if(!b)return;
 const id=Number(b.dataset.id),h=Number(b.dataset.house);
 switch(b.dataset.act){
 case 'expand': opened.has(h)?opened.delete(h):opened.add(h);render();break;
 case 'create':edit(h);break;
 case 'edit':{const casa=rows.find(c=>(c.controles||[]).some(x=>Number(x.id)===id));if(casa)edit(casa.id,id);break}
 case 'block':void toggleOne(id);break;
 case 'house-block':void toggleHouse(h);break;
 case 'delete':void remove(id);break;
 case 'validity':validity(h);break;
 }
};
$('remoteClose').onclick=$('remoteCancel').onclick=close;$('remoteSave').onclick=save;
$('remoteValidityClose').onclick=$('remoteValidityCancel').onclick=()=>{$('remoteValidityModal').hidden=true;validityHouse=null};
$('remoteValiditySave').onclick=saveValidity;
$('remoteLogs').onclick=logs;$('remoteLogsClose').onclick=()=>$('remoteLogsModal').hidden=true;
document.addEventListener('keydown',e=>{if(e.key==='Escape'){close();$('remoteValidityModal').hidden=true;$('remoteLogsModal').hidden=true}});
let role='';try{const u=JSON.parse(localStorage.getItem('misionJardinesUsuario')||sessionStorage.getItem('misionJardinesUsuario')||'{}');role=u?.rol?.nombre||u?.rol||''}catch(_){}
if(!['SUPER_ADMIN','ADMINISTRADOR','MESA_DIRECTIVA'].includes(role)){$('accessTabRemotes').hidden=true;$('accessRemotesPanel').hidden=true;}
else if(new URLSearchParams(location.search).get('tab')==='controles')tab(false);
})();