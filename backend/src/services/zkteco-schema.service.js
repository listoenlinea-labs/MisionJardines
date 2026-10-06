const ZkTarjeta=require('../models/ZkTarjeta');
const ZkGateCommand=require('../models/ZkGateCommand');
const ZkGatewayState=require('../models/ZkGatewayState');
const ZkAccessCommand=require('../models/ZkAccessCommand');

async function asegurarEsquemaZkteco(){
  await ZkTarjeta.sync();
  await ZkGateCommand.sync();
  await ZkGatewayState.sync();
  await ZkAccessCommand.sync();
  const qi=ZkTarjeta.sequelize.getQueryInterface();
  const desc=await qi.describeTable('zk_tarjetas');
  if(!desc.fecha_fin_original) await qi.addColumn('zk_tarjetas','fecha_fin_original',{type:require('sequelize').DataTypes.DATEONLY,allowNull:true});
  if(!desc.bloqueado) await qi.addColumn('zk_tarjetas','bloqueado',{type:require('sequelize').DataTypes.BOOLEAN,allowNull:false,defaultValue:false});
}

module.exports={asegurarEsquemaZkteco};
