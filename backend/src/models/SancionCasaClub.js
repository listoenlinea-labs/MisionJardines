'use strict';
const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('SancionCasaClub',{
 casaId:{type:DataTypes.INTEGER.UNSIGNED,primaryKey:true,allowNull:false,field:'casa_id'},
 bloqueadoDesde:{type:DataTypes.DATEONLY,allowNull:true,field:'bloqueado_desde'},
 bloqueadoHasta:{type:DataTypes.DATEONLY,allowNull:true,field:'bloqueado_hasta'},
 actualizadoEn:{type:DataTypes.DATE,allowNull:false,field:'actualizado_en',defaultValue:DataTypes.NOW}
},{tableName:'casa_club_sanciones',timestamps:false});
