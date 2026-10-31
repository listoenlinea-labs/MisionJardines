'use strict';
const direct = require('./zkteco-direct.service');
let timer = null;
let running = false;
let lastRun = null;
let lastOk = null;
let lastError = null;
let lastSuccessAt = null;
let consecutiveFailures = 0;
let lastAttempts = 0;

// Reintentar solo cortes momentáneos. Credenciales equivocadas, errores de SQL
// o inventarios vacíos/incompletos requieren diagnóstico, no más tráfico al C3.
function esFalloTransitorio(error){
  const code=String(error?.code||error?.cause?.code||'').toUpperCase();
  const message=String(error?.message||'').toLowerCase();
  if(/contraseña|password|credenciales|inventario incompleto|lectura no devolvió tarjetas|falta zkteco|tabla zkteco/.test(message))return false;
  if(['ETIMEDOUT','ECONNRESET','ECONNREFUSED','EPIPE','EHOSTUNREACH','ENETUNREACH','EAI_AGAIN'].includes(code))return true;
  return /tiempo de espera|no respondió a tiempo|conexión con el zkteco se cerró|socket hang up|read econnreset|connect etimedout/.test(message);
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Una sola lectura concurrente; si la web solicita otra, comparte el resultado.
// Las nuevas lecturas se reanudan en el siguiente ciclo, incluso tras fallos.
// No cambia autorizaciones, bloqueo ni vigencias en el panel.
let inFlight = null;
async function runAutoSync(){
  if(inFlight) return inFlight;
  inFlight = (async()=>{
    running=true;
    lastAttempts=0;
    try{
      let result;
      for(let attempt=1;attempt<=2;attempt++){
        lastAttempts=attempt;
        try{
          result=await direct.syncUsers();
          break;
        }catch(error){
          // Una recuperación breve por ciclo, sin tormenta de reconexiones.
          if(attempt===2||!esFalloTransitorio(error))throw error;
          await delay(1200);
        }
      }
      lastRun=new Date();
      lastSuccessAt=lastRun;
      lastOk=result;
      lastError=null;
      consecutiveFailures=0;
      return result;
    }catch(error){
      lastRun=new Date();
      lastError=error.message;
      consecutiveFailures++;
      console.error('ZKTeco inventario - lectura fallida, se preserva el último estado:',error.message);
      throw error;
    }finally{
      running=false;
      inFlight=null;
    }
  })();
  return inFlight;
}
function startZktecoAutoSync(){
  if(timer || String(process.env.ZKTECO_AUTOSYNC_ENABLED ?? 'true').toLowerCase()==='false')return;
  const interval=Math.max(30000,Math.min(3600000,Number(process.env.ZKTECO_AUTOSYNC_MS)||60000));
  const startDelay=Math.max(1000,Math.min(30000,Number(process.env.ZKTECO_AUTOSYNC_START_MS)||3000));
  const first=setTimeout(()=>{void runAutoSync().catch(()=>{});},startDelay);
  first.unref?.();
  timer=setInterval(()=>{void runAutoSync().catch(()=>{});},interval);
  timer.unref?.();
  console.log('ZKTeco auto-lectura del inventario C3 activa cada '+interval+' ms; reintento transitorio limitado');
}
function getZktecoAutoSyncStatus(){
  return {running,lastRun,lastOk,lastError,lastSuccessAt,consecutiveFailures,lastAttempts};
}
module.exports={startZktecoAutoSync,runAutoSync,getZktecoAutoSyncStatus,esFalloTransitorio};
