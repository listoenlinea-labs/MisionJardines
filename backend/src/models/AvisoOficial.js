'use strict';
const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('AvisoOficial',{
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 titulo:{type:DataTypes.STRING(100),allowNull:false},
 resumen:{type:DataTypes.STRING(300),allowNull:true},
 contenido:{type:DataTypes.TEXT,allowNull:false},
 imagenData:{type:DataTypes.TEXT('medium'),allowNull:true,field:'imagen_data'},
 publicadoPor:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'publicado_por'},
 creadoEn:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW,field:'creado_en'},
 expiraEn:{type:DataTypes.DATE,allowNull:false,field:'expira_en'}
},{tableName:'avisos_oficiales',timestamps:false,indexes:[{fields:['expira_en']}]});
