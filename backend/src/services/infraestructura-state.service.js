'use strict';
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const blocked = new net.BlockList();
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]]) blocked.addSubnet(ip,bits,'ipv4');
const publicIP = ip => typeof ip === 'string' && net.isIPv4(ip) && !blocked.check(ip,'ipv4');
const normalizeIP = ip => String(ip || '').replace(/^::ffff:/i,'');
const dynamicEnabled = () => process.env.INFRA_DYNAMIC_ZKTECO === 'true';
const configured = () => Buffer.byteLength(process.env.INFRA_AGENT_TOKEN || '') >= 32;
const primary = () => process.env.ZKTECO_DIRECT_HOST || process.env.ZKTECO_HOST;
// La tarea comprobada de Windows se ejecuta cada 5 minutos.
const ttl = 12 * 60 * 1000;
let heartbeat = null, verified = null, probe = null, job = null, history = [];
let busy = false, lastAttempt = 0;
let lastDiagnostic = null, diagnosticFlight = null, lastDiagnosticAt = 0;
const fresh = () => !!heartbeat && Date.now()-heartbeat.at < ttl;
function effectiveHost() {
  if (dynamicEnabled() && fresh() && verified && verified.ip === heartbeat.ip && verified.primary === primary()) return verified.ip;
  return primary();
}
function remember(entry) {
  history.unshift(entry); history = history.slice(0,20);
  console.info('infraestructura', JSON.stringify(entry));
}
function expire() {
  if (job && ['PENDIENTE','EN_EJECUCION'].includes(job.estado) && Date.now() >= job.vence) {
    job.estado='VENCIDA'; remember({...job});
  }
}
function status() {
  expire();
  return { configurado:configured(), automatico:dynamicEnabled(), enLinea:fresh(), ultimaComunicacion:heartbeat?.at || null,
    ipDetectada:heartbeat?.ip || null, ipPrincipal:primary() || null, ipEnUso:effectiveHost() || null,
    modoConexion:effectiveHost() && effectiveHost()!==primary()?'RECUPERACION':'PRINCIPAL',
    equipos:fresh()?heartbeat.equipos:null, detalles:fresh()?heartbeat.detalles:null,
    diagnosticoC3:lastDiagnostic && lastDiagnostic.host===effectiveHost()?lastDiagnostic:null, zkteco:fresh() && probe?.host===effectiveHost()?probe:null, orden:job, historial:history };
}
function queue(action,user) {
  expire();
  if (!fresh()) return {error:'Agente de caseta sin comunicación reciente'};
  if (['ZKTECO','TODOS'].includes(action) && !dynamicEnabled()) return {error:'Activa el modo IP dinámica después de validar el agente y la serie del C3'};
  if (job && ['PENDIENTE','EN_EJECUCION'].includes(job.estado)) return {error:'Hay una operación en curso'};
  job={id:randomUUID(),accion:action,usuarioId:user,estado:'PENDIENTE',creada:Date.now(),vence:Date.now()+12*60*1000};
  remember({...job}); return {orden:job};
}
// Nunca cambiar el destino solo porque el agente informe una IP distinta.
// Probar primero la configuracion existente; el respaldo usa el mismo protocolo.
async function verify(ip, force=false, createClient) {
  if (busy || (!force && Date.now()-lastAttempt < 45000)) return;
  if (!force && probe?.ok && probe.host===effectiveHost() && Date.now()-probe.at < 10*60*1000) return;
  const serial=String(process.env.INFRA_C3_SERIAL || '').trim();
  const original=primary();
  if (!serial) { probe={ok:false,host:effectiveHost(),detalle:'Falta configurar el número de serie autorizado',at:Date.now()}; return; }
  busy=true; lastAttempt=Date.now();
  async function check(host) {
    if (!host) return false;
    let client;
    try {
      const {C3Client,getDirectConfig}=require('./zkteco-c3-client.service');
      client=(createClient || (cfg=>new C3Client(cfg)))({...getDirectConfig(),host,expectedSerial:serial,timeoutMs:4000});
      await client.connect();
      return String(client.info?.serial || '').trim()===serial;
    } catch (_) { return false; }
    finally {
      if(client) { try { await client.disconnect(); } catch (_) { client._destroySocket?.(); } }
    }
  }
  try {
    const started=Date.now();
    const originalOK=await check(original);
    if(heartbeat?.ip!==ip || primary()!==original) return;
    if(force || !originalOK || verified) remember({accion:'C3_PRINCIPAL',estado:originalOK?'CORRECTA':'FALLIDA',at:Date.now(),duracionMs:Date.now()-started});
    if(originalOK) {
      if(verified) remember({accion:'C3_PRINCIPAL_RESTAURADA',at:Date.now()});
      verified=null;
      probe={ok:true,host:original,detalle:'Conexión TCP principal y serie verificadas',at:Date.now()};
      return;
    }
    const backupStarted=Date.now();
    const backupOK=ip!==original && heartbeat.equipos.zkteco===true && publicIP(ip) && await check(ip);
    if(heartbeat?.ip!==ip || primary()!==original) return;
    if(ip!==original) remember({accion:'C3_RESPALDO',estado:backupOK?'CORRECTA':'FALLIDA',at:Date.now(),duracionMs:Date.now()-backupStarted});
    if(backupOK && heartbeat.equipos.zkteco===true) {
      if(verified?.ip!==ip) remember({accion:'IP_C3_VERIFICADA',ip,at:Date.now()});
      verified={ip,primary:original,at:Date.now()};
      probe={ok:true,host:ip,detalle:'Principal no disponible; respaldo TCP y serie verificados',at:Date.now()};
    } else {
      verified=null;
      probe={ok:false,host:original,detalle:'No se confirmó el C3 autorizado; se conserva el destino principal',at:Date.now()};
    }
  } finally { busy=false; }
}
async function report(ip,equipos,result,createClient,detalles=null) {
  if (heartbeat?.ip !== ip) { verified=null; probe=null; lastAttempt=0; }
  const previous=heartbeat;
  heartbeat={ip,equipos,detalles,at:Date.now()};
  if(!previous || previous.ip!==ip) remember({accion:'AGENTE_CASETA',estado:'REPORTE_RECIBIDO',ip,at:Date.now()});
  for(const name of ['vm','asterisk','agente','grandstream','zkteco']) if(typeof equipos[name]==='boolean' && previous?.equipos?.[name]!==equipos[name]) remember({accion:'ESTADO_'+name.toUpperCase(),estado:equipos[name]?'DISPONIBLE':'NO_DISPONIBLE',at:Date.now()});
  if(equipos.zkteco!==true){ verified=null; probe=null; lastAttempt=0; }
  expire();
  if (job?.estado==='EN_EJECUCION' && result?.id===job.id && typeof result.ok==='boolean') {
    const needsC3=['ZKTECO','TODOS'].includes(job.accion);
    const ok=result.ok && (!needsC3 || (equipos.zkteco===true && probe?.host===effectiveHost() && probe?.ok===true));
    job.estado=ok?'COMPLETADA':'FALLIDA'; job.finalizada=Date.now();
    job.detalle=ok?'Agente confirmó la acción solicitada':needsC3?'No se confirmó la recuperación completa; revisa conexión local y protocolo C3':'El agente no pudo completar la acción';
    remember({...job});
  }
  let order=null;
  if(job?.estado==='PENDIENTE') { job.estado='EN_EJECUCION'; order={id:job.id,accion:job.accion}; }
  const force=order && ['ZKTECO','TODOS','DIAGNOSTICO'].includes(order.accion);
  if (dynamicEnabled() && equipos.zkteco===true) await verify(ip,Boolean(force),createClient);
  return {orden:order, automatico:dynamicEnabled(), zktecoConfirmado:Boolean(dynamicEnabled() && probe?.host===effectiveHost() && probe?.ok), ipEnUso:effectiveHost()||null};
}
// Diagnóstico manual inmediato desde Hostinger, independiente de la cola Windows.
async function retryZkteco() {
  if(diagnosticFlight)return diagnosticFlight;
  if(lastDiagnostic && Date.now()-lastDiagnosticAt<15000 && lastDiagnostic.host===effectiveHost())return lastDiagnostic;
  diagnosticFlight=(async()=>{
    if(dynamicEnabled() && fresh() && heartbeat.equipos.zkteco===true) await verify(heartbeat.ip,true);
    const host=effectiveHost();
    const {getDirectConfig}=require('./zkteco-c3-client.service');
    const {diagnosticarConexion}=require('./zkteco-diagnostico-conexion.service');
    const started=Date.now();
    const data=await diagnosticarConexion({config:{...getDirectConfig(),host,timeoutMs:4000}});
    const value={host,at:Date.now(),duracionMs:Date.now()-started,data};
    if(host===effectiveHost()){lastDiagnostic=value;lastDiagnosticAt=Date.now();}
    remember({accion:'DIAGNOSTICO_C3',estado:data.estado,at:value.at,duracionMs:value.duracionMs});
    return value;
  })();
  try{return await diagnosticFlight;}finally{diagnosticFlight=null;}
}
module.exports={publicIP,normalizeIP,dynamicEnabled,configured,effectiveHost,status,queue,report,retryZkteco};
