const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('UsuarioCasa',{
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 usuarioId:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'usuario_id'},
 casaId:{type:DataTypes.INTEGER.UNSIGNED,allowNull:false,field:'casa_id'},
 tipo:{type:DataTypes.ENUM('RESPONSABLE','MIEMBRO'),allowNull:false,defaultValue:'MIEMBRO'},
 activo:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:true},
 vinculadoEn:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW,field:'vinculado_en'},
 desvinculadoEn:{type:DataTypes.DATE,field:'desvinculado_en'}
},{tableName:'usuarios_casas',timestamps:false,indexes:[{unique:true,fields:['usuario_id','casa_id']}]});
