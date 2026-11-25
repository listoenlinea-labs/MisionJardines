(() => {
  'use strict';
  const by=id=>document.getElementById(id);
  const fmt=value=>value?new Date(value).toLocaleString('es-MX'):'Sin registro';
  const txt=(value,fallback='Sin verificar')=>value==null||value===''?fallback:String(value);
  const bool=(value,yes='Activo',no='Inactivo')=>value===true?{text:yes,tone:'ok'}:value===false?{text:no,tone:'bad'}:{text:'Sin verificar',tone:'warn'};
  const names={DIAGNOSTICO:'Diagnóstico',CONMUTADOR:'Conmutador',ZKTECO:'ZKTeco',TODOS:'Ambos sistemas',AGENTE_CASETA:'Agente de caseta',C3_PRINCIPAL:'TCP principal',C3_RESPALDO:'TCP respaldo',DIAGNOSTICO_C3:'Diagnóstico C3',IP_C3_VERIFICADA:'IP de caseta verificada',C3_DINAMICA:'TCP dinámico',C3_PRINCIPAL_RESTAURADA:'TCP principal recuperado',ESTADO_VM:'VirtualBox',ESTADO_ASTERISK:'Asterisk',ESTADO_AGENTE:'Agente de llamadas',ESTADO_GRANDSTREAM:'Grandstream',ESTADO_ZKTECO:'ZKTeco local'};
  const apiBase=window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api';
  const token=()=>localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
  let data=null, loading=false, action=false, lastError='', lastRefreshAt=null, lastHistoryAt=0, refreshNote='';
  const refreshClock=new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  function refreshFeedback(state){
    const button=by('infraRefresh'),feedback=by('infraRefreshFeedback');
    button.dataset.state=state;
    button.setAttribute('aria-busy',String(state==='loading'));
    button.disabled=loading||action;
    by('infraRefreshLabel').textContent=state==='loading'?'Actualizando…':'Actualizar estado';
    feedback.dataset.state=state;
    const time=lastRefreshAt?refreshClock.format(lastRefreshAt):null;
    feedback.textContent=state==='loading'?(refreshNote||'Consultando el servidor…'):state==='success'?(refreshNote||'Actualización completada')+' · '+time+' h (México)':state==='error'?'No se pudo actualizar'+(time?' · Última correcta: '+time+' h':''):'Sin actualización todavía';
  }
  const historyMedia=matchMedia('(max-width:850px)');
  const historyTools=window.MJInfraBitacora;
  let historyPage=1;
  async function api(path,body,signal){
    const res=await fetch(apiBase+'/infraestructura/'+path,{cache:'no-store',signal,headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
    if(res.status===404)throw Error('La API de infraestructura no está desplegada en Hostinger (404). Comprueba el último despliegue del backend; no significa que los equipos estén desconectados.');
    if(res.status===401||res.status===403)throw Error('La sesión no tiene acceso administrativo.');
    const result=await res.json();
    if(!res.ok||!result.ok)throw Error(result.error||result.message||'No se pudo consultar el servidor');
    return result;
  }
  function notice(message,error=false){by('infraNotice').textContent=message;by('infraNotice').dataset.tone=error?'error':'';}
  function chip(id,text,tone=''){const el=by(id);el.textContent=text;el.dataset.tone=tone;}
  function row(label,value){const div=document.createElement('div');div.className='infra-row';const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=typeof value==='object'&&value!==null?value.text:txt(value);if(value?.tone)dd.dataset.tone=value.tone;div.append(dt,dd);return div;}
  function rows(id,values){const dl=document.createElement('dl');for(const [label,value] of values)dl.append(row(label,value));by(id).replaceChildren(dl);}
  function events(target,values){
    target.replaceChildren();
    if(!values.length){const p=document.createElement('p');p.className='infra-empty';p.textContent='Sin registros disponibles.';target.append(p);return;}
    for(const value of values){const el=document.createElement('div');el.className='infra-event';const date=document.createElement('time'),title=document.createElement('strong'),detail=document.createElement('span');date.textContent=fmt(value.finalizada||value.at||value.creada||value.fecha);title.textContent=names[value.accion]||value.accion||'Evento';detail.textContent=[value.estado,value.error,value.detalle,value.ip,value.duracionMs!=null?value.duracionMs+' ms':''].filter(Boolean).join(' · ');el.append(date,title,detail);target.append(el);}
  }
  function historyStatus(value){
    const state=String(value||'').toUpperCase();
    const tone=['CORRECTA','COMPLETADA','DISPONIBLE','CONECTADO','REPORTE_RECIBIDO'].includes(state)?'ok':
      /FALL|ERROR|NO_DISPONIBLE|VENCIDA|SIN_CONEXION/.test(state)?'bad':
      ['PENDIENTE','EN_EJECUCION','LECTURA_VACIA'].includes(state)?'warn':'';
    const labels={CORRECTA:'Correcta',FALLIDA:'Fallida',COMPLETADA:'Completada',DISPONIBLE:'Disponible',NO_DISPONIBLE:'No disponible',CONECTADO:'Conectado',REPORTE_RECIBIDO:'Reporte recibido',PENDIENTE:'Pendiente',EN_EJECUCION:'En ejecución',VENCIDA:'Vencida',SIN_CONEXION_TCP:'Sin conexión TCP',ERROR_PROTOCOLO:'Error de protocolo',ERROR_INVENTARIO:'Error de inventario',LECTURA_VACIA:'Lectura vacía',CONFIGURACION_INVALIDA:'Configuración inválida'};
    const node=document.createElement('span');node.className='infra-history-status';node.dataset.tone=tone;
    node.textContent=labels[state]||String(value||'Sin estado').replace(/_/g,' ');
    return node;
  }
  function renderHistory(values){
    const root=by('infraHistory');
    const p=historyTools.paginate(values,historyPage,historyMedia.matches);historyPage=p.page;
    root.replaceChildren();
    const columns=['Fecha','Hora','Operación','Estado','Detalle'];
    function fields(value){
      const date=historyTools.dateTime(value);
      return [date.fecha,date.hora,names[value.accion]||value.accion||'Evento',historyStatus(value.estado),[value.error,value.detalle,value.ip?'IP: '+value.ip:'',value.duracionMs!=null?value.duracionMs+' ms':''].filter(Boolean).join(' · ')||'—'];
    }
    function content(el,value){if(typeof value==='string')el.textContent=value;else el.append(value);}
    if(!p.total){
      const empty=document.createElement('p');empty.className='infra-empty';empty.textContent='Sin registros disponibles.';root.append(empty);
    }else if(historyMedia.matches){
      const cards=document.createElement('div');cards.className='infra-history-cards';
      for(const value of p.items){
        const card=document.createElement('article');card.className='infra-history-mobile-card';
        const dl=document.createElement('dl');
        fields(value).forEach((field,i)=>{const line=document.createElement('div');line.className='infra-history-field';const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=columns[i];content(dd,field);line.append(dt,dd);dl.append(line);});
        card.append(dl);cards.append(card);
      }
      root.append(cards);
    }else{
      const wrap=document.createElement('div');wrap.className='infra-history-table-wrap';
      const table=document.createElement('table');table.className='infra-history-table';table.setAttribute('aria-label','Últimas operaciones, fecha y hora de México');
      const head=document.createElement('thead'),tr=document.createElement('tr');
      for(const label of columns){const th=document.createElement('th');th.scope='col';th.textContent=label;tr.append(th);}
      head.append(tr);table.append(head);
      const body=document.createElement('tbody');
      for(const value of p.items){const tr=document.createElement('tr');for(const field of fields(value)){const td=document.createElement('td');content(td,field);tr.append(td);}body.append(tr);}
      table.append(body);wrap.append(table);root.append(wrap);
    }
    by('infraHistoryPager').hidden=!p.total;
    by('infraHistoryRange').textContent=p.total?'Mostrando '+p.from+'–'+p.to+' de '+p.total+' operaciones':'Sin operaciones';
    by('infraHistoryPage').textContent='Página '+p.page+' de '+p.pages;
    by('infraHistoryPrev').disabled=p.page<=1;
    by('infraHistoryNext').disabled=p.page>=p.pages;
  }
  function render(){
    const d=data||{},m=d.monitoreo||{},now=Date.now(),age=m.ultimaMuestra?Math.max(0,now-m.ultimaMuestra):null,economy=m.modo==='DOS_HORAS',live=m.habilitado&&age!==null&&age<(m.caducidadMs||30000)&&m.enVivo,stale=m.habilitado&&!live,e=stale?{}:d.equipos||{},t=stale?{}:d.detalles||{},z=d.diagnosticoC3,recent=z&&now-z.at<(m.caducidadMs&&economy?m.caducidadMs:10*60*1000)&&z.host===d.ipEnUso;
    const indicator=by('infraLive');
    indicator.dataset.tone=live?'ok':stale?'bad':'warn';
    indicator.textContent=live?(economy?'Cada 2 horas · última revisión: '+fmt(m.ultimaMuestra):'Modo anterior · última muestra: '+fmt(m.ultimaMuestra)):stale?'Última revisión vencida · '+fmt(m.ultimaMuestra):'Monitor pendiente de instalar';
    const freshProbe=d.zkteco&&now-d.zkteco.at<(economy?m.caducidadMs:10*60*1000);
    const sync=d.autoSync||{}, syncRecent=sync.ultimoIntento&&now-new Date(sync.ultimoIntento).getTime()<180000;
    const phoneVerified=!stale&&d.enLinea&&e.vm===true&&e.asterisk===true&&e.agente===true&&t.asteriskCli===true;
    const phoneBad=!stale&&d.enLinea&&[e.vm,e.asterisk,e.agente,t.asteriskCli].some(v=>v===false);
    chip('phoneStatus',stale?'Comunicación interrumpida':phoneVerified?'Servicios verificados':phoneBad?'Revisar servicios':d.enLinea?'Verificación parcial':'Sin reporte',phoneVerified?'ok':phoneBad?'bad':'warn');
    const remote=stale?null:recent?z.data.estado==='CONECTADO':freshProbe?d.zkteco.ok:null;
    chip('zkStatus',stale?'Sin muestra reciente':remote===true?(recent?'Conectado · inventario leído':'Protocolo verificado'):remote===false?'Fallo de diagnóstico':d.modoConexion==='ESPERANDO_IP'?'Esperando IP verificada':'Sin verificar',remote===true?'ok':remote===false?'bad':'warn');
    const summaries=[['Computadora de caseta',d.enLinea?'Último reporte recibido':d.configurado?'Sin reporte reciente':'Pendiente de configurar'],['Última revisión completa',fmt(m.ultimaMuestra||d.ultimaComunicacion)],['IP pública Telmex',txt(d.ipDetectada)]];
    by('infraSummary').replaceChildren(...summaries.map(([k,v])=>{const el=document.createElement('div'),small=document.createElement('small'),strong=document.createElement('strong');small.textContent=k;strong.textContent=v;el.append(small,strong);return el;}));
    rows('phoneData',[
      ['VirtualBox / VM conmutador',bool(e.vm,'En ejecución','Detenida')],['IP local Ubuntu',t.ubuntu],['Ubuntu · SSH TCP 22',bool(t.ubuntuAccesible,'Accesible','Sin respuesta')],['Asterisk · systemctl is-enabled',bool(t.asteriskEnabled,'enabled','No habilitado')],['Asterisk · systemctl is-active',bool(e.asterisk,'active','No activo')],['Agente · systemctl is-enabled',bool(t.agenteEnabled,'enabled','No habilitado')],['Agente · systemctl is-active',bool(e.agente,'active','No activo')],['Asterisk CLI',bool(t.asteriskCli,'Responde','No responde')],['Contacto SIP 6001',bool(t.sip6001,'Configurado','No observado')],['Contacto SIP 6002',bool(t.sip6002,'Configurado','No observado')],['IP Grandstream',t.grandstream],['Grandstream · TCP puerto 80',bool(e.grandstream,'Puerto accesible','Puerto sin respuesta')],['Última orden',d.orden&&['CONMUTADOR','TODOS','DIAGNOSTICO'].includes(d.orden.accion)?d.orden.estado:null]
    ]);
    const checks=recent?z.data.pruebas||[]:[];
    rows('zkData',[
      ['IP pública reportada por caseta',d.ipDetectada],['IP manual de emergencia · Hostinger',d.ipManual],['Destino TCP en uso',d.ipEnUso],['Modo de conexión',d.modoConexion==='DINAMICA'?'TCP dinámico · IP verificada':d.modoConexion==='ESPERANDO_IP'?'Esperando IP verificada':d.modoConexion==='MANUAL'?'TCP manual (variable de entorno)':null],['Recuperación automática',bool(d.automatico,'Habilitada','Deshabilitada')],['IP local C3',t.zkLocal],['Puerto local TCP',bool(e.zkteco,'Accesible','Sin respuesta')],['Conexión desde Hostinger',bool(remote,'Verificada','Falló la comprobación')],['Última verificación C3',fmt(d.zkteco?.at)],['Último diagnóstico de inventario',fmt(z?.at)],['Duración del diagnóstico',z?z.duracionMs+' ms':null],['Última autolectura',fmt(sync.ultimoIntento)],['Autolectura reciente',syncRecent?bool(!sync.fallos,'Sin error registrado','Con errores'):null],...checks.map(x=>[x.etapa,{text:(x.ok?'Correcto · ':'Falló · ')+txt(x.detalle)+(x.serial?' · Serie '+x.serial:''),tone:x.ok?'ok':'bad'}])
    ]);
    by('phoneNote').textContent='Los contactos SIP configurados y el CLI no prueban audio ni llamada real. '+(!t.asteriskEnabled&&t.asteriskEnabled!==false?'Instala el diagnóstico SSH restringido en caseta para verificar systemctl.':'');
    by('zkNote').textContent=d.modoConexion==='ESPERANDO_IP'?(d.zkteco?.detalle||'Esperando un reporte autenticado y la validación del C3. No se prueba la IP manual.'):recent?txt(z.data.recomendacion,'Diagnóstico de solo lectura.'):'Pulsa Reintentar conexión para comprobar TCP, protocolo e inventario desde Hostinger. No se modifican TAGs.';
    renderHistory(d.historial||[]);
    const pending=d.orden&&['PENDIENTE','EN_EJECUCION'].includes(d.orden.estado);
    by('phoneRetry').disabled=loading||action||(!d.enLinea&&!economy)||pending||!data;
    by('zkRetry').disabled=loading||action||pending||!data;
    by('infraRefresh').disabled=loading||action;
  }
  async function readStatus(signal,forceHistory=false){
    const full=forceHistory||!data;
    const next=await api(full?'estado':'estado?historial=0',undefined,signal);
    if(full)lastHistoryAt=Date.now();
    data={...next,historial:next.historial||data?.historial||[]};
    lastError='';render();
  }
  async function refresh(manual=false){
    if(loading||action||document.hidden||window.MJSectionActive===false)return;
    loading=true;refreshNote=manual?'Solicitando una muestra nueva a caseta…':'';
    refreshFeedback('loading');by('phoneRetry').disabled=true;by('zkRetry').disabled=true;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),195000);
    let outcome='error';
    try{
      if(manual){
        const requested=await api('actualizar',{},controller.signal);
        const id=requested.solicitud.id;
        refreshNote='Esperando diagnóstico nuevo de caseta…';refreshFeedback('loading');
        for(;;){
          await readStatus(controller.signal);
          const result=data.monitoreo?.solicitud;
          if(result?.id===id&&result.estado==='COMPLETADA'){
            if(!data.monitoreo.enVivo)throw Error('La muestra ya no está vigente');
            break;
          }
          if(result?.id!==id||result.estado==='VENCIDA')throw Error('La solicitud de diagnóstico venció; intenta nuevamente');
          await new Promise(resolve=>setTimeout(resolve,4000));
          if(controller.signal.aborted)throw Error('Tiempo de espera agotado');
        }
      }else await readStatus(controller.signal,true);
      notice(data.monitoreo?.habilitado?(data.monitoreo.enVivo?'Última comprobación guardada. No es una lectura continua. Pulsa Actualizar estado para solicitar una nueva.':'La última revisión venció; pulsa Actualizar estado para comprobar caseta.'):(data.enLinea?'Modo periódico. Último reporte: '+fmt(data.ultimaComunicacion):'El backend responde; no hay reporte reciente de caseta.'));
      lastRefreshAt=new Date();refreshNote=manual?'Muestra nueva recibida':'Estado consultado';outcome='success';
    }catch(error){
      lastError=controller.signal.aborted?'No llegó una muestra nueva a tiempo. Revisa la comunicación con caseta.':error.message;
      // Conservar el último reporte para distinguir su edad; no afirmar éxito.
      notice(lastError,true);render();
    }finally{
      clearTimeout(timeout);loading=false;refreshFeedback(outcome);render();
    }
  }
  async function run(phone){
    if(action||loading)return;action=true;render();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),195000);
    try{
      notice(phone?'Solicitando recuperación del conmutador…':'Solicitando comprobación local y remota del ZKTeco…');
      const result=await api('orden',{accion:phone?'CONMUTADOR':'ZKTECO'},controller.signal);
      const id=result.orden.id;
      for(;;){
        await readStatus(controller.signal);
        const job=data.orden;
        if(job?.id!==id||['FALLIDA','VENCIDA'].includes(job.estado))throw Error(job?.detalle||'No se confirmó la recuperación solicitada');
        if(job.estado==='COMPLETADA')break;
        await new Promise(resolve=>setTimeout(resolve,4000));
        if(controller.signal.aborted)throw Error('Tiempo de espera agotado');
      }
      if(!phone){
        notice('Conexión verificada. Leyendo inventario desde Hostinger…');
        const verified=await api('zkteco/reintentar',{},controller.signal);
        data={...data,...verified};notice('Diagnóstico C3: '+txt(verified.diagnostico?.data?.estado));
      }else{await readStatus(controller.signal,true);notice('Recuperación confirmada por caseta. Verifica una llamada real si es necesario.');}
    }catch(error){notice(controller.signal.aborted?'No se recibió confirmación a tiempo. Revisa caseta.':error.message,true);}
    finally{clearTimeout(timeout);action=false;render();}
  }
  function showDialog(title){by('infraDialogTitle').textContent=title;const root=by('infraDialogBody');root.textContent='Consultando…';const dialog=by('infraDialog');if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');return root;}
  function phoneLogs(){const root=showDialog('Logs del conmutador');const t=data?.detalles||{};const info=document.createElement('p');info.textContent='Journal del arranque actual: coincidencias de error en los últimos 30 mensajes de Asterisk: '+txt(t.erroresAsterisk)+' · agente: '+txt(t.erroresAgente)+'. No se transmiten teléfonos ni texto libre del journal.';root.replaceChildren(info);const logs=document.createElement('div');root.append(logs);events(logs,(data?.historial||[]).filter(x=>['CONMUTADOR','TODOS','DIAGNOSTICO','AGENTE_CASETA','ESTADO_VM','ESTADO_ASTERISK','ESTADO_AGENTE','ESTADO_GRANDSTREAM'].includes(x.accion)));}
  async function zkLogs(){const root=showDialog('Logs del ZKTeco');const recent=document.createElement('div');const stored=document.createElement('div');root.replaceChildren(recent,stored);events(recent,(data?.historial||[]).filter(x=>/C3|ZKTECO|TODOS/.test(x.accion)));stored.textContent='Consultando errores históricos…';try{const result=await api('zkteco/logs');events(stored,result.data||[]);}catch(error){stored.textContent=error.message;}}
  async function init(){
    if(!by('infraApp')||!(await window.MJAccessReady)||!['ADMINISTRADOR','SUPER_ADMIN'].includes(window.MJVerifiedRole))return;
    by('infraApp').hidden=false;by('infraRefresh').onclick=()=>refresh(true);by('phoneRetry').onclick=()=>run(true);by('zkRetry').onclick=()=>run(false);by('phoneLogs').onclick=phoneLogs;by('zkLogs').onclick=zkLogs;
    by('infraClose').onclick=()=>{const d=by('infraDialog');if(typeof d.close==='function')d.close();else d.removeAttribute('open');};
    by('infraHistoryPrev').onclick=()=>{historyPage--;renderHistory(data?.historial||[]);};
    by('infraHistoryNext').onclick=()=>{historyPage++;renderHistory(data?.historial||[]);};
    const resizeHistory=()=>{historyPage=1;renderHistory(data?.historial||[]);};
    if(historyMedia.addEventListener)historyMedia.addEventListener('change',resizeHistory);else historyMedia.addListener(resizeHistory);
    render();await refresh();
    // No polling de red al mantener la página abierta. Solo recalcular caducidad
    // localmente; las solicitudes se realizan al entrar o pulsar un botón.
    const ageTimer=setInterval(()=>{if(!document.hidden&&window.MJSectionActive!==false&&data?.monitoreo?.habilitado){const age=Math.max(0,Date.now()-data.monitoreo.ultimaMuestra);if(age>=(data.monitoreo.caducidadMs||30000)&&by('infraLive').dataset.tone!=='bad')render();}},60000);
    window.addEventListener('pagehide',()=>{clearInterval(ageTimer);if(historyMedia.removeEventListener)historyMedia.removeEventListener('change',resizeHistory);else historyMedia.removeListener(resizeHistory);},{once:true});
  }
  init().catch(()=>{});
})();