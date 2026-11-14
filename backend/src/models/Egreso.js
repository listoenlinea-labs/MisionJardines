const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('Egreso',{
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 fecha:{type:DataTypes.DATEONLY,allowNull:false},
 categoria:{type:DataTypes.ENUM('LUZ','AGUA','JARDINERIA','MANTENIMIENTO','CUOTA_EXTRAORDINARIA','OTROS','PROYECTOS','CFE','SIAPA','INTERNET','SERVICIOS','PROYECTO'),allowNull:false},
 concepto:{type:DataTypes.STRING(250),allowNull:false},
 monto:{type:DataTypes.DECIMAL(12,2),allowNull:false},
 referencia:{type:DataTypes.STRING(120),allowNull:true},
 ambito:{type:DataTypes.ENUM('MANTENIMIENTO','EXTRAORDINARIO','CASA_CLUB'),allowNull:false,defaultValue:'MANTENIMIENTO'},
 proyectoId:{type:DataTypes.BIGINT.UNSIGNED,allowNull:true,field:'proyecto_id'},
 comprobanteArchivo:{type:DataTypes.STRING(100),allowNull:true,field:'comprobante_archivo'},
 incluidoPresupuesto:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:true,field:'incluido_presupuesto'},
 registradoPor:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'registrado_por'},
 creadoEn:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW,field:'creado_en'}
},{tableName:'egresos_fraccionamiento',timestamps:false,indexes:[{fields:['fecha','categoria']}]});
