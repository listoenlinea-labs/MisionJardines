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
// Margen de expiración para reportes periódicos de la tarea Windows.
const ttl = 12 * 60 * 1000;
let heartbeat = null, verified = null, probe = null, job = null, history = [];
let verificationFlight = null, lastAttempt = 0;
let lastDiagnostic = null, diagnosticFlight = null, lastDiagnosticAt = 0;
const fresh = () => !!heartbeat && Date.now()-heartbeat.at < ttl;
function effectiveHost() {
  if (!dynamicEnabled()) return manualHost();
  const serial=String(process.env.INFRA_C3_SERIAL || '').trim();
  // En modo dinámico nunca probar automáticamente la dirección de hPanel.
  return serial && fresh() && heartbeat.equipos.zkteco===true && verified?.ip===heartbeat.ip && verified.serial===serial ? verified.ip : undefined;
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
    ipDetectada:heartbeat?.ip || null, ipPrincipal:dynamicEnabled()?(heartbeat?.ip||null):(manualHost()||null),
    ipManual:manualHost()||null, ipEnUso:effectiveHost() || null,
    modoConexion:dynamicEnabled()?(effectiveHost()?'DINAMICA':'ESPERANDO_IP'):'MANUAL',
    equipos:fresh()?heartbeat.equipos:null, detalles:fresh()?heartbeat.detalles:null,
    diagnosticoC3:lastDiagnostic && lastDiagnostic.host===effectiveHost()?lastDiagnostic:null, zkteco:dynamicEnabled() && fresh() && probe?.host===heartbeat.ip?probe:null, orden:job, historial:history };
}
function queue(action,user) {
  expire();
  if (!fresh()) return {error:'Agente de caseta sin comunicación reciente'};
  if (['ZKTECO','TODOS'].includes(action) && !dynamicEnabled()) return {error:'Activa el modo IP dinámica después de validar el agente y la serie del C3'};
  if (job && ['PENDIENTE','EN_EJECUCION'].includes(job.estado)) return {error:'Hay una operación en curso'};
  job={id:randomUUID(),accion:action,usuarioId:user,estado:'PENDIENTE',creada:Date.now(),vence:Date.now()+12*60*1000};
  remember({...job}); return {orden:job};
}
// Validar únicamente el destino reportado por caseta. La variable de Hostinger
// es un modo manual de emergencia, no una alternativa automática.
async function verify(ip, force=false, createClient) {
  if (!dynamicEnabled() || !fresh() || heartbeat.ip!==ip || heartbeat.equipos.zkteco!==true || !publicIP(ip)) return;
  const serial=String(process.env.INFRA_C3_SERIAL || '').trim();
  if(!serial){verified=null;probe={ok:false,host:ip,detalle:'Falta configurar el número de serie autorizado',at:Date.now()};return;}
  if(verificationFlight){
    const active=verificationFlight;
    await active.promise;
    if(active.ip===ip && active.serial===serial && probe?.host===ip) return;
    return verify(ip,force,createClient);
  }
  if (!force && Date.now()-lastAttempt < 45000) return;
  if (!force && verified?.ip===ip && verified.serial===serial && probe?.ok && Date.now()-probe.at<10*60*1000) return;
  lastAttempt=Date.now();
  const started=Date.now();
  const flight={ip,serial,promise:null};
  flight.promise=(async()=>{
    let client;
    let ok=false;
    try {
      const {C3Client,getDirectConfig}=require('./zkteco-c3-client.service');
      client=(createClient || (cfg=>new C3Client(cfg)))({...getDirectConfig(),host:ip,expectedSerial:serial,timeoutMs:4000});
      await client.connect();
      ok=String(client.info?.serial || '').trim()===serial;
    } catch (_) { ok=false; }
    finally {
      if(client){try{await client.disconnect();}catch(_){client._destroySocket?.();}}
    }
    // Un reporte más reciente o un cambio de serie no puede autorizar la IP anterior.
    if(!dynamicEnabled() || !fresh() || heartbeat.ip!==ip || heartbeat.equipos.zkteco!==true || String(process.env.INFRA_C3_SERIAL||'').trim()!==serial)return;
    const wasVerified=verified?.ip===ip && verified.serial===serial;
    if(ok){
      verified={ip,serial,at:Date.now()};
      probe={ok:true,host:ip,detalle:'IP reportada por caseta, protocolo C3 y serie verificados',at:Date.now()};
      if(!wasVerified)remember({accion:'IP_C3_VERIFICADA',ip,at:Date.now()});
    }else{
      verified=null;
      lastDiagnostic=null;
      probe={ok:false,host:ip,detalle:'No se confirmó el C3 autorizado en la IP reportada; no se utiliza la IP manual automáticamente',at:Date.now()};
    }
    if(force || !ok || !wasVerified)remember({accion:'C3_DINAMICA',estado:ok?'CORRECTA':'FALLIDA',at:Date.now(),duracionMs:Date.now()-started});
  })();
  verificationFlight=flight;
  try{await flight.promise;}finally{if(verificationFlight===flight)verificationFlight=null;}
}
async function report(ip,equipos,result,createClient,detalles=null) {
  if (heartbeat?.ip !== ip) { verified=null; probe=null; lastDiagnostic=null; lastAttempt=0; }
  const previous=heartbeat;
  heartbeat={ip,equipos,detalles,at:Date.now()};
  if(!previous || previous.ip!==ip) remember({accion:'AGENTE_CASETA',estado:'REPORTE_RECIBIDO',ip,at:Date.now()});
  for(const name of ['vm','asterisk','agente','grandstream','zkteco']) if(typeof equipos[name]==='boolean' && previous?.equipos?.[name]!==equipos[name]) remember({accion:'ESTADO_'+name.toUpperCase(),estado:equipos[name]?'DISPONIBLE':'NO_DISPONIBLE',at:Date.now()});
  if(equipos.zkteco!==true){ verified=null; probe=null; lastDiagnostic=null; lastAttempt=0; }
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
