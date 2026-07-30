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

const PORT =
    process.env.PORT || 3000;

async function iniciarServidor() {
    try {
        await sequelize.authenticate();

        console.log(
            'Conexión con MySQL correcta'
        );

        app.listen(PORT, () => {
            console.log(
                `Servidor corriendo en http://localhost:${PORT}`
            );
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