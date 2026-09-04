const Casa = require('./Casa');
const Rol = require('./Rol');
const Usuario = require('./Usuario');
const Cuota = require('./Cuota');
const FolioConsecutivo = require('./FolioConsecutivo');
const Evento = require('./Evento');
const Condomino = require('./Condomino');
const Acceso = require('./Acceso');

/*
 * Casa 1 --- N Usuarios
 *
 * IMPORTANTE:
 * Casa utiliza físicamente la tabla "direcciones".
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
 * Rol 1 --- N Usuarios
 */
Rol.hasMany(Usuario, {
    foreignKey: 'rolId',
    as: 'usuarios'
});

Usuario.belongsTo(Rol, {
    foreignKey: 'rolId',
    as: 'rol'
});

/*
 * Casa 1 --- N Cuotas
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
 * Casa 1 --- N Condóminos registrados en el padrón
 */
Casa.hasMany(Condomino, {
    foreignKey: 'direccionId',
    as: 'condominos'
});

Condomino.belongsTo(Casa, {
    foreignKey: 'direccionId',
    as: 'casa'
});

/*
 * Usuario 1 --- N Cuotas confirmadas
 */
Usuario.hasMany(Cuota, {
    foreignKey: 'confirmadoPorUsuarioId',
    as: 'cuotasConfirmadas'
});

Cuota.belongsTo(Usuario, {
    foreignKey: 'confirmadoPorUsuarioId',
    as: 'confirmadoPor'
});

/*
 * Casa 1 --- N Accesos de seguridad
 */
Casa.hasMany(Acceso, {
    foreignKey: 'casaId',
    as: 'accesos'
});

Acceso.belongsTo(Casa, {
    foreignKey: 'casaId',
    as: 'casa'
});

Usuario.hasMany(Acceso, {
    foreignKey: 'registradoPorUsuarioId',
    as: 'accesosRegistrados'
});

Acceso.belongsTo(Usuario, {
    foreignKey: 'registradoPorUsuarioId',
    as: 'registradoPor'
});

module.exports = {
    Casa,
    Rol,
    Usuario,
    Cuota,
    FolioConsecutivo,
    Evento,
    Condomino,
    Acceso
};
