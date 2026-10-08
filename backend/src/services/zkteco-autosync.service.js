const direct = require('./zkteco-direct.service');
let timer = null;
let running = false;
let lastRun = null;
let lastOk = null;
let lastError = null;

// Una sola lectura concurrente; si se solicita mientras corre se comparte el resultado.
// Inventario físico -> reflejo SQL, no activa ni elimina usuarios del controlador.
let inFlight = null;
async function runAutoSync(){
  if(inFlight) return inFlight;
  inFlight = (async()=>{
    running=true;
    try{
      const result=await direct.syncUsers();
      lastRun=new Date();
      lastOk=result;
      lastError=null;
      // Solo inicia cortes generales cuando Administración lo habilitó.
      void require('./zkteco-corte-inicial.service').prepararCortesOctubre().catch(error =>
        console.error('ZKTeco corte inicial:',error.message));
      return result;
    }catch(error){
      lastRun=new Date();
      lastError=error.message;
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
  console.log('ZKTeco auto-lectura del inventario C3 activa cada '+interval+' ms');
}
function getZktecoAutoSyncStatus(){
  return {running,lastRun,lastOk,lastError};
}
module.exports={startZktecoAutoSync,runAutoSync,getZktecoAutoSyncStatus};
