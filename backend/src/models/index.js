const Casa = require('./Casa');
const Rol = require('./Rol');
const Usuario = require('./Usuario');
const Cuota = require('./Cuota');
const FolioConsecutivo = require('./FolioConsecutivo');
const Calle = require('./Calle');
const Evento = require('./Evento');

/*
 * Casa 1 ─── N Usuarios
 */
Casa.hasMany(Usuario, {
    foreignKey: 'casaId',
    as: 'usuarios'
});

Usuario.belongsTo(Casa, {
    foreignKey: 'casaId',
    as: 'casa'
});

/*
 * Rol 1 ─── N Usuarios
 */
Rol.hasMany(Usuario, {
    foreignKey: 'rolId',
    as: 'usuarios'
});
/*
 * Calle 1 ─── N Casas
 */
Calle.hasMany(Casa, {
    foreignKey: 'calleId',
    as: 'casas'
});

Casa.belongsTo(Calle, {
    foreignKey: 'calleId',
    as: 'calleRelacion'
});
Usuario.belongsTo(Rol, {
    foreignKey: 'rolId',
    as: 'rol'
});

/*
 * Casa 1 ─── N Cuotas
 */
Casa.hasMany(Cuota, {
    foreignKey: 'casaId',
    as: 'cuotas'
});

Cuota.belongsTo(Casa, {
    foreignKey: 'casaId',
    as: 'casa'
});

/*
 * Usuario confirma muchas cuotas.
 */
Usuario.hasMany(Cuota, {
    foreignKey: 'confirmadoPorUsuarioId',
    as: 'cuotasConfirmadas'
});

Cuota.belongsTo(Usuario, {
    foreignKey: 'confirmadoPorUsuarioId',
    as: 'confirmadoPor'
});

module.exports = {
    Calle,
    Casa,
    Rol,
    Usuario,
    Cuota,
    FolioConsecutivo,
    Evento
};
