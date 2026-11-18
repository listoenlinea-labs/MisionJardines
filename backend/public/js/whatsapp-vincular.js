'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const token=/^#clave=([a-f0-9]{64})$/.exec(window.location.hash)?.[1]||'';
 history.replaceState(null,'',location.pathname);
 let jwt='';
 const say=txt=>{$('message').textContent=txt;};
 if(!token){say('Este enlace no es válido. Pide otro desde el bot.');$('login').hidden=true;return;}
 async function json(url,options={}){
  const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw Error(data.message||'No fue posible completar la operación');
  return data;
 }
 $('login').addEventListener('submit',async e=>{
  e.preventDefault();$('entrar').disabled=true;say('Verificando cuenta…');
  try{
   const result=await json('/api/auth/login',{method:'POST',body:JSON.stringify({
    correo:$('correo').value.trim().toLowerCase(),contrasena:$('password').value,recordarme:false
   })});
   $('password').value='';jwt=result.token;
   const viviendas=await json('/api/viviendas/mias',{headers:{Authorization:'Bearer '+jwt}});
   const opciones=(viviendas.viviendas||[]).filter(x=>x.activo&&x.casa);
   if(!opciones.length)throw Error('Tu usuario no tiene viviendas activas vinculadas');
   const select=$('casa');select.replaceChildren();
   for(const v of opciones){const item=document.createElement('option');
    item.value=String(v.casaId);item.textContent=(v.casa.calleCorrecta||v.casa.calle)+' '+v.casa.numero;
    select.appendChild(item);
   }
   $('login').hidden=true;$('vivienda').hidden=false;say('Selecciona tu vivienda para continuar.');
  }catch(error){say(error.message);$('entrar').disabled=false;}
 });
 $('vivienda').addEventListener('submit',async e=>{
  e.preventDefault();$('vincular').disabled=true;say('Vinculando vivienda…');
  try{
   await json('/api/auth/whatsapp-bot/confirmar',{method:'POST',headers:{Authorization:'Bearer '+jwt},
    body:JSON.stringify({token,casaId:Number($('casa').value)})});
   jwt='';$('vivienda').hidden=true;say('✅ Cuenta vinculada. Vuelve a WhatsApp y escribe CONTINUAR.');
  }catch(error){say(error.message);$('vincular').disabled=false;}
 });
})();