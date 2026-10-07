const { DataTypes }=require('sequelize');
const ZkTarjeta=require('../models/ZkTarjeta');
const ZkErrorLog=require('../models/ZkErrorLog');

async function asegurarEsquemaZkteco(){
  await ZkTarjeta.sync();
  await ZkErrorLog.sync();
  const qi=ZkTarjeta.sequelize.getQueryInterface();
  const desc=await qi.describeTable('zk_tarjetas');
  const add=async(name,definition)=>{if(!desc[name]) await qi.addColumn('zk_tarjetas',name,definition);};
  await add('fecha_fin_original',{type:DataTypes.DATEONLY,allowNull:true});
  await add('bloqueado',{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:false});
  await add('uid_dispositivo',{type:DataTypes.INTEGER.UNSIGNED,allowNull:true});
  await add('nombre_dispositivo',{type:DataTypes.STRING(150),allowNull:true});
  await add('departamento_id',{type:DataTypes.INTEGER.UNSIGNED,allowNull:true});
  await add('grupo_dispositivo',{type:DataTypes.INTEGER.UNSIGNED,allowNull:true});
  await add('puertas_autorizadas',{type:DataTypes.INTEGER.UNSIGNED,allowNull:true});
  await add('timezone_id',{type:DataTypes.INTEGER.UNSIGNED,allowNull:true});
  await add('origen',{type:DataTypes.ENUM('ZKTECO','APP'),allowNull:false,defaultValue:'ZKTECO'});
  await add('en_controlador',{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:false});
}

module.exports={asegurarEsquemaZkteco};
