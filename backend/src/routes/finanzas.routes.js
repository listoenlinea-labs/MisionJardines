const router=require('express').Router();
const {autenticarToken}=require('../middlewares/auth.middleware');
const {autorizarRoles}=require('../middlewares/roles.middleware');
const controller=require('../controllers/finanzas.controller');
router.use(autenticarToken,autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'));
router.get('/analisis',controller.analizar);
router.post('/egresos',controller.registrarEgreso);
module.exports=router;