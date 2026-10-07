const express=require('express');
const {autenticarToken}=require('../middlewares/auth.middleware');
const {autorizarRoles}=require('../middlewares/roles.middleware');
const c=require('../controllers/zkteco.controller');
const r=express.Router();
const admin=autorizarRoles('SUPER_ADMIN','ADMINISTRADOR','MESA_DIRECTIVA');
const operar=autorizarRoles('SUPER_ADMIN','ADMINISTRADOR','SEGURIDAD');

r.get('/estado',autenticarToken,operar,c.estado);
r.get('/tarjetas',autenticarToken,admin,c.inventario);
r.get('/viviendas',autenticarToken,operar,c.viviendas);
r.post('/sincronizar',autenticarToken,admin,c.sincronizar);
r.post('/importar-zkaccess',autenticarToken,admin,express.raw({type:'application/octet-stream',limit:'100mb'}),c.importarMdb);
r.post('/simular-corte',autenticarToken,admin,c.simular);
r.patch('/tarjetas/:id/bloqueo',autenticarToken,admin,c.bloquear);
r.patch('/tarjetas/:id/vigencia',autenticarToken,admin,c.actualizarVigencia);
r.post('/tarjetas/:id/agregar-c3',autenticarToken,admin,c.agregarExistenteC3);
r.delete('/tarjetas/:id',autenticarToken,admin,c.eliminarTarjeta);
r.patch('/tarjetas/:id/vivienda',autenticarToken,admin,c.asignarTarjeta);
r.post('/viviendas/:id/tarjetas',autenticarToken,admin,c.crearTarjeta);
r.patch('/viviendas/:id/bloqueo',autenticarToken,admin,c.bloquearVivienda);
r.post('/pluma',autenticarToken,operar,c.pluma);

module.exports=r;
