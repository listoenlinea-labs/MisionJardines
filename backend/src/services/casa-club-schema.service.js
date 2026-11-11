const ReservaCasaClub=require('../models/ReservaCasaClub');
const TarifaCasaClub=require('../models/TarifaCasaClub');
async function asegurarCasaClub(){
 await ReservaCasaClub.sync();
 // Configuración central; las reservas anteriores conservan sus importes.
 await TarifaCasaClub.sync();
 await TarifaCasaClub.findOrCreate({where:{id:1},defaults:{id:1,cuotaRecuperacion:700,depositoGarantia:700,limpieza:600}});
 const db=require('../config/database');
 const {DataTypes}=require('sequelize');
 const qi=db.getQueryInterface(),cols=await qi.describeTable('reservas_casa_club');
 if(!cols.fecha_limite_pago)await qi.addColumn('reservas_casa_club','fecha_limite_pago',{type:DataTypes.DATEONLY,allowNull:true});
 if(cols.usuario_id?.allowNull===false)await qi.changeColumn('reservas_casa_club','usuario_id',{type:DataTypes.BIGINT.UNSIGNED,allowNull:true});
}
module.exports={asegurarCasaClub};
