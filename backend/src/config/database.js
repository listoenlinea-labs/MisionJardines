const { Sequelize } = require('sequelize');
const { MYSQL_TIME_ZONE } = require('./timezone');
const dbCapacity = require('../services/db-capacity.service');

const requiredEnvironmentVariables = [
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD'
];

for (const variable of requiredEnvironmentVariables) {
    if (!process.env[variable]) {
        throw new Error(`Falta la variable de entorno ${variable}`);
    }
}

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        dialect: 'mysql',

        // Todas las fechas escritas y leídas por la aplicación usan México central.
        timezone: MYSQL_TIME_ZONE,

        logging:
            process.env.NODE_ENV === 'development'
                ? console.log
                : false,

        define: {
            timestamps: false,
            freezeTableName: true
        },

        pool: {
            // Reutilizar las conexiones: el cierre a los 10 s disparaba
            // conexiones nuevas durante el uso continuo del portal.
            max: 6,
            min: 1,
            acquire: 30000,
            idle: 120000
        },

        dialectOptions: {
            connectTimeout: 30000
        }
    }
);

// Solo métricas en memoria: consultar el medidor no hace queries MySQL.
sequelize.addHook('beforeConnect', () => dbCapacity.mark('connections'));
sequelize.addHook('beforeQuery', () => dbCapacity.mark('queries'));

module.exports = sequelize;