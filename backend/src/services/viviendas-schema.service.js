const db=require('../config/database');
const {UsuarioCasa,InvitacionCasa,HistorialVinculo}=require('../models');
async function asegurarViviendas(){
 await UsuarioCasa.sync(); await InvitacionCasa.sync(); await HistorialVinculo.sync();
 // Unique membership rows preserve revocations across restarts. Never reactivate here.
 await db.query(`INSERT IGNORE INTO usuarios_casas
 (usuario_id,casa_id,tipo,activo,vinculado_en)
 SELECT id,casa_id,'MIEMBRO',1,NOW() FROM usuarios WHERE casa_id IS NOT NULL`);
}
module.exports={asegurarViviendas};
