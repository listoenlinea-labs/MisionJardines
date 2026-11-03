'use strict';
const {DataTypes}=require('sequelize');
const db=require('../config/database');
// Abonos de proyectos: cada ingreso es independiente y no altera mantenimiento ni TAGs.
module.exports=db.define('AportacionExtraordinaria',{
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 cuotaExtraordinariaId:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'cuota_extraordinaria_id'},
 cargoExtraordinarioId:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'cargo_extraordinario_id'},
 casaId:{type:DataTypes.INTEGER.UNSIGNED,allowNull:false,field:'casa_id'},
 monto:{type:DataTypes.DECIMAL(12,2),allowNull:false},
 fecha:{type:DataTypes.DATEONLY,allowNull:false},
 referencia:{type:DataTypes.STRING(120),allowNull:false,unique:true},
 formaPago:{type:DataTypes.STRING(30),allowNull:true,field:'forma_pago'},
 origen:{type:DataTypes.STRING(40),allowNull:false,defaultValue:'ADMIN'},
 registradoPor:{type:DataTypes.BIGINT.UNSIGNED,allowNull:true,field:'registrado_por'},
 creadoEn:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW,field:'creado_en'}
},{tableName:'aportaciones_extraordinarias',timestamps:false,
 indexes:[{fields:['cuota_extraordinaria_id','casa_id']},{fields:['cargo_extraordinario_id']}]});
