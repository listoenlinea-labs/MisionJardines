const ZkTarjeta=require('../models/ZkTarjeta');
async function asegurarEsquemaZkteco(){await ZkTarjeta.sync();}
module.exports={asegurarEsquemaZkteco};
