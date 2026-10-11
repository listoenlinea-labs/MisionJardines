(() => {
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const API=(window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api').replace(/\/$/,'');
 const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
 const tipo=$('sheetsTipo'),view=$('sheetsPreview'),stage=$('sheetsStage'),note=$('sheetsStatus');
 if(!tipo||!token)return;
 let validPreview=null,requestId=0;
 function reset(){stage.disabled=true;validPreview=null;$('sheetsPreviewScroll').hidden=true;}
 async function call(path,options={}){
   const response=await fetch(API+'/google-sheets/'+path,{
     ...options,cache:'no-store',headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})}
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok)throw Error(data.message||'No fue posible consultar Google Sheets');
   return data;
 }
 tipo.addEventListener('change',()=>{reset();note.textContent='Selecciona Consultar hoja para ver los registros.'});
 view.addEventListener('click',async()=>{
   const req=++requestId;reset();view.disabled=true;note.textContent='Consultando Google Sheets…';
   try{
     const data=await call('preview?tipo='+encodeURIComponent(tipo.value));
     if(req!==requestId)return;
     validPreview=tipo.value;stage.disabled=data.total===0;
     $('sheetsHead').innerHTML='<tr><th>Fila</th>'+data.encabezados.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr>';
     $('sheetsRows').innerHTML=data.filas.map(x=>'<tr><td>'+x.fila+'</td>'+x.valores.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('');
     $('sheetsPreviewScroll').hidden=!data.filas.length;
     note.textContent=data.total+' registros encontrados. Vista previa de hasta 20 filas. No son pagos validados.';
   }catch(e){note.textContent=e.message;}finally{view.disabled=false;}
 });
 stage.addEventListener('click',async()=>{
   if(validPreview!==tipo.value)return;
   if(!confirm('¿Guardar las filas como históricos pendientes de revisión? NO se registrarán pagos ni egresos contables automáticamente.'))return;
   stage.disabled=true;note.textContent='Preparando históricos…';
   try{
     const d=await call('preparar-historico',{method:'POST',body:JSON.stringify({tipo:tipo.value,confirmar:'IMPORTAR_A_REVISION'})});
     note.textContent=d.message+' Nuevos: '+d.nuevos+'. Existentes: '+d.existentes+'. Cambiados para revisar manualmente: '+d.conflictos+'.';
   }catch(e){note.textContent=e.message;}finally{reset();}
 });
})();
