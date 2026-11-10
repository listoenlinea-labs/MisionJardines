'use strict';
const { DataTypes }=require('sequelize');
const db=require('../config/database');
module.exports=db.define('ControlRemotoEventoMJ',{
 id:{type:DataTypes.INTEGER.UNSIGNED,primaryKey:true,autoIncrement:true},
 controlId:{type:DataTypes.INTEGER.UNSIGNED,allowNull:true,field:'control_id'},
 casaId:{type:DataTypes.INTEGER.UNSIGNED,allowNull:true,field:'casa_id'},
 accion:{type:DataTypes.STRING(45),allowNull:false},
 detalle:{type:DataTypes.TEXT,allowNull:true},
 actorId:{type:DataTypes.INTEGER.UNSIGNED,allowNull:true,field:'actor_id'},
 createdAt:{type:DataTypes.DATE,allowNull:false,field:'created_at'}
},{tableName:'controles_remotos_eventos_mj',timestamps:false,indexes:[{fields:['control_id']},{fields:['created_at']}]});
