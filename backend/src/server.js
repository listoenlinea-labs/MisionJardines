const path = require('path');

const nodeEnv =
    process.env.NODE_ENV || 'development';

require('dotenv').config({
    path: path.resolve(
        __dirname,
        `../.env.${nodeEnv}`
    )
});

const app = require('./app');
const sequelize = require('./config/database');
const { asegurarEsquemaPagos } = require('./services/pagos-schema.service');

const PORT =
    process.env.PORT || 3000;

async function iniciarServidor() {
    try {
        await sequelize.authenticate();

        console.log(
            'Conexión con MySQL correcta'
        );

        await asegurarEsquemaPagos();
        await require('./services/cuentas-schema.service').asegurarCuentas();
        await require('./services/casa-club-schema.service').asegurarCasaClub();
        await require('./services/finanzas-schema.service').asegurarFinanzas();
        await require('./services/viviendas-schema.service').asegurarViviendas();
        await require('./services/zkteco-schema.service').asegurarEsquemaZkteco();
        try {
            await require('./services/roles-migration.service').aplicarMigracionRoles();
        } catch (error) {
            // An optional account promotion must not take authentication offline.
            // No privilege is granted if the migration fails; retry on next start.
            console.error('Migración de administrador pendiente; la API continuará disponible:', error.message);
        }

        app.listen(PORT, () => {
            console.log(
                `Servidor corriendo en http://localhost:${PORT}`
            );
            require('./services/zkteco-vigencias.service').start();
            require('./services/zkteco-autosync.service').startZktecoAutoSync();
        });
    } catch (error) {
        console.error(
            'Error al iniciar el servidor:',
            error
        );

        process.exit(1);
    }
}

iniciarServidor();
