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
 const editor=$('noticeDescription');
 const richPrefix='<!--mj-rich-v1-->';
 const allowedTags=new Set(['P','DIV','BR','STRONG','B','EM','I','U','UL','OL','LI','FONT','SPAN']);
 const colorAllowed=value=>/^#[0-9a-f]{6}$/i.test(value)||/^rgb\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}\s*\)$/i.test(value);
 let savedRange=null;
 function cleanRich(html){
  const doc=new DOMParser().parseFromString('<div>'+String(html||'')+'</div>','text/html');
  const root=doc.body.firstElementChild;
  function clean(node){
   if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.textContent);
   if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
   const fragment=document.createDocumentFragment();
   if(['SCRIPT','STYLE','SVG','IFRAME','OBJECT','TEMPLATE','NOSCRIPT'].includes(node.tagName))return fragment;
   if(!allowedTags.has(node.tagName)){
    for(const child of [...node.childNodes])fragment.append(clean(child));
    return fragment;
   }
   const el=document.createElement(node.tagName.toLowerCase());
   if(node.tagName==='FONT'){
    const size=node.getAttribute('size');
    if(['2','3','4','5','6'].includes(size))el.setAttribute('size',size);
    const color=node.getAttribute('color');
    if(color&&colorAllowed(color))el.setAttribute('color',color);
   }
   if(node.tagName==='SPAN'){
    const color=node.style?.color||'';
    if(color&&colorAllowed(color))el.style.color=color;
    const fontSize=node.style?.fontSize||'';
    if(/^(?:12|13|14|15|16|18|20|22|24|28|32)px$/.test(fontSize)||['small','medium','large','x-large','xx-large'].includes(fontSize))el.style.fontSize=fontSize;
    const weight=node.style?.fontWeight||'';
    if(['bold','600','700'].includes(weight))el.style.fontWeight=weight;
    if(node.style?.fontStyle==='italic')el.style.fontStyle='italic';
    if(node.style?.textDecorationLine==='underline')el.style.textDecoration='underline';
   }
   for(const child of [...node.childNodes])el.append(clean(child));
   return el;
  }
  const output=document.createElement('div');
  for(const child of [...root.childNodes])output.append(clean(child));
  return output.innerHTML;
 }
 function plainText(html){
  const doc=new DOMParser().parseFromString(String(html||''),'text/html');
  const parts=[];
  function walk(node){
   if(node.nodeType===Node.TEXT_NODE){parts.push(node.textContent);return;}
   if(node.nodeType!==Node.ELEMENT_NODE)return;
   if(node.tagName==='BR'){parts.push(' ');return;}
   for(const child of node.childNodes)walk(child);
   if(['P','DIV','LI','UL','OL'].includes(node.tagName))parts.push(' ');
  }
  walk(doc.body);
  return parts.join('').replace(/\s+/g,' ').trim();
 }
 function showFull(a){
  const full=String(a.full||''),target=$('detailFull');
  // Los avisos anteriores son texto plano; no debemos interpretar su contenido como HTML.
  if(!full.startsWith(richPrefix)){
   target.textContent=full;target.style.whiteSpace='pre-wrap';return;
  }
  target.innerHTML=cleanRich(full.slice(richPrefix.length));
  target.style.whiteSpace='normal';
 }
 function characterCount(){return (editor.innerText||editor.textContent||'').trim().length;}
 function updateCount(){
  const count=characterCount(),label=$('editorCount');
  label.textContent=count+' / 4000 caracteres';
  label.style.color=count>4000?'#b42332':'';
 }
 function rememberSelection(){
  const selection=window.getSelection?.();
  if(!selection||!selection.rangeCount)return;
  const range=selection.getRangeAt(0);
  if(editor.contains(range.commonAncestorContainer))savedRange=range.cloneRange();
 }
 function restoreSelection(){
  editor.focus({preventScroll:true});
  const selection=window.getSelection?.();
  if(!selection)return;
  let range=savedRange;
  if(!range||!editor.contains(range.commonAncestorContainer)){
   range=document.createRange();range.selectNodeContents(editor);range.collapse(false);
  }
  selection.removeAllRanges();selection.addRange(range);
 }
 function syncToolbar(){
  document.querySelectorAll('.tool-btn[aria-pressed]').forEach(button=>{
   let active=false;
   try{active=Boolean(document.queryCommandState(button.dataset.command));}catch(_error){}
   button.classList.toggle('is-active',active);
   button.setAttribute('aria-pressed',String(active));
  });
 }
 function applyFormat(command,value=null){
  restoreSelection();
  // Evita que el navegador inserte CSS arbitrario que luego se perdería al sanear.
  try{document.execCommand('styleWithCSS',false,false);}catch(_error){}
  document.execCommand(command,false,value);
  rememberSelection();updateCount();syncToolbar();
 }
 editor.addEventListener('input',()=>{rememberSelection();updateCount();syncToolbar();});
 editor.addEventListener('mouseup',()=>{rememberSelection();syncToolbar();});
 editor.addEventListener('keyup',()=>{rememberSelection();syncToolbar();});
 document.addEventListener('selectionchange',rememberSelection);
 // Al pegar, el HTML externo se descarta para evitar formatos no permitidos.
 editor.addEventListener('paste',event=>{
  event.preventDefault();
  const content=event.clipboardData?.getData('text/plain')||'';
  editor.focus();
  if(!document.execCommand('insertText',false,content)){
   const selection=window.getSelection?.();
   if(selection?.rangeCount){
    const range=selection.getRangeAt(0);
    range.deleteContents();range.insertNode(document.createTextNode(content));
    range.collapse(false);selection.removeAllRanges();selection.addRange(range);
   }
  }
  rememberSelection();updateCount();
 });
 document.querySelectorAll('[data-command]').forEach(button=>{
  button.addEventListener('pointerdown',rememberSelection);
  button.addEventListener('mousedown',event=>event.preventDefault());
  button.addEventListener('click',()=>applyFormat(button.dataset.command));
 });
 document.querySelectorAll('[data-color]').forEach(button=>{
  button.addEventListener('pointerdown',rememberSelection);
  button.addEventListener('mousedown',event=>event.preventDefault());
  button.addEventListener('click',()=>{
   applyFormat('foreColor',button.dataset.color);
   document.querySelectorAll('[data-color]').forEach(swatch=>swatch.classList.toggle('is-active',swatch===button));
  });
 });
 $('editorFontSize').addEventListener('pointerdown',rememberSelection);
 $('editorFontSize').addEventListener('change',event=>applyFormat('fontSize',event.target.value));
 $('editorTextColor').addEventListener('pointerdown',rememberSelection);
 $('editorTextColor').addEventListener('change',event=>{
  applyFormat('foreColor',event.target.value);
  document.querySelectorAll('[data-color]').forEach(swatch=>swatch.classList.remove('is-active'));
 });
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
  $('detailTitle').textContent=a.title;
  const repeated=String(a.full||'').startsWith(richPrefix);
  $('detailBrief').hidden=repeated||!String(a.brief||'').trim();
  $('detailBrief').textContent=a.brief||'';
  showFull(a);$('detailPublished').textContent=fmt(a.createdAt);
  $('detailExpires').textContent=fmt(a.expiresAt);
  $('removeNotice').hidden=!admin;$('removeNotice').onclick=()=>remove(a.id);
  $('detailModal').hidden=false;
 }
 async function remove(id){
  if(!admin||working||!confirm('¿Eliminar este aviso del tablón? Esta acción no se puede deshacer.'))return;
  working=true;$('removeNotice').disabled=true;
  try{await request('/'+encodeURIComponent(id),{method:'DELETE'});$('detailModal').hidden=true;await load();toast('Aviso eliminado correctamente.');}catch(e){toast(e.message);}
  finally{working=false;$('removeNotice').disabled=false;}
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
  const title=$('noticeTitle').value.trim(),rich=cleanRich(editor.innerHTML),content=plainText(rich),brief=content.slice(0,300),full=richPrefix+rich;
  if(!title||!content)return toast('Título y texto del aviso son obligatorios.');
  if(content.length>4000)return toast('El aviso debe tener máximo 4000 caracteres.');
  if(full.length>20000)return toast('Demasiados estilos aplicados. Simplifica el formato del aviso.');
  working=true;$('publishNotice').disabled=true;
  try{
   await request('/',{method:'POST',body:JSON.stringify({title,brief,full,image:selectedImage,duration:Number($('noticeDuration').value)})});
   $('noticeForm').reset();editor.replaceChildren();savedRange=null;updateCount();syncToolbar();selectedImage='';$('imagePreview').textContent='Imagen opcional';
   $('createModal').hidden=true;await load();toast('Aviso publicado para la comunidad.');
  }catch(e){toast(e.message);}finally{working=false;$('publishNotice').disabled=false;}
 });
 window.addEventListener('mj:shell-activated',event=>{
  if(event.detail?.fromCache)void load().catch(error=>toast('No se pudieron actualizar los avisos: '+error.message));
 });
 (async()=>{try{await profile();await load();}catch(e){$('emptyState').hidden=false;$('emptyState').textContent='No se pudieron cargar los avisos: '+e.message;toast(e.message);}})();
})();
