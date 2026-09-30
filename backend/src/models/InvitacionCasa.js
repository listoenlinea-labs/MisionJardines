const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('InvitacionCasa',{
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 casaId:{type:DataTypes.INTEGER.UNSIGNED,allowNull:false,field:'casa_id'},
 correo:{type:DataTypes.STRING(150),allowNull:false},
 tipo:{type:DataTypes.ENUM('RESPONSABLE','MIEMBRO'),allowNull:false,defaultValue:'MIEMBRO'},
 tokenHash:{type:DataTypes.STRING(64),allowNull:false,unique:true,field:'token_hash'},
 creadoPor:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'creado_por'},
 creadoEn:{type:DataTypes.DATE,defaultValue:DataTypes.NOW,allowNull:false,field:'creado_en'},
 expiraEn:{type:DataTypes.DATE,allowNull:false,field:'expira_en'},
 aceptadoEn:{type:DataTypes.DATE,field:'aceptado_en'},
 revocadoEn:{type:DataTypes.DATE,field:'revocado_en'}
},{tableName:'invitaciones_casa',timestamps:false});
