const express = require('express');

const {
    listarCalles
} = require('../controllers/calles.controller');

const {
    autenticarToken
} = require('../middlewares/auth.middleware');

const router = express.Router();

router.get(
    '/',
    autenticarToken,
    listarCalles
);

module.exports = router;