const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('HistorialVinculo',{
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 usuarioId:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'usuario_id'},
 casaId:{type:DataTypes.INTEGER.UNSIGNED,allowNull:false,field:'casa_id'},
 actorId:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'actor_id'},
 accion:{type:DataTypes.STRING(40),allowNull:false},
 tipo:{type:DataTypes.STRING(20),allowNull:false},
 creadoEn:{type:DataTypes.DATE,defaultValue:DataTypes.NOW,allowNull:false,field:'creado_en'}
},{tableName:'historial_vinculos',timestamps:false});
