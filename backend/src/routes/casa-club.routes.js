const router=require('express').Router();
const {autenticarToken}=require('../middlewares/auth.middleware');
const {autorizarRoles}=require('../middlewares/roles.middleware');
const club=require('../controllers/casa-club.controller');
const {rateLimit}=require('express-rate-limit');
const limiteSolicitudes=rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:true,legacyHeaders:false,
 message:{ok:false,message:'Demasiados intentos. Vuelve a intentarlo en unos minutos.'}});
router.get('/publico/fechas',club.fechas);
router.get('/publico/domicilios',rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:true,legacyHeaders:false,
 message:{ok:false,message:'Las sugerencias no están disponibles temporalmente.'}}),club.domicilios);
router.post('/publico/solicitudes',limiteSolicitudes,club.solicitar);
router.use(autenticarToken);
router.use(autorizarRoles('SUPER_ADMIN','ADMINISTRADOR','CONDOMINO'));
router.get('/fechas',club.fechas);
router.get('/mias',club.mias);
router.post('/reservas',limiteSolicitudes,(req,res)=>
 ['SUPER_ADMIN','ADMINISTRADOR'].includes(req.usuario.rol)?club.crear(req,res):club.solicitar(req,res));
router.patch('/reservas/:id/cancelar',club.cancelar);
router.get('/administracion',autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'),club.listar);
router.get('/solicitudes-pendientes',autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'),club.pendientesResumen);
router.patch('/administracion/:id',autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'),club.revisar);
module.exports=router;
