const ReservaCasaClub=require('../models/ReservaCasaClub');
const TarifaCasaClub=require('../models/TarifaCasaClub');
async function asegurarCasaClub(){
 await ReservaCasaClub.sync();
 // La homologación única respalda importes anteriores y aplica la tarifa aprobada.
 await TarifaCasaClub.sync();
 await TarifaCasaClub.findOrCreate({where:{id:1},defaults:{id:1,cuotaRecuperacion:1000,depositoGarantia:700,limpieza:300}});
 const db=require('../config/database');
 const {DataTypes}=require('sequelize');
 const qi=db.getQueryInterface(),cols=await qi.describeTable('reservas_casa_club');
 if(!cols.fecha_limite_pago)await qi.addColumn('reservas_casa_club','fecha_limite_pago',{type:DataTypes.DATEONLY,allowNull:true});
 if(cols.usuario_id?.allowNull===false)await qi.changeColumn('reservas_casa_club','usuario_id',{type:DataTypes.BIGINT.UNSIGNED,allowNull:true});
 await require('./casa-club-homologar-importes.service').homologar();
}
module.exports={asegurarCasaClub};
