(() => {
  const el=id=>document.getElementById(id);
  const status=el('segCuotasStatus');
  if(!status)return;
  const API=(window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api').replace(/\/$/,'');
  const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
  let pagina=1,paginas=1,lastRequest=0;
  const mobileQuery=window.matchMedia('(max-width: 720px)');
  const limiteActual=()=>mobileQuery.matches?3:10;
  const esc=x=>String(x??'').replace(/[&<>"']/g,v=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[v]));
  async function refresh(){
    const current=++lastRequest;
    status.textContent='Consultando estado de cuotas…';
    const qs=new URLSearchParams({pagina:String(pagina),limite:String(limiteActual()),calle:el('segCuotasCalle').value,numero:el('segCuotasNumero').value,estado:el('segCuotasEstado').value});
    try{
      const response=await fetch(API+'/seguridad-cuotas/cuotas-viviendas?'+qs,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      const json=await response.json().catch(()=>({}));
      if(current!==lastRequest)return;
      if(!response.ok||!json.ok)throw Error(json.message||'No fue posible consultar el padrón');
      paginas=Number(json.paginas||1);pagina=Number(json.pagina||1);
      el('segCuotasRows').innerHTML=json.viviendas.length?json.viviendas.map(v=>{
        const name=v.estado==='AL_CORRIENTE'?'Al corriente':v.estado==='DEUDOR'?'Deudor':'Sin historial';
        const pill=v.estado==='AL_CORRIENTE'?'paid':v.estado==='DEUDOR'?'due':'unknown';
        const id=Number(v.casaId);
        return '<tr><td data-label="Calle">'+esc(v.calle)+'</td><td data-label="Casa">'+esc(v.numero)+'</td><td data-label="Estado"><span class="seg-cuotas-pill '+pill+'">'+name+'</span></td><td data-label="Último pago">'+esc(v.ultimaFechaPago||'Sin fecha')+'</td><td data-label="Mes pagado">'+esc(v.ultimoMesPagado||'Sin registro')+'</td>'+
          '<td data-label="Tarjetas rojas" data-red-count-id="'+id+'">'+(window.MJSeguridadRojas?.contar(id)??'…')+'</td>'+
          '<td data-label="Acciones"><button type="button" class="seg-red-button" data-red-manage="'+id+'" '+(!id?'disabled':'')+'>Poner / quitar</button></td></tr>';
      }).join(''):'<tr><td colspan="7">No hay viviendas con estos filtros.</td></tr>';
      window.MJSeguridadRojas?.actualizarCeldas();
      status.textContent=String(json.total)+' viviendas · '+json.periodo+' · '+String(json.limite||limiteActual())+' por página';
      el('segCuotasPage').textContent='Página '+pagina+' de '+paginas;
      el('segCuotasPrev').disabled=pagina<=1;
      el('segCuotasNext').disabled=pagina>=paginas;
    }catch(e){if(current!==lastRequest)return;status.textContent=e.message;el('segCuotasRows').innerHTML='';
      el('segCuotasPage').textContent='';el('segCuotasPrev').disabled=true;el('segCuotasNext').disabled=true;}
  }
  let debounce;
  ['segCuotasCalle','segCuotasNumero'].forEach(id=>el(id).addEventListener('input',()=>{pagina=1;clearTimeout(debounce);debounce=setTimeout(refresh,250)}));
  el('segCuotasEstado').addEventListener('change',()=>{pagina=1;refresh()});
  el('segCuotasRefresh').addEventListener('click',refresh);
  el('segCuotasPrev').addEventListener('click',()=>{if(pagina>1){pagina--;refresh()}});
  el('segCuotasNext').addEventListener('click',()=>{if(pagina<paginas){pagina++;refresh()}});
  // Cambio de ancho, rotación o vista de escritorio: nueva cantidad y página 1.
  const cambioVista=()=>{pagina=1;refresh()};
  if(typeof mobileQuery.addEventListener==='function')mobileQuery.addEventListener('change',cambioVista);
  else if(typeof mobileQuery.addListener==='function')mobileQuery.addListener(cambioVista);
  refresh();
})();
