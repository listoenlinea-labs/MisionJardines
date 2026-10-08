const { DataTypes } = require('sequelize');
const db = require('../config/database');
const { Rol, SolicitudCuenta, VerificacionCuenta, SolicitudRol } = require('../models');

async function asegurarCuentas() {
    const qi = db.getQueryInterface();
    const columns = await qi.describeTable('usuarios');
    // Match the actual INT UNSIGNED FK to direcciones. No fake house for staff
    // or unverified residents; the membership is granted only on approval.
    if (!columns.casa_id.allowNull) {
        await qi.changeColumn('usuarios', 'casa_id', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true });
    }
    // La baja es lógica: se conserva la cuenta histórica, pero se admiten
    // nuevas solicitudes pendientes sobre el mismo usuario/correo revocado.
    if (!columns.sesion_version) {
        await qi.addColumn('usuarios', 'sesion_version', {
            type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0
        });
    }

    // En instalaciones nuevas crear la tabla antes de revisar sus índices.
    await SolicitudCuenta.sync();

    // Necesitamos cambiar el enum existente; sync() sin alter no lo haría.
    const [columnasEstatus] = await db.query("SHOW COLUMNS FROM solicitudes_cuenta LIKE 'estatus'");
    const tipoEstatus = String(columnasEstatus[0]?.Type || '');
    if (!tipoEstatus.includes("'REVOCADA'")) {
        await qi.changeColumn('solicitudes_cuenta', 'estatus', {
            type: DataTypes.ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA', 'REVOCADA'),
            allowNull: false, defaultValue: 'PENDIENTE'
        });
    }

    // El esquema anterior tiene UNIQUE(usuario_id), incompatible con
    // conservar aprobaciones viejas y crear una solicitud nueva por cuenta.
    const indices = await qi.showIndex('solicitudes_cuenta');
    const uniqueUsuario = indices.filter(index =>
        index.unique && !index.primary && index.fields.length === 1 &&
        (index.fields[0].attribute === 'usuario_id' || index.fields[0].name === 'usuario_id')
    );
    if (uniqueUsuario.length) {
        // Garantizar el índice de soporte de cualquier FK antes de retirar UNIQUE.
        if (!indices.some(index => index.name === 'idx_solicitudes_cuenta_usuario')) {
            await qi.addIndex('solicitudes_cuenta', ['usuario_id'], {
                name: 'idx_solicitudes_cuenta_usuario'
            });
        }
        for (const index of uniqueUsuario) {
            await qi.removeIndex('solicitudes_cuenta', index.name);
        }
    }

    // Migración de cuentas dadas de baja ANTES de este cambio.
    // No modificar rechazos ni aprobaciones de cuentas activas.
    await db.query(`UPDATE solicitudes_cuenta AS s
        INNER JOIN usuarios AS u ON u.id = s.usuario_id
        SET s.estatus = 'REVOCADA'
        WHERE s.estatus = 'APROBADA' AND u.estatus = 'BAJA'`);

    await VerificacionCuenta.sync();
    await SolicitudRol.sync();
    for (const nombre of ['CONDOMINO', 'SEGURIDAD', 'ADMINISTRADOR']) {
        await Rol.findOrCreate({ where: { nombre }, defaults: { activo: true, descripcion: nombre } });
    }
}
module.exports = { asegurarCuentas };
