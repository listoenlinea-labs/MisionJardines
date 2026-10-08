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
        // An optional schema upgrade must not take the rest of the portal offline.
        // If the DB account cannot ALTER usuarios, log the problem and complete
        // the deployment instructions before enabling public registrations.
        try {
            await require('./services/registro-publico-schema.service').asegurarRegistroPublico();
        } catch (error) {
            console.error('Registro público pendiente de migración; el portal continuará activo:', error.message);
        }
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
            require('./services/zkteco-autosync.service').startZktecoAutoSync();
            require('./services/zkteco-vigencias.service').start();
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
