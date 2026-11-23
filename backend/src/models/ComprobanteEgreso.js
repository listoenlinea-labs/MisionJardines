'use strict';
const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('ComprobanteEgreso',{
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 egresoId:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'egreso_id'},
 archivo:{type:DataTypes.STRING(100),allowNull:false},
 nombre:{type:DataTypes.STRING(255),allowNull:false},
 hash:{type:DataTypes.STRING(64),allowNull:false},
 subidoPor:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'subido_por'},
 creadoEn:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW,field:'creado_en'}
},{tableName:'egresos_comprobantes',timestamps:false,indexes:[
 {fields:['egreso_id']},{unique:true,fields:['egreso_id','hash']}
]});