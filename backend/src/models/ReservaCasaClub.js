const { DataTypes } = require('sequelize');
const db = require('../config/database');
const ReservaCasaClub = db.define('ReservaCasaClub', {
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 usuarioId:{type:DataTypes.BIGINT.UNSIGNED,allowNull:false,field:'usuario_id'},
 casaId:{type:DataTypes.INTEGER.UNSIGNED,allowNull:false,field:'casa_id'},
 fecha:{type:DataTypes.DATEONLY,allowNull:false},
 fechaBloqueada:{type:DataTypes.DATEONLY,allowNull:true,unique:true,field:'fecha_bloqueada'},
 solicitante:{type:DataTypes.STRING(180),allowNull:false},
 telefono:{type:DataTypes.STRING(25),allowNull:false},
 correo:{type:DataTypes.STRING(150),allowNull:false},
 propietario:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:false},
 motivo:{type:DataTypes.STRING(200),allowNull:false},
 estatus:{type:DataTypes.ENUM('PENDIENTE','APROBADA','RECHAZADA','CANCELADA'),allowNull:false,defaultValue:'PENDIENTE'},
 cuotaRecuperacion:{type:DataTypes.DECIMAL(12,2),allowNull:false,defaultValue:0,field:'cuota_recuperacion'},
 depositoGarantia:{type:DataTypes.DECIMAL(12,2),allowNull:false,defaultValue:0,field:'deposito_garantia'},
 garantiaDevuelta:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:false,field:'garantia_devuelta'},
 limpieza:{type:DataTypes.DECIMAL(12,2),allowNull:false,defaultValue:0},
 pagado:{type:DataTypes.BOOLEAN,allowNull:false,defaultValue:false},
 fechaPago:{type:DataTypes.DATEONLY,allowNull:true,field:'fecha_pago'},
 folio:{type:DataTypes.STRING(60),allowNull:true},
 notas:{type:DataTypes.STRING(600),allowNull:true},
 revisadoPor:{type:DataTypes.BIGINT.UNSIGNED,allowNull:true,field:'revisado_por'},
 creadoEn:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW,field:'creado_en'},
 actualizadoEn:{type:DataTypes.DATE,allowNull:false,defaultValue:DataTypes.NOW,field:'actualizado_en'}
}, {tableName:'reservas_casa_club',timestamps:false,indexes:[{fields:['casa_id','fecha']},{fields:['estatus','fecha']}]});
module.exports=ReservaCasaClub;
