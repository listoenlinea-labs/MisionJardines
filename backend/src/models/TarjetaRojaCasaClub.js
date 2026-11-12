'use strict';
const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('TarjetaRojaCasaClub',{
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 casaId:{type:DataTypes.INTEGER.UNSIGNED,allowNull:false,field:'casa_id'},
 motivo:{type:DataTypes.STRING(500),allowNull:false},
 asignadaPor:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'asignada_por'},
 asignadaEn:{type:DataTypes.DATE,allowNull:false,field:'asignada_en',defaultValue:DataTypes.NOW},
 retiradaPor:{type:DataTypes.BIGINT.UNSIGNED,allowNull:true,field:'retirada_por'},
 retiradaEn:{type:DataTypes.DATE,allowNull:true,field:'retirada_en'},
 motivoRetiro:{type:DataTypes.STRING(500),allowNull:true,field:'motivo_retiro'}
},{tableName:'casa_club_tarjetas_rojas',timestamps:false,indexes:[
 {fields:['casa_id','retirada_en']},{fields:['asignada_en']}
]});
