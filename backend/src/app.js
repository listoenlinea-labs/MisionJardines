const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const sequelize = require('./config/database');

const app = express();

app.disable('x-powered-by');

app.use(helmet());

app.use(express.json({
    limit: '2mb'
}));

app.use(express.urlencoded({
    extended: true
}));

const allowedOrigins = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_URL_LOCALHOST
].filter(Boolean);

app.use(
    cors({
        origin(origin, callback) {
            if (!origin) {
                return callback(null, true);
            }

            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            return callback(
                new Error('Origen no permitido por CORS')
            );
        },

        credentials: true
    })
);

app.use(
    '/api',
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 500,
        standardHeaders: true,
        legacyHeaders: false
    })
);

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        application: 'Misión Jardines API',
        environment: process.env.NODE_ENV
    });
});

app.get('/api/health/database', async (req, res) => {
    try {
        await sequelize.authenticate();

        res.json({
            ok: true,
            database: process.env.DB_NAME,
            message: 'Conexión correcta'
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            message: 'No fue posible conectar con MySQL',
            error: error.message
        });
    }
});

app.use((req, res) => {
    res.status(404).json({
        ok: false,
        message: 'Ruta no encontrada'
    });
});

module.exports = app;