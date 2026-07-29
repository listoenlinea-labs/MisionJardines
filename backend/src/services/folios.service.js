const sequelize = require('../config/database');

async function generarSiguienteFolio(
    anio,
    transaction
) {
    const lockName = `folio_mision_jardines_${anio}`;

    const [lockRows] = await sequelize.query(
        'SELECT GET_LOCK(:lockName, 10) AS acquired',
        {
            replacements: {
                lockName
            },
            transaction
        }
    );

    if (
        !lockRows.length ||
        Number(lockRows[0].acquired) !== 1
    ) {
        throw new Error(
            'No fue posible bloquear el consecutivo de folios'
        );
    }

    try {
        await sequelize.query(
            `
            INSERT INTO folios_consecutivos (
                anio,
                ultimo_numero
            )
            VALUES (
                :anio,
                0
            )
            ON DUPLICATE KEY UPDATE
                anio = VALUES(anio)
            `,
            {
                replacements: {
                    anio
                },
                transaction
            }
        );

        await sequelize.query(
            `
            UPDATE folios_consecutivos
            SET ultimo_numero = LAST_INSERT_ID(
                ultimo_numero + 1
            )
            WHERE anio = :anio
            `,
            {
                replacements: {
                    anio
                },
                transaction
            }
        );

        const [rows] = await sequelize.query(
            'SELECT LAST_INSERT_ID() AS numero',
            {
                transaction
            }
        );

        const numero = Number(rows[0].numero);

        if (!numero) {
            throw new Error(
                'No fue posible obtener el número de folio'
            );
        }

        return `MJ-${anio}-${String(numero).padStart(4, '0')}`;
    } finally {
        await sequelize.query(
            'SELECT RELEASE_LOCK(:lockName)',
            {
                replacements: {
                    lockName
                },
                transaction
            }
        );
    }
}

module.exports = {
    generarSiguienteFolio
};