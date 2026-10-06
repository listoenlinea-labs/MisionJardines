const DEFAULT_TIMEOUT_MS=15000;

function getBridgeConfig(){
  const baseUrl=String(process.env.ZKTECO_PULLSDK_BRIDGE_URL||'').trim().replace(/\/$/,'');
  return {
    baseUrl,
    token:String(process.env.ZKTECO_PULLSDK_BRIDGE_TOKEN||'').trim(),
    timeoutMs:Math.max(3000,Number(process.env.ZKTECO_PULLSDK_BRIDGE_TIMEOUT_MS||DEFAULT_TIMEOUT_MS))
  };
}

function isPullSdkBridgeConfigured(){
  return Boolean(getBridgeConfig().baseUrl);
}

async function bridgeRequest(path,body){
  const cfg=getBridgeConfig();
  if(!cfg.baseUrl) throw new Error('ZKTECO_PULLSDK_BRIDGE_URL no está configurado');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),cfg.timeoutMs);
  try{
    const response=await fetch(cfg.baseUrl+path,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        ...(cfg.token?{'Authorization':'Bearer '+cfg.token}:{})
      },
      body:JSON.stringify(body||{}),
      signal:controller.signal
    });
    let data={};
    try{data=await response.json()}catch(_){}
    if(!response.ok||data.ok===false){
      const detail=data.error||data.message||('HTTP '+response.status);
      throw new Error('PullSDK bridge: '+detail);
    }
    return data;
  }catch(error){
    if(error?.name==='AbortError') throw new Error('PullSDK bridge no respondió dentro del tiempo esperado');
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

async function provisionUser({cardNo,pin,name,startDate,endDate,doorMask=3,timezoneId=1}){
  return bridgeRequest('/api/users',{
    cardNo:String(cardNo),
    pin:String(pin),
    name:String(name||'').slice(0,24),
    startDate:startDate||null,
    endDate:endDate||null,
    doorMask:Number(doorMask||3),
    timezoneId:Number(timezoneId||1)
  });
}

async function setUserValidity({pin,cardNo,startDate,endDate}){
  return bridgeRequest('/api/users/validity',{
    pin:String(pin||''),
    cardNo:String(cardNo||''),
    startDate:startDate||null,
    endDate:endDate||null
  });
}

module.exports={
  getBridgeConfig,
  isPullSdkBridgeConfigured,
  provisionUser,
  setUserValidity
};
