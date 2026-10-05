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
const dashboardRoutes = require('./routes/dashboard.routes');
const pagosRoutes = require('./routes/pagos.routes');
const busquedaRoutes = require('./routes/busqueda.routes');
const conexionRoutes = require('./routes/conexion.routes');
const entornoRoutes = require('./routes/entorno.routes');
require('./models');

const app = express();
app.set('trust proxy', 1);

app.disable('x-powered-by');

// Fallback de emergencia para servir el frontend directamente desde Hostinger.
// Esto evita depender de GitHub Pages cuando Actions tiene retrasos y mantiene
// disponible la misma carpeta /docs que se publica normalmente en Pages.
const frontendDir = path.resolve(__dirname, '..', '..', 'docs');
app.use(express.static(frontendDir, {
    fallthrough: true,
    index: 'index.html'
}));

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
]
    .filter(Boolean)
    .map(origin => String(origin).trim().replace(/\/$/, ''));

function corsOriginAllowed(origin) {
    if (!origin) return true;

    const normalized = String(origin).trim().replace(/\/$/, '');

    if (allowedOrigins.includes(normalized)) {
        return true;
    }

    // El frontend oficial vive en GitHub Pages. El Origin del navegador no
    // incluye la ruta /MisionJardines, solamente el host.
    return /^https:\/\/listoenlinea-labs\.github\.io$/i.test(normalized);
}

const corsOptions = {
    origin(origin, callback) {
        if (corsOriginAllowed(origin)) {
            return callback(null, true);
        }

        console.error('Origen bloqueado por CORS:', origin);
        return callback(new Error('Origen no permitido por CORS'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'Origin', 'X-Casa-Id'],
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Responder explícitamente los preflight antes del rate-limit y de las rutas.
// Esto evita que un POST JSON con Authorization sea rechazado antes de llegar
// a /api/pagos.
app.options(/.*/, cors(corsOptions));

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

app.use('/api/viviendas', require('./routes/viviendas.routes'));
app.use('/api/casas', casasRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/cuotas', cuotasRoutes);
app.use('/api/calles', callesRoutes);
app.use('/api/eventos', eventosRoutes);
app.use('/api/accesos', accesosRoutes);
app.use('/api/visitas', visitasRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/busqueda', busquedaRoutes);
app.use('/api/conexion', conexionRoutes);
app.use('/api/entorno', entornoRoutes);

app.use((req, res) => {
    res.status(404).json({
        ok: false,
        message: 'Ruta no encontrada'
    });
});

module.exports = app;
