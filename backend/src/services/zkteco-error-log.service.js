const ZkErrorLog=require('../models/ZkErrorLog');

function exactError(error){
  const parts=[];
  const push=value=>{
    const text=String(value??'').trim();
    if(text&&!parts.includes(text))parts.push(text);
  };
  push(error?.message);
  push(error?.cause?.message);
  push(error?.code);
  push(error?.cause?.code);
  if(!parts.length)push(String(error||'Error desconocido'));
  return parts.join(' · ');
}

async function recordZkError(req,accion,error,meta={}){
  try{
    return await ZkErrorLog.create({
      accion:String(accion||'ERROR_ZKTECO').slice(0,80),
      metodo:String(req?.method||'').slice(0,12)||null,
      ruta:String(req?.originalUrl||req?.url||'').slice(0,255)||null,
      tarjetaId:Number(meta.tarjetaId||req?.params?.id||0)||null,
      numeroTarjeta:meta.numeroTarjeta?String(meta.numeroTarjeta).slice(0,80):null,
      casaId:Number(meta.casaId||req?.params?.casaId||0)||null,
      usuarioId:Number(req?.usuario?.usuarioId||0)||null,
      error:exactError(error),
      detalle:meta.detalle?String(meta.detalle).slice(0,4000):null,
      createdAt:new Date()
    });
  }catch(logError){
    console.error('[ZKTeco logs] No fue posible guardar el error:',logError.message);
    return null;
  }
}

async function listZkErrors({limit}={}){
  const requested=Number(limit);
  const options={order:[['createdAt','DESC'],['id','DESC']]};
  if(Number.isFinite(requested)&&requested>0) options.limit=Math.min(2000,Math.max(1,Math.trunc(requested)));
  return ZkErrorLog.findAll(options);
}

module.exports={recordZkError,listZkErrors,exactError};
