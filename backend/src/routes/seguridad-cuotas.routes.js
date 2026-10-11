'use strict';
const router=require('express').Router();
const {autenticarToken}=require('../middlewares/auth.middleware');
const {autorizarRoles}=require('../middlewares/roles.middleware');
const {consultar}=require('../controllers/seguridad-cuotas.controller');
router.get('/cuotas-viviendas',autenticarToken,autorizarRoles('SUPER_ADMIN','ADMINISTRADOR','SEGURIDAD'),consultar);
module.exports=router;
