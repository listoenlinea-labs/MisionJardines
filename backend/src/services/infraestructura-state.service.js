'use strict';
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const blocked = new net.BlockList();
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]]) blocked.addSubnet(ip,bits,'ipv4');
const publicIP = ip => typeof ip === 'string' && net.isIPv4(ip) && !blocked.check(ip,'ipv4');
const normalizeIP = ip => String(ip || '').replace(/^::ffff:/i,'');
const dynamicEnabled = () => process.env.INFRA_DYNAMIC_ZKTECO === 'true';
const configured = () => Buffer.byteLength(process.env.INFRA_AGENT_TOKEN || '') >= 32;
const manualHost = () => process.env.ZKTECO_DIRECT_HOST || process.env.ZKTECO_HOST;
// Estado compartido en MySQL; conservar las guardas en cada lectura.
const ttl=12*60*1000, retryMs=45000, leaseMs=90000;
const serial=()=>String(process.env.INFRA_C3_SERIAL||'').trim();
const fresh=s=>!!s.heartbeat && Date.now()-s.heartbeat.at<ttl;
function host(s){
  if(!dynamicEnabled())return manualHost();
  const h=s.heartbeat,v=s.verified;
  return serial()&&fresh(s)&&h.equipos.zkteco===true&&publicIP(h.ip)&&v?.ip===h.ip&&v.serial===serial()?v.ip:undefined;
}
function expire(s,remember){
  if(s.job&&['PENDIENTE','EN_EJECUCION'].includes(s.job.estado)&&Date.now()>=s.job.vence){
    s.job.estado='VENCIDA';s.job.finalizada=Date.now();remember({...s.job});
  }
}
function createService(store){
  async function effectiveHost(){
    if(!dynamicEnabled())return manualHost();
    // Fallar cerrado si MySQL no responde; no reutilizar un host en memoria.
    return host(await store.read());
  }
  async function status(includeHistory=true){
    // Evitar escribir cada 30 segundos por cada navegador si no hay orden vencida.
    let s=await store.read();
    if(s.job&&['PENDIENTE','EN_EJECUCION'].includes(s.job.estado)&&Date.now()>=s.job.vence){
      s=await store.mutate((current,remember)=>{expire(current,remember);return current;});
    }
    const ip=host(s),online=fresh(s),h=s.heartbeat,live=s.live;
    const liveFresh=!!live&&Date.now()-live.at<30000;
    const observed=live? (liveFresh?live:null) : (online?h:null);
    return {configurado:configured(),automatico:dynamicEnabled(),enLinea:online,ultimaComunicacion:h?.at||null,
      ipDetectada:h?.ip||null,ipPrincipal:dynamicEnabled()?(h?.ip||null):(manualHost()||null),
      ipManual:manualHost()||null,ipEnUso:ip||null,
      modoConexion:dynamicEnabled()?(ip?'DINAMICA':'ESPERANDO_IP'):'MANUAL',
      equipos:observed?.equipos||null,detalles:observed?.detalles||null,
      monitoreo:{habilitado:!!live,enVivo:liveFresh,ultimaMuestra:live?.at||null,edadMs:live?Math.max(0,Date.now()-live.at):null,solicitud:s.refresh||null},
      diagnosticoC3:s.lastDiagnostic&&s.lastDiagnostic.host===ip?s.lastDiagnostic:null,
      zkteco:dynamicEnabled()&&online&&s.probe?.host===h.ip?s.probe:null,
      orden:s.job||null,...(includeHistory?{historial:await store.history()}:{})};
  }
  async function requestRefresh(){
    return store.mutate(s=>{
      if(!s.live||Date.now()-s.live.at>=30000)return {error:'Monitor en vivo sin comunicación reciente; verifica la tarea de caseta'};
      if(s.refresh&&s.refresh.estado==='PENDIENTE'&&Date.now()<s.refresh.vence)return {solicitud:s.refresh};
      s.refresh={id:randomUUID(),estado:'PENDIENTE',creada:Date.now(),vence:Date.now()+65000};
      return {solicitud:s.refresh};
    });
  }
  async function queue(action,user){
    return store.mutate((s,remember)=>{
      expire(s,remember);
      if(!fresh(s))return {error:'Agente de caseta sin comunicación reciente'};
      if(['ZKTECO','TODOS'].includes(action)&&!dynamicEnabled())return {error:'Activa el modo IP dinámica después de validar el agente y la serie del C3'};
      if(s.job&&['PENDIENTE','EN_EJECUCION'].includes(s.job.estado))return {error:'Hay una operación en curso'};
      s.job={id:randomUUID(),accion:action,usuarioId:user,estado:'PENDIENTE',creada:Date.now(),vence:Date.now()+ttl};
      remember({...s.job});return {orden:s.job};
    });
  }
  // Tomar una concesión durable antes del TCP. Un cambio de IP o de serie
  // invalida el resultado anterior. Una caída de proceso libera por caducidad.
  function claim(s,force){
    const h=s.heartbeat,expected=serial(),now=Date.now();
    if(!dynamicEnabled()||!fresh(s)||h.equipos.zkteco!==true||!publicIP(h.ip))return null;
    if(!expected){s.verified=null;s.probe={ok:false,host:h.ip,detalle:'Falta configurar el número de serie autorizado',at:now};return null;}
    if(s.flight?.ip===h.ip&&s.flight.serial===expected&&s.flight.until>now)return null;
    if(!force&&s.lastAttempt&&now-s.lastAttempt<retryMs)return null;
    if(!force&&s.verified?.ip===h.ip&&s.verified.serial===expected&&s.probe?.ok&&now-s.probe.at<10*60*1000)return null;
    s.lastAttempt=now;
    s.flight={id:randomUUID(),ip:h.ip,serial:expected,until:now+leaseMs,force:Boolean(force)};
    return s.flight;
  }
  async function verify(flight,createClient){
    if(!flight)return;
    const started=Date.now();let client,ok=false;
    try{
      const {C3Client,getDirectConfig}=require('./zkteco-c3-client.service');
      // Host explícito: no resolver la IP efectiva aún no autorizada.
      client=(createClient||(cfg=>new C3Client(cfg)))({...getDirectConfig(flight.ip),expectedSerial:flight.serial,timeoutMs:4000});
      await client.connect();
      ok=String(client.info?.serial||'').trim()===flight.serial;
    }catch(_){ok=false;}
    finally{if(client){try{await client.disconnect();}catch(_){client._destroySocket?.();}}}
    await store.mutate((s,remember)=>{
      if(s.flight?.id!==flight.id)return;
      s.flight=null;
      if(!dynamicEnabled()||!fresh(s)||s.heartbeat.ip!==flight.ip||s.heartbeat.equipos.zkteco!==true||serial()!==flight.serial)return;
      const wasVerified=s.verified?.ip===flight.ip&&s.verified.serial===flight.serial;
      if(ok){
        s.verified={ip:flight.ip,serial:flight.serial,at:Date.now()};
        s.probe={ok:true,host:flight.ip,detalle:'IP reportada por caseta, protocolo C3 y serie verificados',at:Date.now()};
        if(!wasVerified)remember({accion:'IP_C3_VERIFICADA',ip:flight.ip,at:Date.now()});
      }else{
        s.verified=null;s.lastDiagnostic=null;
        s.probe={ok:false,host:flight.ip,detalle:'No se confirmó el C3 autorizado en la IP reportada; no se utiliza la IP manual automáticamente',at:Date.now()};
      }
      if(flight.force||!ok||!wasVerified)remember({accion:'C3_DINAMICA',estado:ok?'CORRECTA':'FALLIDA',at:Date.now(),duracionMs:Date.now()-started});
    });
  }
  async function report(ip,equipos,result,createClient,detalles=null,monitor=null){
    if(!publicIP(ip))throw Error('IP pública inválida');
    const initial=await store.mutate((s,remember)=>{
      const previous=s.heartbeat;
      const previousLive=s.live;
      if(monitor){
        s.live={ip,equipos,detalles,at:Date.now()};
      }
      if(!fresh(s)||previous?.ip!==ip||equipos.zkteco!==true||s.verified?.serial&&s.verified.serial!==serial()){
        s.verified=null;s.probe=null;s.lastDiagnostic=null;s.lastAttempt=0;s.flight=null;
      }
      s.heartbeat={ip,equipos,detalles,at:Date.now()};
      if(!previous||previous.ip!==ip)remember({accion:'AGENTE_CASETA',estado:'REPORTE_RECIBIDO',ip,at:Date.now()});
      for(const name of ['vm','asterisk','agente','grandstream','zkteco'])
        if(typeof equipos[name]==='boolean'&&(monitor?previousLive:previous)?.equipos?.[name]!==equipos[name]&&(!s.live||monitor))remember({accion:'ESTADO_'+name.toUpperCase(),estado:equipos[name]?'DISPONIBLE':'NO_DISPONIBLE',at:Date.now()});
      if(monitor){
        for(const name of ['ubuntuAccesible','asteriskCli','asteriskEnabled','agenteEnabled','sip6001','sip6002']){
          if(typeof detalles?.[name]==='boolean'&&previousLive?.detalles?.[name]!==detalles[name])
            remember({accion:'ESTADO_'+name.toUpperCase(),estado:detalles[name]?'DISPONIBLE':'NO_DISPONIBLE',at:Date.now()});
        }
        if(s.refresh?.estado==='PENDIENTE'&&Date.now()>=s.refresh.vence)s.refresh.estado='VENCIDA';
        const confirms=s.refresh?.estado==='PENDIENTE'&&monitor.confirmacion===s.refresh.id;
        // Una comprobación C3 manual está limitada a una cada 45 s; no leer inventario continuamente.
        const force=confirms&&(!s.lastAttempt||Date.now()-s.lastAttempt>=retryMs);
        return {order:null,flight:claim(s,force),refreshId:confirms?s.refresh.id:null};
      }
      expire(s,remember);
      // Entrega repetible del mismo UUID si el proceso muere antes de recibir el resultado.
      // Las órdenes permitidas son idempotentes y no abren puertas ni reinician servicios activos.
      let order=null;
      if(s.job?.estado==='PENDIENTE'||(s.job?.estado==='EN_EJECUCION'&&result?.id!==s.job.id&&Date.now()-(s.job.entregada||0)>=leaseMs)){
        s.job.estado='EN_EJECUCION';s.job.entregada=Date.now();
        order={id:s.job.id,accion:s.job.accion};
      }
      const force=order&&['ZKTECO','TODOS','DIAGNOSTICO'].includes(order.accion);
      return {order,flight:claim(s,force)};
    });
    await verify(initial.flight,createClient);
    if(monitor){
      // La ruta de monitor no consume órdenes de recuperación. Solo confirma el
      // UUID recibido en un ciclo anterior, después de tomar una muestra nueva.
      const finish=s=>{
        if(initial.refreshId&&s.refresh?.id===initial.refreshId&&s.refresh.estado==='PENDIENTE'&&Date.now()<s.refresh.vence){
          s.refresh.estado='COMPLETADA';s.refresh.completada=Date.now();
        }
        const current=host(s);
        return {orden:null,automatico:dynamicEnabled(),zktecoConfirmado:Boolean(dynamicEnabled()&&current&&s.probe?.host===current&&s.probe?.ok),ipEnUso:current||null,
          solicitarMuestra:s.refresh?.estado==='PENDIENTE'&&Date.now()<s.refresh.vence?s.refresh.id:null};
      };
      return initial.refreshId?store.mutate(finish):finish(await store.read());
    }
    // Confirmar solo la orden todavía vigente y la IP de la que procede el resultado.
    return store.mutate((s,remember)=>{
      expire(s,remember);
      if(s.heartbeat?.ip===ip&&s.job?.estado==='EN_EJECUCION'&&result?.id===s.job.id&&typeof result.ok==='boolean'){
        const needsC3=['ZKTECO','TODOS'].includes(s.job.accion);
        const ok=result.ok&&(!needsC3||(equipos.zkteco===true&&s.probe?.host===host(s)&&s.probe?.ok===true));
        s.job.estado=ok?'COMPLETADA':'FALLIDA';s.job.finalizada=Date.now();
        s.job.detalle=ok?'Agente confirmó la acción solicitada':needsC3?'No se confirmó la recuperación completa; revisa conexión local y protocolo C3':'El agente no pudo completar la acción';
        remember({...s.job});
      }
      const current=host(s);
      return {orden:initial.order&&s.job?.id===initial.order.id&&s.job.estado==='EN_EJECUCION'?initial.order:null,
        automatico:dynamicEnabled(),zktecoConfirmado:Boolean(dynamicEnabled()&&current&&s.probe?.host===current&&s.probe?.ok),ipEnUso:current||null};
    });
  }
  async function retryZkteco(){
    const flight=await store.mutate(s=>claim(s,true));
    await verify(flight);
    const s=await store.read(),target=host(s);
    if(s.lastDiagnostic&&Date.now()-s.lastDiagnostic.at<15000&&s.lastDiagnostic.host===target)return s.lastDiagnostic;
    const {getDirectConfig}=require('./zkteco-c3-client.service');
    const {diagnosticarConexion}=require('./zkteco-diagnostico-conexion.service');
    const started=Date.now();
    const data=await diagnosticarConexion({config:{...getDirectConfig(target),timeoutMs:4000}});
    const value={host:target,at:Date.now(),duracionMs:Date.now()-started,data};
    await store.mutate((current,remember)=>{
      if(target===host(current))current.lastDiagnostic=value;
      remember({accion:'DIAGNOSTICO_C3',estado:data.estado,at:value.at,duracionMs:value.duracionMs});
    });
    return value;
  }
  return {effectiveHost,status,queue,report,retryZkteco,requestRefresh};
}
module.exports={publicIP,normalizeIP,dynamicEnabled,configured,createService,...createService(require('./infraestructura-store.service'))};
