const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('Egreso',{
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 fecha:{type:DataTypes.DATEONLY,allowNull:false},
 categoria:{type:DataTypes.ENUM('LUZ','AGUA','JARDINERIA','MANTENIMIENTO','PROYECTOS','OTROS'),allowNull:false},
 concepto:{type:DataTypes.STRING(250),allowNull:false},
 monto:{type:DataTypes.DECIMAL(12,2),allowNull:false},
 referencia:{type:DataTypes.STRING(120),allowNull:true},
 registradoPor:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'registrado_por'},
 creadoEn:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW,field:'creado_en'}
},{tableName:'egresos_fraccionamiento',timestamps:false,indexes:[{fields:['fecha','categoria']}]});
