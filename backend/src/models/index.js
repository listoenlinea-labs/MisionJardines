const Casa = require('./Casa');
const Rol = require('./Rol');
const Usuario = require('./Usuario');
const Cuota = require('./Cuota');
const FolioConsecutivo = require('./FolioConsecutivo');
const Evento = require('./Evento');
const Condomino = require('./Condomino');
const CondominoVivienda = require('./CondominoVivienda');
const Acceso = require('./Acceso');
const PermisoAcceso = require('./PermisoAcceso');
const Visita = require('./Visita');
const VerificacionCuenta = require('./VerificacionCuenta');
const SolicitudRol = require('./SolicitudRol');
const SolicitudCuenta = require('./SolicitudCuenta');
const PagoReportado = require('./PagoReportado');
const ConfiguracionConexion = require('./ConfiguracionConexion');
const CuotaExtraordinaria = require('./CuotaExtraordinaria');
const CargoExtraordinario = require('./CargoExtraordinario');
const ZkTarjeta = require('./ZkTarjeta');
const PagoManualConcepto = require('./PagoManualConcepto');

/*
 * Casa 1 --- N Usuarios
 *
 * IMPORTANTE:
 * Casa utiliza físicamente la tabla "direcciones".
 */
Casa.hasMany(Usuario, {
    foreignKey: 'casaId',
    as: 'usuariosLegado'
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
 * Casa N --- N Condóminos; casa/direccionId se conserva solo por compatibilidad
 */
Casa.belongsToMany(Condomino, {
    through: CondominoVivienda, onDelete: 'RESTRICT', onUpdate: 'CASCADE', foreignKey: 'viviendaId', otherKey: 'condominoId', as: 'condominos'
});
Condomino.belongsToMany(Casa, {
    through: CondominoVivienda, onDelete: 'RESTRICT', onUpdate: 'CASCADE', foreignKey: 'condominoId', otherKey: 'viviendaId', as: 'viviendas'
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

/*
 * Casa 1 --- 1 Configuración de accesos físicos
 */
Casa.hasOne(PermisoAcceso, {
    foreignKey: 'casaId',
    as: 'permisosAcceso'
});

PermisoAcceso.belongsTo(Casa, {
    foreignKey: 'casaId',
    as: 'casa'
});

/*
 * Casa 1 --- N Visitas programadas
 */
Casa.hasMany(Visita, {
    foreignKey: 'casaId',
    as: 'visitasProgramadas'
});

Visita.belongsTo(Casa, {
    foreignKey: 'casaId',
    as: 'casa'
});

Usuario.hasMany(SolicitudRol, {
    foreignKey: 'usuarioId',
    as: 'solicitudesRol'
});

SolicitudRol.belongsTo(Usuario, {
    foreignKey: 'usuarioId',
    as: 'usuario'
});

SolicitudRol.belongsTo(Usuario, {
    foreignKey: 'revisadoPorUsuarioId',
    as: 'revisadoPor'
});

Usuario.hasMany(VerificacionCuenta, {
    foreignKey: 'usuarioId',
    as: 'verificacionesCuenta'
});

VerificacionCuenta.belongsTo(Usuario, {
    foreignKey: 'usuarioId',
    as: 'usuario'
});

Casa.hasMany(VerificacionCuenta, {
    foreignKey: 'casaId',
    as: 'verificacionesCuenta'
});

VerificacionCuenta.belongsTo(Casa, {
    foreignKey: 'casaId',
    as: 'casa'
});

/*
 * Pagos reportados por residentes
 */
Casa.hasMany(PagoReportado, {
    foreignKey: 'casaId',
    as: 'pagosReportados'
});

PagoReportado.belongsTo(Casa, {
    foreignKey: 'casaId',
    as: 'casa'
});

Usuario.hasMany(PagoReportado, {
    foreignKey: 'usuarioId',
    as: 'pagosReportados'
});

PagoReportado.belongsTo(Usuario, {
    foreignKey: 'usuarioId',
    as: 'usuario'
});

PagoReportado.belongsTo(Usuario, {
    foreignKey: 'validadoPorUsuarioId',
    as: 'validadoPor'
});

CuotaExtraordinaria.hasMany(PagoReportado, {
    foreignKey: 'cuotaExtraordinariaId',
    as: 'pagosReportados'
});

PagoReportado.belongsTo(CuotaExtraordinaria, {
    foreignKey: 'cuotaExtraordinariaId',
    as: 'cuotaExtraordinaria'
});
CargoExtraordinario.belongsTo(CuotaExtraordinaria, { foreignKey: 'cuotaExtraordinariaId', as: 'cuota' });
CuotaExtraordinaria.hasMany(CargoExtraordinario, { foreignKey: 'cuotaExtraordinariaId', as: 'cargos' });
PagoReportado.belongsTo(CargoExtraordinario, { foreignKey: 'cargoExtraordinarioId', as: 'cargoExtraordinario' });

const UsuarioCasa = require('./UsuarioCasa');
const InvitacionCasa = require('./InvitacionCasa');
const HistorialVinculo = require('./HistorialVinculo');
UsuarioCasa.belongsTo(Usuario,{foreignKey:'usuarioId',as:'usuario'});
UsuarioCasa.belongsTo(Casa,{foreignKey:'casaId',as:'casa'});
Usuario.hasMany(UsuarioCasa,{foreignKey:'usuarioId',as:'viviendas'});
Casa.hasMany(UsuarioCasa,{foreignKey:'casaId',as:'miembros'});
Casa.belongsToMany(Usuario,{through:UsuarioCasa,foreignKey:'casaId',otherKey:'usuarioId',as:'usuarios'});
InvitacionCasa.belongsTo(Casa,{foreignKey:'casaId',as:'casa'});
module.exports = {
    SolicitudCuenta,
    UsuarioCasa, InvitacionCasa, HistorialVinculo,
    Casa,
    Rol,
    Usuario,
    Cuota,
    FolioConsecutivo,
    Evento,
    Condomino,
    CondominoVivienda,
    Acceso,
    PermisoAcceso,
    Visita,
    VerificacionCuenta,
    SolicitudRol,
    PagoReportado,
    ConfiguracionConexion,
    CuotaExtraordinaria,
    CargoExtraordinario,
    PagoManualConcepto,
    ZkTarjeta
};

SolicitudCuenta.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });
SolicitudCuenta.belongsTo(Usuario, { foreignKey: 'revisadoPorUsuarioId', as: 'revisadoPor' });
