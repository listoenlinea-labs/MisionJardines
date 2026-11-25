(() => {
  'use strict';
  async function init() {
    if (!(await window.MJAccessReady) || !['ADMINISTRADOR','SUPER_ADMIN'].includes(window.MJVerifiedRole)) return;
    const root=document.querySelector('.dashboard');
    if(!root||document.getElementById('mjInfra'))return;
    const card=document.createElement('section');
    card.id='mjInfra';
    card.style.cssText='margin:16px auto;padding:20px;border:1px solid #dce3ec;border-radius:16px;background:white;color:#24334a;width:calc(100% - 32px);max-width:1440px;box-sizing:border-box;font:inherit';
    card.innerHTML='<h2 style="margin:0 0 6px;font-size:20px">Estado de infraestructura</h2><p style="margin:0 0 12px;color:#59677a">Recuperación remota de caseta · Solo administración</p><p id="mjInfraStatus" role="status">Consultando…</p><div id="mjInfraDetails" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px"></div><p id="mjInfraIp"></p><p id="mjInfraOrder" aria-live="polite"></p><div id="mjInfraButtons" style="display:flex;flex-wrap:wrap;gap:8px"></div><details style="margin-top:12px"><summary>Historial reciente</summary><div id="mjInfraHistory"></div></details>';
    root.before(card);
    const find=id=>card.querySelector('#'+id);
    const buttons=find('mjInfraButtons');
    const labels={DIAGNOSTICO:'Ejecutar diagnóstico',CONMUTADOR:'Recuperar conmutador',ZKTECO:'Reconectar ZKTeco',TODOS:'Recuperar todos los servicios'};
    const api=async(path,body)=>{
      const response=await fetch(window.MJ_API_URL+'/infraestructura/'+path,{cache:'no-store',headers:{Authorization:'Bearer '+window.MJ_TOKEN,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
      const json=await response.json();
      if(!response.ok||!json.ok)throw Error(json.error||json.message||'No se pudo consultar la infraestructura');
      return json;
    };
    let loading=false, online=false;
    const busy=()=>Array.from(buttons.children).forEach(b=>b.disabled=loading||!online);
    for(const [accion,label] of Object.entries(labels)){
      const button=document.createElement('button');button.type='button';button.textContent=label;
      button.style.cssText='border:1px solid #cad5e4;border-radius:9px;background:#f5f8fd;color:#233954;padding:10px 14px;font:inherit;cursor:pointer';
      button.onclick=async()=>{if(loading)return;loading=true;busy();try{await api('orden',{accion});find('mjInfraOrder').textContent='Orden enviada; esperando confirmación de caseta.';}catch(e){find('mjInfraOrder').textContent=e.message;}finally{loading=false;await refresh();}};
      buttons.append(button);
    }
    function item(label,value){
      const el=document.createElement('div');el.style.cssText='border:1px solid #e0e6ef;border-radius:10px;padding:10px;min-width:0';
      const strong=document.createElement('strong');strong.textContent=label;const p=document.createElement('div');p.textContent=value===true?'Operativo':value===false?'No disponible':'Sin verificar';p.style.color=value===true?'#087443':value===false?'#b42318':'#59677a';el.append(strong,p);return el;
    }
    async function refresh(){
      if(loading||document.hidden)return;
      loading=true;busy();
      try {
        const data=await api('estado');
        online=data.enLinea&&!['PENDIENTE','EN_EJECUCION'].includes(data.orden?.estado);
        find('mjInfraStatus').textContent=!data.configurado?'Agente pendiente de instalar/configurar':data.enLinea?'Agente en línea · '+new Date(data.ultimaComunicacion).toLocaleString():'Caseta sin comunicación reciente';
        const e=data.equipos||{};
        find('mjInfraDetails').replaceChildren(item('Computadora de caseta',data.enLinea),item('VirtualBox / Ubuntu',e.vm),item('Asterisk',e.asterisk),item('Agente de llamadas',e.agente),item('Grandstream (TCP local)',e.grandstream),item('ZKTeco (TCP local)',e.zkteco),item('ZKTeco desde Hostinger',data.enLinea&&data.zkteco?data.zkteco.ok:null));
        find('mjInfraIp').textContent='IP pública detectada: '+(data.ipDetectada||'—')+' · IP en uso: '+(data.ipEnUso||'—')+' · IP dinámica: '+(data.automatico?'Habilitada':'Deshabilitada')+(data.zkteco?' · '+data.zkteco.detalle:'');
        find('mjInfraOrder').textContent=data.orden?labels[data.orden.accion]+': '+data.orden.estado+(data.orden.detalle?' · '+data.orden.detalle:''):'Sin órdenes recientes';
        find('mjInfraHistory').replaceChildren(...(data.historial||[]).map(x=>{const p=document.createElement('p');p.textContent=new Date(x.finalizada||x.at||x.creada).toLocaleString()+' · '+(labels[x.accion]||x.accion)+' · '+(x.estado||x.ip||'');return p;}));
      }catch(e){online=false;find('mjInfraStatus').textContent='No fue posible consultar: '+e.message;find('mjInfraDetails').replaceChildren();find('mjInfraIp').textContent='';}
      finally{loading=false;busy();}
    }
    await refresh(); const timer=setInterval(refresh,30000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  }
  init().catch(()=>{});
})();
