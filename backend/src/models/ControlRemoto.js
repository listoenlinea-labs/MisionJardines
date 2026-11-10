'use strict';
const { DataTypes } = require('sequelize');
const db = require('../config/database');
// Inventario independiente del C3-200 y de las tablas de pagos.
const ControlRemoto = db.define('ControlRemotoMJ', {
  id:{type:DataTypes.INTEGER.UNSIGNED,primaryKey:true,autoIncrement:true},
  casaId:{type:DataTypes.INTEGER.UNSIGNED,allowNull:false,field:'casa_id'},
  codigo:{type:DataTypes.STRING(80),allowNull:false,unique:true},
  descripcion:{type:DataTypes.STRING(160),allowNull:true},
  botones:{type:DataTypes.JSON,allowNull:false,defaultValue:{}},
  activo:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:true},
  fechaFin:{type:DataTypes.DATEONLY,allowNull:true,field:'fecha_fin'},
  creadoPor:{type:DataTypes.INTEGER.UNSIGNED,allowNull:true,field:'creado_por'},
  actualizadoPor:{type:DataTypes.INTEGER.UNSIGNED,allowNull:true,field:'actualizado_por'},
  createdAt:{type:DataTypes.DATE,allowNull:false,field:'created_at'},
  updatedAt:{type:DataTypes.DATE,allowNull:false,field:'updated_at'}
},{tableName:'controles_remotos_mj',timestamps:true,indexes:[{fields:['casa_id']}]});
module.exports=ControlRemoto;
