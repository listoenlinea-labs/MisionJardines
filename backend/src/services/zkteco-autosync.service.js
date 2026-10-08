const {syncUsers}=require('./zkteco-direct.service');

let timer=null;
let running=false;
let lastRun=null;
let lastOk=null;
let lastError=null;

async function runAutoSync(){
  if(running)return;
  running=true;
  try{
    const result=await syncUsers();
    lastRun=new Date();
    lastOk=result;
    lastError=null;
  }catch(error){
    lastRun=new Date();
    lastError=error.message;
    console.error('ZKTeco autosync error:',error.message);
  }finally{
    running=false;
  }
}

function startZktecoAutoSync(){
  const enabled=String(process.env.ZKTECO_AUTOSYNC_ENABLED??'true').toLowerCase()!=='false';
  if(!enabled)return;
  const interval=Math.max(15000,Number(process.env.ZKTECO_AUTOSYNC_MS||30000));
  setTimeout(runAutoSync,3000);
  timer=setInterval(runAutoSync,interval);
  timer.unref?.();
  console.log(`ZKTeco autosync activo cada ${interval} ms`);
}

function getZktecoAutoSyncStatus(){
  return {running,lastRun,lastOk,lastError};
}

module.exports={startZktecoAutoSync,runAutoSync,getZktecoAutoSyncStatus};
