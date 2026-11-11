'use strict';
const {DataTypes}=require('sequelize');
const db=require('../config/database');
// Token sólo en forma hash; nunca guardar el enlace ni el secreto sin cifrar.
module.exports=db.define('RecuperacionContrasena',{
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 usuarioId:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'usuario_id'},
 tokenHash:{type:DataTypes.STRING(64),allowNull:false,unique:true,field:'token_hash'},
 venceEn:{type:DataTypes.DATE,allowNull:false,field:'vence_en'},
 utilizadoEn:{type:DataTypes.DATE,allowNull:true,field:'utilizado_en'},
 creadoEn:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW,field:'creado_en'}
},{tableName:'recuperaciones_contrasena',timestamps:false,indexes:[{fields:['usuario_id','vence_en']}]});
