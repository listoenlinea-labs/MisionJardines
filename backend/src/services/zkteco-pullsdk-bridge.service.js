const DEFAULT_TIMEOUT_MS=30000;

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

function safeBridgeTarget(baseUrl,path=''){
  try{
    const u=new URL(baseUrl);
    return u.origin+path;
  }catch(_){
    return '[URL inválida]'+path;
  }
}

function describeFetchError(error){
  const parts=[];
  const push=value=>{
    const text=String(value||'').trim();
    if(text&&!parts.includes(text))parts.push(text);
  };
  push(error?.message);
  push(error?.code);
  push(error?.cause?.code);
  push(error?.cause?.errno);
  push(error?.cause?.syscall);
  push(error?.cause?.hostname);
  push(error?.cause?.message);
  if(!parts.length)push(String(error));
  return parts.join(' · ');
}

async function bridgeFetch(path,{method='POST',body}={}){
  const cfg=getBridgeConfig();
  if(!cfg.baseUrl) throw new Error('ZKTECO_PULLSDK_BRIDGE_URL no está configurado');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),cfg.timeoutMs);
  try{
    const response=await fetch(cfg.baseUrl+path,{
      method,
      headers:{
        ...(body!==undefined?{'Content-Type':'application/json'}:{}),
        ...(cfg.token?{'Authorization':'Bearer '+cfg.token}:{})
      },
      ...(body!==undefined?{body:JSON.stringify(body||{})}:{}),
      signal:controller.signal
    });
    let data={};
    try{data=await response.json()}catch(_){}
    if(!response.ok||data.ok===false){
      if(response.status===404){
        throw new Error(
          'PullSDK bridge: HTTP 404 · el bridge en ejecución está desactualizado o no tiene el endpoint '+path+
          '. Actualiza el repositorio, vuelve a publicar el bridge win-x86 y reinicia ZktecoPullSdkBridge.exe.'
        );
      }
      const detail=data.error||data.message||('HTTP '+response.status);
      throw new Error('PullSDK bridge: '+detail);
    }
    return data;
  }catch(error){
    if(error?.name==='AbortError'){
      const detail=`PullSDK bridge no respondió dentro de ${cfg.timeoutMs} ms`;
      console.error('[ZKTeco PullSDK]',detail,'target=',safeBridgeTarget(cfg.baseUrl,path));
      throw new Error(detail);
    }
    if(String(error?.message||'').startsWith('PullSDK bridge:')){
      console.error('[ZKTeco PullSDK]',error.message,'target=',safeBridgeTarget(cfg.baseUrl,path));
      throw error;
    }
    const detail=describeFetchError(error);
    console.error('[ZKTeco PullSDK] Falló fetch al bridge',{
      target:safeBridgeTarget(cfg.baseUrl,path),
      detail,
      name:error?.name||null,
      code:error?.code||error?.cause?.code||null
    });
    throw new Error('PullSDK bridge: '+detail);
  }finally{
    clearTimeout(timer);
  }
}

async function bridgeRequest(path,body){
  return bridgeFetch(path,{method:'POST',body});
}

async function testBridge(){
  const cfg=getBridgeConfig();
  if(!cfg.baseUrl) return {configured:false,reachable:false,authenticated:false,controller:false};
  try{
    const auth=await bridgeFetch('/health/auth',{method:'GET'});
    const controller=await bridgeFetch('/health/controller',{method:'GET'});
    return {
      configured:true,
      reachable:true,
      authenticated:Boolean(auth?.authenticated),
      controller:Boolean(controller?.controller)
    };
  }catch(error){
    const detail=describeFetchError(error);
    console.error('[ZKTeco PullSDK] Diagnóstico de bridge falló',{
      target:safeBridgeTarget(cfg.baseUrl),
      detail
    });
    return {
      configured:true,
      reachable:false,
      authenticated:false,
      controller:false,
      target:safeBridgeTarget(cfg.baseUrl),
      error:detail
    };
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

async function deleteUser({pin,cardNo}){
  return bridgeRequest('/api/users/delete',{
    pin:String(pin||''),
    cardNo:String(cardNo||'')
  });
}

module.exports={
  getBridgeConfig,
  isPullSdkBridgeConfigured,
  provisionUser,
  setUserValidity,
  deleteUser,
  testBridge,
  describeFetchError
};
