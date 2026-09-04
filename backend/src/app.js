const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const sequelize = require('./config/database');
const casasRoutes = require('./routes/casas.routes');
const authRoutes = require('./routes/auth.routes');
const path = require('path');
const cuotasRoutes = require('./routes/cuotas.routes');
const callesRoutes = require('./routes/calles.routes');
const eventosRoutes = require('./routes/eventos.routes');
const accesosRoutes = require('./routes/accesos.routes');
const visitasRoutes = require('./routes/visitas.routes');
require('./models');

const app = express();
app.set('trust proxy', 1);

app.disable('x-powered-by');

app.use(helmet());

app.use(express.json({
    limit: '2mb'
}));

app.use(express.urlencoded({
    extended: true
}));

app.use(
    '/recibos',
    express.static(
        path.resolve(
            process.cwd(),
            'storage',
            'recibos'
        )
    )
);

const allowedOrigins = [
    process.env.FRONTEND_URL,

    'https://listoenlinea-labs.github.io',

    'http://127.0.0.1:3000',
    'http://localhost:3000',

    'http://127.0.0.1:8080',
    'http://localhost:8080',

    'http://127.0.0.1:5050',
    'http://localhost:5050',

    'http://127.0.0.1:5500',
    'http://localhost:5500'
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

            console.error('Origen bloqueado por CORS:', origin);

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

app.use('/api/casas', casasRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/cuotas', cuotasRoutes);
app.use('/api/calles', callesRoutes);
app.use('/api/eventos', eventosRoutes);
app.use('/api/accesos', accesosRoutes);
app.use('/api/visitas', visitasRoutes);

app.use((req, res) => {
    res.status(404).json({
        ok: false,
        message: 'Ruta no encontrada'
    });
});

module.exports = app;
