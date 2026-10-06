const ZkTarjeta=require('../models/ZkTarjeta');
const ZkGateCommand=require('../models/ZkGateCommand');
const ZkGatewayState=require('../models/ZkGatewayState');
const ZkAccessCommand=require('../models/ZkAccessCommand');

async function asegurarEsquemaZkteco(){
  await ZkTarjeta.sync();
  await ZkGateCommand.sync();
  await ZkGatewayState.sync();
  await ZkAccessCommand.sync();
}

module.exports={asegurarEsquemaZkteco};
