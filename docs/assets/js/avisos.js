(() => {
 'use strict';
 const API=(window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api')+'/avisos';
 const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
 if(!token){location.replace('login.html');return;}
 const $=id=>document.getElementById(id);
 const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
 const fmt=value=>value?(window.MJDateDisplay?.format(value)||new Date(value).toLocaleDateString('es-MX')):'—';
 const toast=message=>{const e=$('toast');e.textContent=message;e.style.display='block';clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>e.style.display='none',4000);};
 let items=[],admin=false,selectedImage='',working=false;
 async function request(path,options={}){
  const res=await fetch(API+path,{...options,cache:'no-store',headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})}});
  const result=await res.json().catch(()=>({}));
  if(!res.ok||!result.ok)throw Error(result.message||'No fue posible completar la operación.');
  return result;
 }
 function render(){
  const box=$('boardGrid');box.replaceChildren();
  $('emptyState').hidden=items.length>0;box.hidden=items.length===0;
  for(const a of items){
   const article=document.createElement('article');
   article.className='ad-card';article.tabIndex=0;article.setAttribute('role','button');
   const open=()=>detail(a.id);
   article.addEventListener('click',open);
   article.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
   article.innerHTML='<span class="pin"></span><div class="ad-title">'+esc(a.title)+'</div>'+
    '<div class="ad-image">'+(a.image?'<img src="'+esc(a.image)+'" alt="Imagen del aviso">':'<div class="image-placeholder">📢</div>')+'</div>'+
    '<div class="ad-body"><p class="ad-desc">'+esc(a.brief||'Consulta los detalles del aviso oficial.')+'</p>'+
    '<div class="ad-meta"><span>Publicado por <strong>Administración</strong></span><span>Hasta <strong>'+esc(fmt(a.expiresAt))+'</strong></span></div></div>';
   box.append(article);
  }
 }
 function detail(id){
  const a=items.find(row=>String(row.id)===String(id));if(!a)return;
  $('detailImage').innerHTML=a.image?'<img src="'+esc(a.image)+'" alt="Imagen del aviso">':'<div class="image-placeholder">📢</div>';
  $('detailTitle').textContent=a.title;$('detailBrief').textContent=a.brief||'Comunicado oficial';
  $('detailFull').textContent=a.full;$('detailPublished').textContent=fmt(a.createdAt);
  $('detailExpires').textContent=fmt(a.expiresAt);
  $('removeNotice').hidden=!admin;$('removeNotice').onclick=()=>remove(a.id);
  $('detailModal').hidden=false;
 }
 async function remove(id){
  if(!admin||!confirm('¿Retirar este aviso del tablón oficial?'))return;
  try{await request('/'+encodeURIComponent(id),{method:'DELETE'});$('detailModal').hidden=true;await load();toast('Aviso retirado.');}catch(e){toast(e.message);}
 }
 async function load(){
  const data=await request('/');items=data.data||[];render();
 }
 async function profile(){
  const r=await fetch((window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api')+'/auth/perfil',
   {headers:{Authorization:'Bearer '+token},cache:'no-store'});
  const result=await r.json();
  if(!r.ok||!result.ok)throw Error('La sesión ya no está disponible.');
  const rol=typeof result.usuario?.rol==='string'?result.usuario.rol:result.usuario?.rol?.nombre;
  admin=['SUPER_ADMIN','ADMINISTRADOR'].includes(rol);
  $('newNotice').hidden=!admin;
  $('publicInfo').textContent=admin?'Puedes publicar avisos oficiales para toda la comunidad.':'Comunicados de Administración · Solo lectura, sin comentarios ni respuestas.';
 }
 $('newNotice').addEventListener('click',()=>{if(!admin||working)return;$('createModal').hidden=false;$('noticeTitle').focus();});
 $('closeCreate').addEventListener('click',()=>$('createModal').hidden=true);
 $('cancelCreate').addEventListener('click',()=>$('createModal').hidden=true);
 $('closeDetail').addEventListener('click',()=>$('detailModal').hidden=true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){$('createModal').hidden=true;$('detailModal').hidden=true;}});
 $('noticeImage').addEventListener('change',event=>{
  selectedImage='';
  const file=event.target.files?.[0];
  if(!file){$('imagePreview').textContent='Imagen opcional';return;}
  if(file.size>700*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){
   event.target.value='';return toast('Imagen PNG, JPG o WebP de máximo 700 KB.');
  }
  const reader=new FileReader();reader.onload=()=>{selectedImage=String(reader.result||'');
   const img=document.createElement('img');img.src=selectedImage;img.alt='Vista previa';
   $('imagePreview').replaceChildren(img);
  };reader.readAsDataURL(file);
 });
 $('publishNotice').addEventListener('click',async()=>{
  if(!admin||working)return;
  const title=$('noticeTitle').value.trim(),brief=$('noticeBrief').value.trim(),full=$('noticeFull').value.trim();
  if(!title||!full)return toast('Título y contenido son obligatorios.');
  working=true;$('publishNotice').disabled=true;
  try{
   await request('/',{method:'POST',body:JSON.stringify({title,brief,full,image:selectedImage,duration:Number($('noticeDuration').value)})});
   $('noticeForm').reset();selectedImage='';$('imagePreview').textContent='Imagen opcional';
   $('createModal').hidden=true;await load();toast('Aviso publicado para la comunidad.');
  }catch(e){toast(e.message);}finally{working=false;$('publishNotice').disabled=false;}
 });
 window.addEventListener('mj:shell-activated',event=>{
  if(event.detail?.fromCache)void load().catch(error=>toast('No se pudieron actualizar los avisos: '+error.message));
 });
 (async()=>{try{await profile();await load();}catch(e){$('emptyState').hidden=false;$('emptyState').textContent='No se pudieron cargar los avisos: '+e.message;toast(e.message);}})();
})();
