'use strict';
// Rescate específico de la foto destacada de la NOTA original de Tráfico ZMG.
// Sin búsqueda de fotos por palabras clave ni sustitución por otras noticias.
function esDominioZmg(host) {
  return /^(?:[a-z0-9-]+\.)*traficozmg\.com$/i.test(String(host||''));
}
function esImagenZmg(value) {
  try{
    const u=new URL(value);
    return u.protocol==='https:'&&!u.username&&!u.password&&
      (esDominioZmg(u.hostname) ||
       (/^i[0-3]\.wp\.com$/i.test(u.hostname)&&
        decodeURIComponent(u.pathname).startsWith('/traficozmg.com/wp-content/uploads/')));
  }catch{return false;}
}
function esArticuloZmg(value) {
  try {const u=new URL(value);return u.protocol==='https:'&&esDominioZmg(u.hostname)&&!u.username&&!u.password;}
  catch{return false;}
}
function normalizarImagen(value,articuloUrl) {
  try {
    const u=new URL(String(value||'').trim().replaceAll('&amp;','&'),articuloUrl);
    return u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=2048?u.href:null;
  }catch{return null;}
}
function imagenDesdeMetadatos(html,articuloUrl) {
  for(const tag of String(html||'').match(/<meta\b[^>]{0,1000}>/gi)||[]) {
    const attrs={};
    for(const m of tag.matchAll(/\b([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
      attrs[m[1].toLowerCase()]=m[2]??m[3];
    const key=(attrs.property||attrs.name||'').toLowerCase();
    if(!['og:image','og:image:secure_url','twitter:image','twitter:image:src'].includes(key))continue;
    const image=normalizarImagen(attrs.content,articuloUrl);
    if(image)return image;
  }
  return null;
}
async function descargarHtmlZmg(url,{fetchImpl=fetch,timeoutMs=3500}={}) {
  if(!esArticuloZmg(url))return null;
  let actual=url;
  for(let redirect=0;redirect<3;redirect++){
    const response=await fetchImpl(actual,{
      headers:{'User-Agent':'Mozilla/5.0 (compatible; MisionJardinesNews/1.0)','Accept':'text/html'},
      redirect:'manual',signal:AbortSignal.timeout(timeoutMs)
    });
    if(response.status>=300&&response.status<400){
      const next=new URL(response.headers.get('location')||'',actual).href;
      if(!esArticuloZmg(next))return null;
      actual=next;continue;
    }
    if(!response.ok||!String(response.headers.get('content-type')||'').includes('text/html'))return null;
    if(Number(response.headers.get('content-length')||0)>450000)return null;
    // Interesa solo el encabezado HTML: cortar descarga antes de 450 KB.
    let bytes=0;
    const chunks=[];
    if(response.body?.getReader){
      const reader=response.body.getReader();
      try{
        while(bytes<450000){
          const {value,done}=await reader.read();
          if(done)break;
          const chunk=Buffer.from(value);
          const slice=chunk.subarray(0,450000-bytes);
          chunks.push(slice);
          bytes+=slice.length;
        }
      }finally{await reader.cancel().catch(()=>{});}
    }else{
      chunks.push(Buffer.from(await response.arrayBuffer()).subarray(0,450000));
    }
    return imagenDesdeMetadatos(Buffer.concat(chunks).toString('utf8'),actual);
  }
  return null;
}
module.exports={esDominioZmg,esImagenZmg,esArticuloZmg,normalizarImagen,imagenDesdeMetadatos,descargarHtmlZmg};
