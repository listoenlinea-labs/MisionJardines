const { Op } = require('sequelize');
const db = require('../config/database');
const ZkTarjeta = require('../models/ZkTarjeta');
const Vigencia = require('../models/VigenciaMantenimiento');
const vigente = require('./vigencia-mantenimiento.service');
let running = false;
let lastScan = 0;

// This is opt-in because a bulk cutoff of every unpaid residence is a
// sensitive physical-access change. By default payments only update homes
// whose baseline is created upon their first confirmed payment.
async function prepararCortesOctubre(){
  if(process.env.ZKTECO_ENFORCE_OCTOBER_CUTOFF!=='true')return {enabled:false};
  if(process.env.ZKTECO_DRY_RUN!=='false'){
    console.warn('[C3] Corte inicial de casas sin pago omitido: configura ZKTECO_DRY_RUN=false después de verificar vínculos.');
    return {enabled:true,waitingForWrites:true};
  }
  const now=Date.now();
  if(running || now-lastScan<15*60*1000)return {skipped:true};
  running=true;
  lastScan=now;
  const result={created:0,existing:0,errors:[]};
  try{
    const cards=await ZkTarjeta.findAll({
      where:{enControlador:true,casaId:{[Op.ne]:null}},
      attributes:['casaId'],raw:true
    });
    const ids=[...new Set(cards.map(c=>Number(c.casaId)).filter(Number.isSafeInteger))];
    for(const id of ids){
      try{
        await db.transaction({isolationLevel:'READ COMMITTED'},async transaction=>{
          // actualizar() locks direcciones first and is idempotent with payments.
          const existing=await Vigencia.findByPk(id,{transaction});
          if(existing){result.existing++;return;}
          await vigente.actualizar(id,null,transaction);
          result.created++;
        });
      }catch(e){result.errors.push({casaId:id,error:e.message});}
    }
  }finally{running=false;}
  if(result.errors.length)console.warn('[C3] Cortes iniciales pendientes:',result.errors.length);
  return result;
}
module.exports={prepararCortesOctubre};
