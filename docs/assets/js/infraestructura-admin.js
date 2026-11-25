(() => {
  'use strict';
  const by=id=>document.getElementById(id);
  const fmt=value=>value?new Date(value).toLocaleString('es-MX'):'Sin registro';
  const txt=(value,fallback='Sin verificar')=>value==null||value===''?fallback:String(value);
  const bool=(value,yes='Activo',no='Inactivo')=>value===true?{text:yes,tone:'ok'}:value===false?{text:no,tone:'bad'}:{text:'Sin verificar',tone:'warn'};
  const names={DIAGNOSTICO:'Diagnóstico',CONMUTADOR:'Conmutador',ZKTECO:'ZKTeco',TODOS:'Ambos sistemas',AGENTE_CASETA:'Agente de caseta',C3_PRINCIPAL:'TCP principal',C3_RESPALDO:'TCP respaldo',DIAGNOSTICO_C3:'Diagnóstico C3',IP_C3_VERIFICADA:'IP de caseta verificada',C3_DINAMICA:'TCP dinámico',C3_PRINCIPAL_RESTAURADA:'TCP principal recuperado',ESTADO_VM:'VirtualBox',ESTADO_ASTERISK:'Asterisk',ESTADO_AGENTE:'Agente de llamadas',ESTADO_GRANDSTREAM:'Grandstream',ESTADO_ZKTECO:'ZKTeco local'};
  const apiBase=window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api';
  const token=()=>localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
  let data=null, loading=false, action=false, lastError='';
  async function api(path,body){
    const res=await fetch(apiBase+'/infraestructura/'+path,{cache:'no-store',headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
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
  function render(){
    const d=data||{},e=d.equipos||{},t=d.detalles||{},z=d.diagnosticoC3,now=Date.now(),recent=z&&now-z.at<10*60*1000&&z.host===d.ipEnUso;
    const freshProbe=d.zkteco&&now-d.zkteco.at<10*60*1000;
    const sync=d.autoSync||{}, syncRecent=sync.ultimoIntento&&now-new Date(sync.ultimoIntento).getTime()<180000;
    const phoneVerified=d.enLinea&&e.vm===true&&e.asterisk===true&&e.agente===true&&t.asteriskCli===true;
    const phoneBad=d.enLinea&&[e.vm,e.asterisk,e.agente,t.asteriskCli].some(v=>v===false);
    chip('phoneStatus',phoneVerified?'Servicios verificados':phoneBad?'Revisar servicios':d.enLinea?'Verificación parcial':'Sin reporte',phoneVerified?'ok':phoneBad?'bad':'warn');
    const remote=recent?z.data.estado==='CONECTADO':freshProbe?d.zkteco.ok:null;
    chip('zkStatus',remote===true?(recent?'Conectado · inventario leído':'Protocolo verificado'):remote===false?'Fallo de diagnóstico':d.modoConexion==='ESPERANDO_IP'?'Esperando IP verificada':'Sin verificar',remote===true?'ok':remote===false?'bad':'warn');
    const summaries=[['Computadora de caseta',d.enLinea?'Agente en línea':d.configurado?'Sin reporte reciente':'Pendiente de configurar'],['Último reporte',fmt(d.ultimaComunicacion)],['IP pública Telmex',txt(d.ipDetectada)]];
    by('infraSummary').replaceChildren(...summaries.map(([k,v])=>{const el=document.createElement('div'),small=document.createElement('small'),strong=document.createElement('strong');small.textContent=k;strong.textContent=v;el.append(small,strong);return el;}));
    rows('phoneData',[
      ['VirtualBox / VM conmutador',bool(e.vm,'En ejecución','Detenida')],['IP local Ubuntu',t.ubuntu],['Asterisk · systemctl is-enabled',bool(t.asteriskEnabled,'enabled','No habilitado')],['Asterisk · systemctl is-active',bool(e.asterisk,'active','No activo')],['Agente · systemctl is-enabled',bool(t.agenteEnabled,'enabled','No habilitado')],['Agente · systemctl is-active',bool(e.agente,'active','No activo')],['Asterisk CLI',bool(t.asteriskCli,'Responde','No responde')],['Contacto SIP 6001',bool(t.sip6001,'Configurado','No observado')],['Contacto SIP 6002',bool(t.sip6002,'Configurado','No observado')],['IP Grandstream',t.grandstream],['Grandstream · TCP puerto 80',bool(e.grandstream,'Puerto accesible','Puerto sin respuesta')],['Última orden',d.orden&&['CONMUTADOR','TODOS','DIAGNOSTICO'].includes(d.orden.accion)?d.orden.estado:null]
    ]);
    const checks=recent?z.data.pruebas||[]:[];
    rows('zkData',[
      ['IP pública reportada por caseta',d.ipDetectada],['IP manual de emergencia · Hostinger',d.ipManual],['Destino TCP en uso',d.ipEnUso],['Modo de conexión',d.modoConexion==='DINAMICA'?'TCP dinámico · IP verificada':d.modoConexion==='ESPERANDO_IP'?'Esperando IP verificada':d.modoConexion==='MANUAL'?'TCP manual (variable de entorno)':null],['Recuperación automática',bool(d.automatico,'Habilitada','Deshabilitada')],['IP local C3',t.zkLocal],['Puerto local TCP',bool(e.zkteco,'Accesible','Sin respuesta')],['Conexión desde Hostinger',bool(remote,'Verificada','Falló la comprobación')],['Último diagnóstico',fmt(z?.at)],['Duración del diagnóstico',z?z.duracionMs+' ms':null],['Última autolectura',fmt(sync.ultimoIntento)],['Autolectura reciente',syncRecent?bool(!sync.fallos,'Sin error registrado','Con errores'):null],...checks.map(x=>[x.etapa,{text:(x.ok?'Correcto · ':'Falló · ')+txt(x.detalle)+(x.serial?' · Serie '+x.serial:''),tone:x.ok?'ok':'bad'}])
    ]);
    by('phoneNote').textContent='Los contactos SIP configurados y el CLI no prueban audio ni llamada real. '+(!t.asteriskEnabled&&t.asteriskEnabled!==false?'Instala el diagnóstico SSH restringido en caseta para verificar systemctl.':'');
    by('zkNote').textContent=d.modoConexion==='ESPERANDO_IP'?(d.zkteco?.detalle||'Esperando un reporte autenticado y la validación del C3. No se prueba la IP manual.'):recent?txt(z.data.recomendacion,'Diagnóstico de solo lectura.'):'Pulsa Reintentar conexión para comprobar TCP, protocolo e inventario desde Hostinger. No se modifican TAGs.';
    events(by('infraHistory'),d.historial||[]);
    const pending=d.orden&&['PENDIENTE','EN_EJECUCION'].includes(d.orden.estado);
    by('phoneRetry').disabled=action||!d.enLinea||pending||!!lastError;
    by('zkRetry').disabled=action||!!lastError||!data;
    by('infraRefresh').disabled=loading||action;
  }
  async function refresh(){
    if(loading||action||document.hidden||window.MJSectionActive===false)return;
    loading=true;
    try{data=await api('estado');lastError='';notice(data.enLinea?'Estado recibido de caseta. Último reporte: '+fmt(data.ultimaComunicacion):'El backend responde; no hay reporte reciente de la computadora de caseta.');}
    catch(error){lastError=error.message;data=null;notice(error.message,true);}
    finally{loading=false;render();}
  }
  async function run(phone){
    if(action)return;action=true;render();
    try{
      if(phone){await api('orden',{accion:'CONMUTADOR'});notice('Orden enviada. Se ejecutará en la siguiente revisión de la tarea de Windows; no se reinician servicios activos.');}
      else{notice('Verificando conexión TCP, protocolo C3 e inventario desde Hostinger…');const result=await api('zkteco/reintentar',{});data={...data,...result};notice('Diagnóstico C3: '+txt(result.diagnostico?.data?.estado));}
    }catch(error){notice(error.message,true);}
    finally{action=false;render();if(phone)await refresh();}
  }
  function showDialog(title){by('infraDialogTitle').textContent=title;const root=by('infraDialogBody');root.textContent='Consultando…';const dialog=by('infraDialog');if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');return root;}
  function phoneLogs(){const root=showDialog('Logs del conmutador');const t=data?.detalles||{};const info=document.createElement('p');info.textContent='Journal del arranque actual: coincidencias de error en los últimos 30 mensajes de Asterisk: '+txt(t.erroresAsterisk)+' · agente: '+txt(t.erroresAgente)+'. No se transmiten teléfonos ni texto libre del journal.';root.replaceChildren(info);const logs=document.createElement('div');root.append(logs);events(logs,(data?.historial||[]).filter(x=>['CONMUTADOR','TODOS','DIAGNOSTICO','AGENTE_CASETA','ESTADO_VM','ESTADO_ASTERISK','ESTADO_AGENTE','ESTADO_GRANDSTREAM'].includes(x.accion)));}
  async function zkLogs(){const root=showDialog('Logs del ZKTeco');const recent=document.createElement('div');const stored=document.createElement('div');root.replaceChildren(recent,stored);events(recent,(data?.historial||[]).filter(x=>/C3|ZKTECO|TODOS/.test(x.accion)));stored.textContent='Consultando errores históricos…';try{const result=await api('zkteco/logs');events(stored,result.data||[]);}catch(error){stored.textContent=error.message;}}
  async function init(){
    if(!by('infraApp')||!(await window.MJAccessReady)||!['ADMINISTRADOR','SUPER_ADMIN'].includes(window.MJVerifiedRole))return;
    by('infraApp').hidden=false;by('infraRefresh').onclick=refresh;by('phoneRetry').onclick=()=>run(true);by('zkRetry').onclick=()=>run(false);by('phoneLogs').onclick=phoneLogs;by('zkLogs').onclick=zkLogs;
    by('infraClose').onclick=()=>{const d=by('infraDialog');if(typeof d.close==='function')d.close();else d.removeAttribute('open');};
    render();await refresh();const timer=setInterval(refresh,30000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  }
  init().catch(()=>{});
})();