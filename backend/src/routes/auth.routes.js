const express = require('express');

const {
    iniciarSesion,
    obtenerPerfil
} = require('../controllers/auth.controller');

const {
    autenticarToken
} = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/login', iniciarSesion);

router.get(
    '/perfil',
    autenticarToken,
    obtenerPerfil
);

module.exports = router;