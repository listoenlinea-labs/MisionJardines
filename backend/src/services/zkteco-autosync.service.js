const {syncUsers}=require('./zkteco-direct.service');

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

// Inventory refresh is explicit (POST /api/zkteco/sincronizar), never periodic.
function startZktecoAutoSync() {}

function getZktecoAutoSyncStatus(){
  return {running,lastRun,lastOk,lastError};
}

module.exports={startZktecoAutoSync,runAutoSync,getZktecoAutoSyncStatus};
