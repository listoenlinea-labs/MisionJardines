const { DataTypes }=require('sequelize');
const ZkTarjeta=require('../models/ZkTarjeta');

async function asegurarEsquemaZkteco(){
  await ZkTarjeta.sync();
  const qi=ZkTarjeta.sequelize.getQueryInterface();
  const desc=await qi.describeTable('zk_tarjetas');
  if(!desc.fecha_fin_original) await qi.addColumn('zk_tarjetas','fecha_fin_original',{type:DataTypes.DATEONLY,allowNull:true});
  if(!desc.bloqueado) await qi.addColumn('zk_tarjetas','bloqueado',{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:false});
}

module.exports={asegurarEsquemaZkteco};
