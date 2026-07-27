const { Sequelize } = require('sequelize');

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

        logging:
            process.env.NODE_ENV === 'development'
                ? console.log
                : false,

        define: {
            timestamps: false,
            freezeTableName: true
        },

        pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000
        },

        dialectOptions: {
            connectTimeout: 30000
        }
    }
);

module.exports = sequelize;