const router=require('express').Router();
const {autenticarToken}=require('../middlewares/auth.middleware');
const {autorizarRoles}=require('../middlewares/roles.middleware');
const club=require('../controllers/casa-club.controller');
const {rateLimit}=require('express-rate-limit');
const limiteSolicitudes=rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:true,legacyHeaders:false,
 message:{ok:false,message:'Demasiados intentos. Vuelve a intentarlo en unos minutos.'}});
router.get('/publico/fechas',club.fechas);
router.get('/publico/tarifas',club.obtenerTarifas);
router.get('/publico/domicilios',rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:true,legacyHeaders:false,
 message:{ok:false,message:'Las sugerencias no están disponibles temporalmente.'}}),club.domicilios);
router.post('/publico/solicitudes',limiteSolicitudes,club.solicitar);
// Acceso con secreto de 256 bits ligado a una única reservación; no usa login.
// Reutiliza OCR, folio, deduplicación y worker Titan de /api/pagos.
const comprobante=require('../controllers/casa-club-publico-comprobante.controller');
router.get('/publico/cuenta',comprobante.cuenta);
const limiteComprobante=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:true,legacyHeaders:false,
 message:{ok:false,message:'Demasiados intentos de comprobante. Intenta más tarde.'}});
const limiteConsulta=rateLimit({windowMs:60*1000,limit:20,standardHeaders:true,legacyHeaders:false,
 message:{ok:false,message:'Espera unos segundos para consultar el estado.'}});
router.post('/publico/comprobante',limiteComprobante,comprobante.reportar);
router.post('/publico/comprobante/estado',limiteConsulta,comprobante.estado);
router.post('/publico/comprobante/reintentar',limiteComprobante,comprobante.reintentar);
router.post('/publico/comprobante/recibo',limiteConsulta,comprobante.descargarRecibo);
router.use(autenticarToken);
router.use(autorizarRoles('SUPER_ADMIN','ADMINISTRADOR','CONDOMINO'));
router.get('/fechas',club.fechas);
router.get('/mias',club.mias);
router.post('/reservas',limiteSolicitudes,(req,res)=>
 ['SUPER_ADMIN','ADMINISTRADOR'].includes(req.usuario.rol)?club.crear(req,res):club.solicitar(req,res));
router.patch('/reservas/:id/cancelar',club.cancelar);
router.get('/administracion',autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'),club.listar);
router.get('/administracion/:id/comprobantes',autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'),club.comprobantes);
router.get('/administracion/tarifas',autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'),club.obtenerTarifas);
router.patch('/administracion/tarifas',autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'),club.guardarTarifas);
router.delete('/administracion/:id',autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'),club.eliminarRegistro);
router.patch('/administracion/:id/liberar',autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'),club.liberar);
router.get('/solicitudes-pendientes',autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'),club.pendientesResumen);
router.get('/administracion/:id/whatsapp',autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'),club.mensajeWhatsApp);
router.patch('/administracion/:id',autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'),club.revisar);
module.exports=router;
