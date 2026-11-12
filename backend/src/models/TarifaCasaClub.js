const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('TarifaCasaClub',{
 id:{type:DataTypes.TINYINT.UNSIGNED,primaryKey:true,allowNull:false,defaultValue:1},
 cuotaRecuperacion:{type:DataTypes.DECIMAL(12,2),allowNull:false,field:'cuota_recuperacion',defaultValue:1000},
 depositoGarantia:{type:DataTypes.DECIMAL(12,2),allowNull:false,field:'deposito_garantia',defaultValue:700},
 limpieza:{type:DataTypes.DECIMAL(12,2),allowNull:false,defaultValue:300},
 actualizadoPor:{type:DataTypes.BIGINT.UNSIGNED,allowNull:true,field:'actualizado_por'},
 actualizadoEn:{type:DataTypes.DATE,allowNull:false,field:'actualizado_en',defaultValue:DataTypes.NOW}
},{tableName:'casa_club_tarifas',timestamps:false});
