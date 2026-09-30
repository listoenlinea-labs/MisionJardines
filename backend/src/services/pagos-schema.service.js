const { DataTypes, QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { CuotaExtraordinaria, PagoReportado, FolioConsecutivo } = require('../models');

async function hasConstraint(tableName, constraintName) {
    const rows = await sequelize.query(
        `SELECT CONSTRAINT_NAME
           FROM information_schema.TABLE_CONSTRAINTS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = :tableName
            AND CONSTRAINT_NAME = :constraintName`,
        {
            replacements: { tableName, constraintName },
            type: QueryTypes.SELECT
        }
    );
    return rows.length > 0;
}

async function ensureColumn(queryInterface, table, current, name, definition) {
    if (!current[name]) {
        await queryInterface.addColumn(table, name, definition);
        console.log(`[Pagos] Columna agregada: ${table}.${name}`);
    }
}

async function ensureIndex(queryInterface, table, indexName, fields, unique = false) {
    const indexes = await queryInterface.showIndex(table);
    if (!indexes.some(index => index.name === indexName)) {
        await queryInterface.addIndex(table, fields, { name: indexName, unique });
        console.log(`[Pagos] Índice agregado: ${indexName}`);
    }
}

async function asegurarEsquemaPagos() {
    const queryInterface = sequelize.getQueryInterface();

    // Crear primero las tablas base del módulo si todavía no existen.
    // sync() sin alter NO borra datos ni modifica tablas existentes; solamente crea
    // las que falten. El orden importa porque pagos_reportados puede referenciar
    // cuotas_extraordinarias.
    await FolioConsecutivo.sync();
    await CuotaExtraordinaria.sync();
    await PagoReportado.sync();

    const table = 'pagos_reportados';
    const current = await queryInterface.describeTable(table);

    await ensureColumn(queryInterface, table, current, 'tipo_pago', {
        type: DataTypes.ENUM('MANTENIMIENTO', 'EXTRAORDINARIO'),
        allowNull: false,
        defaultValue: 'MANTENIMIENTO'
    });

    await ensureColumn(queryInterface, table, current, 'cuota_extraordinaria_id', {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true
    });

    await ensureColumn(queryInterface, table, current, 'monto_requerido', {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 300
    });

    await ensureColumn(queryInterface, table, current, 'recargo', {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
    });

    await ensureColumn(queryInterface, table, current, 'comprobante_nombre', {
        type: DataTypes.STRING(255),
        allowNull: true
    });

    await ensureColumn(queryInterface, table, current, 'comprobante_mime', {
        type: DataTypes.STRING(100),
        allowNull: true
    });

    await ensureColumn(queryInterface, table, current, 'recibo_folio', {
        type: DataTypes.STRING(50),
        allowNull: true
    });

    await ensureColumn(queryInterface, table, current, 'recibo_pdf_url', {
        type: DataTypes.STRING(500),
        allowNull: true
    });

    await ensureColumn(queryInterface, table, current, 'fecha_emision_recibo', {
        type: DataTypes.DATE,
        allowNull: true
    });

    await ensureIndex(
        queryInterface,
        table,
        'uq_pago_recibo_folio',
        ['recibo_folio'],
        true
    );

    await ensureIndex(
        queryInterface,
        table,
        'idx_pago_tipo_extra',
        ['tipo_pago', 'cuota_extraordinaria_id']
    );

    // La versión inicial exigía monto >= 300. Para cuotas extraordinarias el monto
    // puede ser distinto, así que retiramos únicamente ese CHECK heredado si existe.
    if (await hasConstraint(table, 'chk_pago_monto')) {
        await queryInterface.removeConstraint(table, 'chk_pago_monto');
        console.log('[Pagos] Restricción heredada chk_pago_monto eliminada');
    }

    console.log('[Pagos] Tabla folios_consecutivos verificada');
    console.log('[Pagos] Esquema de pagos verificado');
}

module.exports = { asegurarEsquemaPagos };
