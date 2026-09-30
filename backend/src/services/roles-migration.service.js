const sequelize = require('../config/database');
const { Usuario, Rol } = require('../models');

async function aplicarMigracionRoles() {
    await sequelize.query(`CREATE TABLE IF NOT EXISTS app_migrations (
        nombre VARCHAR(150) PRIMARY KEY,
        usuario_id BIGINT UNSIGNED NULL,
        aplicado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await sequelize.transaction(async transaction => {
        const [done] = await sequelize.query('SELECT nombre FROM app_migrations WHERE nombre = :nombre', {
            replacements: { nombre: '20260930_admin_vladiir' }, transaction
        });
        if (done.length) return;
        const usuario = await Usuario.findOne({where:{correo:'vladiir.rod96@gmail.com'},transaction,lock:transaction.LOCK.UPDATE});
        if (!usuario) {
            console.warn('Migración de roles pendiente: no existe la cuenta solicitada.');
            return;
        }
        const [rol] = await Rol.findOrCreate({where:{nombre:'SUPER_ADMIN'},defaults:{descripcion:'Acceso completo',activo:true},transaction});
        if (!rol.activo) throw new Error('El rol SUPER_ADMIN está inactivo');
        await usuario.update({rolId:rol.id,actualizadoEn:new Date()}, {transaction});
        await sequelize.query('INSERT INTO app_migrations (nombre,usuario_id) VALUES (:nombre,:usuarioId)', {
            replacements:{nombre:'20260930_admin_vladiir',usuarioId:usuario.id},transaction
        });
    });
}
module.exports = { aplicarMigracionRoles };
