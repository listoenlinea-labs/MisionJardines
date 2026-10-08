const Egreso=require('../models/Egreso');
async function asegurarFinanzas(){await Egreso.sync();}
module.exports={asegurarFinanzas};