const ReservaCasaClub=require('../models/ReservaCasaClub');
async function asegurarCasaClub(){
 await ReservaCasaClub.sync();
 const db=require('../config/database');
 const {DataTypes}=require('sequelize');
 const qi=db.getQueryInterface(),cols=await qi.describeTable('reservas_casa_club');
 if(!cols.fecha_limite_pago)await qi.addColumn('reservas_casa_club','fecha_limite_pago',{type:DataTypes.DATEONLY,allowNull:true});
}
module.exports={asegurarCasaClub};
