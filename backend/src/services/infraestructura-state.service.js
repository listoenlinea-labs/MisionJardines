'use strict';
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const blocked = new net.BlockList();
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]]) blocked.addSubnet(ip,bits,'ipv4');
const publicIP = ip => typeof ip === 'string' && net.isIPv4(ip) && !blocked.check(ip,'ipv4');
const normalizeIP = ip => String(ip || '').replace(/^::ffff:/i,'');
const dynamicEnabled = () => process.env.INFRA_DYNAMIC_ZKTECO === 'true';
const configured = () => Buffer.byteLength(process.env.INFRA_AGENT_TOKEN || '') >= 32;
const fallback = () => process.env.ZKTECO_DIRECT_HOST || process.env.ZKTECO_HOST;
// La tarea comprobada de Windows se ejecuta cada 5 minutos.
const ttl = 12 * 60 * 1000;
let heartbeat = null, verified = null, probe = null, job = null, history = [];
let busy = false, lastAttempt = 0;
const fresh = () => !!heartbeat && Date.now()-heartbeat.at < ttl;
function effectiveHost() {
  if (!dynamicEnabled()) return fallback();
  return fresh() && verified && verified.ip === heartbeat.ip ? verified.ip : undefined;
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
    ipDetectada:heartbeat?.ip || null, ipEnUso:effectiveHost() || null,
    equipos:fresh()?heartbeat.equipos:null, zkteco:probe, orden:job, historial:history };
}
function queue(action,user) {
  expire();
  if (!fresh()) return {error:'Agente de caseta sin comunicación reciente'};
  if (['ZKTECO','TODOS'].includes(action) && !dynamicEnabled()) return {error:'Activa el modo IP dinámica después de validar el agente y la serie del C3'};
  if (job && ['PENDIENTE','EN_EJECUCION'].includes(job.estado)) return {error:'Hay una operación en curso'};
  job={id:randomUUID(),accion:action,usuarioId:user,estado:'PENDIENTE',creada:Date.now(),vence:Date.now()+12*60*1000};
  remember({...job}); return {orden:job};
}
async function verify(ip, force=false, createClient) {
  if (busy || (!force && Date.now()-lastAttempt < 45000)) return;
  if (!force && verified?.ip === ip && probe?.ok && Date.now()-verified.at < 10*60*1000) return;
  if (!String(process.env.INFRA_C3_SERIAL || '').trim()) { probe={ok:false,detalle:'Falta configurar el número de serie autorizado',at:Date.now()}; return; }
  busy=true; lastAttempt=Date.now();
  let client;
  try {
    const {C3Client,getDirectConfig}=require('./zkteco-c3-client.service');
    client=(createClient || (cfg=>new C3Client(cfg)))({...getDirectConfig(),host:ip,expectedSerial:process.env.INFRA_C3_SERIAL,timeoutMs:4000});
    await client.connect();
    if (String(client.info?.serial || '').trim() !== String(process.env.INFRA_C3_SERIAL).trim()) throw Error('Serie no autorizada');
    if (heartbeat?.ip === ip) {
      if (verified?.ip !== ip) remember({accion:'IP_C3_VERIFICADA',ip,at:Date.now()});
      verified={ip,at:Date.now()}; probe={ok:true,detalle:'Protocolo C3 y serie verificados',at:Date.now()};
    }
  } catch (_) {
    if (heartbeat?.ip===ip) { verified=null; probe={ok:false,detalle:'No se confirmó el C3 autorizado desde Hostinger',at:Date.now()}; }
  } finally {
    if(client) { try { await client.disconnect(); } catch (_) { client._destroySocket?.(); } }
    busy=false;
  }
}
async function report(ip,equipos,result) {
  if (heartbeat?.ip !== ip) { verified=null; probe=null; lastAttempt=0; }
  heartbeat={ip,equipos,at:Date.now()};
  if(equipos.zkteco!==true){ verified=null; probe={ok:false,detalle:'No se confirmó el puerto local C3',at:Date.now()}; }
  expire();
  if (job?.estado==='EN_EJECUCION' && result?.id===job.id && typeof result.ok==='boolean') {
    const needsC3=['ZKTECO','TODOS'].includes(job.accion);
    const ok=result.ok && (!needsC3 || (equipos.zkteco===true && effectiveHost()===ip && probe?.ok===true));
    job.estado=ok?'COMPLETADA':'FALLIDA'; job.finalizada=Date.now();
    job.detalle=ok?'Agente confirmó la acción solicitada':needsC3?'No se confirmó la recuperación completa; revisa conexión local y protocolo C3':'El agente no pudo completar la acción';
    remember({...job});
  }
  let order=null;
  if(job?.estado==='PENDIENTE') { job.estado='EN_EJECUCION'; order={id:job.id,accion:job.accion}; }
  const force=order && ['ZKTECO','TODOS','DIAGNOSTICO'].includes(order.accion);
  if (dynamicEnabled() && equipos.zkteco===true) await verify(ip,Boolean(force));
  return {orden:order, automatico:dynamicEnabled(), zktecoConfirmado:Boolean(dynamicEnabled() && effectiveHost()===ip && probe?.ok), ipEnUso:effectiveHost()||null};
}
module.exports={publicIP,normalizeIP,dynamicEnabled,configured,effectiveHost,status,queue,report};
