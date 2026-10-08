const ReservaCasaClub=require('../models/ReservaCasaClub');
async function asegurarCasaClub(){await ReservaCasaClub.sync();}
module.exports={asegurarCasaClub};
