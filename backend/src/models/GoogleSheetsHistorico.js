'use strict';
const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('GoogleSheetsHistorico',{
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 spreadsheetId:{type:DataTypes.STRING(120),allowNull:false,field:'spreadsheet_id'},
 tipo:{type:DataTypes.ENUM('pagos','ingresos','egresos'),allowNull:false},
 fila:{type:DataTypes.INTEGER.UNSIGNED,allowNull:false},
 encabezados:{type:DataTypes.JSON,allowNull:false},
 valores:{type:DataTypes.JSON,allowNull:false},
 hash:{type:DataTypes.STRING(64),allowNull:false},
 estado:{type:DataTypes.ENUM('PENDIENTE_REVISION','REVISADO'),defaultValue:'PENDIENTE_REVISION',allowNull:false},
 creadoEn:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW,field:'creado_en'}
},{tableName:'google_sheets_historico',timestamps:false,indexes:[
 {unique:true,name:'uq_sheets_hist_origen',fields:['spreadsheet_id','tipo','fila']}
]});
