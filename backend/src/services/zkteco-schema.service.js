const ZkTarjeta=require('../models/ZkTarjeta');
const ZkGateCommand=require('../models/ZkGateCommand');
const ZkGatewayState=require('../models/ZkGatewayState');

async function asegurarEsquemaZkteco(){
  await ZkTarjeta.sync();
  await ZkGateCommand.sync();
  await ZkGatewayState.sync();
}

module.exports={asegurarEsquemaZkteco};
