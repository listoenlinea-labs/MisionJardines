const path = require('path');

const environment = process.env.NODE_ENV || 'development';

require('dotenv').config({
    path: path.resolve(
        process.cwd(),
        `.env.${environment}`
    )
});

const app = require('./app');
const sequelize = require('./config/database');

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
    try {
        await sequelize.authenticate();

        console.log('Base de datos conectada correctamente.');

        app.listen(PORT, () => {
            console.log(
                `API de Misión Jardines ejecutándose en http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error(
            'No fue posible iniciar el servidor:',
            error
        );

        process.exit(1);
    }
}

startServer();