'use strict';
const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('ConfiguracionTarjetasRojas',{
 id:{type:DataTypes.TINYINT.UNSIGNED,primaryKey:true,allowNull:false,defaultValue:1},
 aniosBloqueo:{type:DataTypes.INTEGER.UNSIGNED,allowNull:false,field:'anios_bloqueo',defaultValue:1},
 actualizadoPor:{type:DataTypes.BIGINT.UNSIGNED,allowNull:true,field:'actualizado_por'},
 actualizadoEn:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW,field:'actualizado_en'}
},{tableName:'casa_club_sanciones_config',timestamps:false});
