(async()=>{
 const $=id=>document.getElementById(id),base='https://api-misionjardines.listoenlinea.host/api';
 const invitation=location.hash.slice(1)||sessionStorage.getItem('mjInvitacion');
 if(invitation)sessionStorage.setItem('mjInvitacion',invitation);
 const message=t=>{$('message').textContent=t;$('message').hidden=false;};
 let correo='';const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
 async function api(path,body,auth=false){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.message||'No fue posible completar la solicitud');return d;}
 try{const d=await api('/viviendas/invitacion/'+encodeURIComponent(invitation||''));$('house').textContent=d.casa.calle+' '+d.casa.numero+' · '+d.tipo;$('options').hidden=false;$('accept').hidden=!token;}catch(e){$('house').textContent='No fue posible abrir la invitación.';message(e.message);return;}
 $('accept').onclick=async()=>{try{await api('/viviendas/invitaciones/aceptar',{token:invitation},true);sessionStorage.removeItem('mjInvitacion');sessionStorage.removeItem('mjCasaSeleccionada');location.replace('viviendas.html');}catch(e){message(e.message);}};
 $('register').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const body=Object.fromEntries(new FormData(e.target));correo=body.correo;const d=await api('/auth/registro/solicitar',{...body,invitacion:invitation});message(d.message);$('verify').hidden=false;}catch(e){message(e.message);}finally{e.submitter.disabled=false;}};
 $('verify').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const d=await api('/auth/registro/verificar',{correo,codigo:new FormData(e.target).get('codigo')});message(d.message);sessionStorage.removeItem('mjInvitacion');history.replaceState(null,'','invitacion.html');$('options').hidden=true;}catch(e){message(e.message);}finally{e.submitter.disabled=false;}};
})();
