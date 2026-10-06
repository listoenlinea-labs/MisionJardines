const express=require('express');
const {autenticarToken}=require('../middlewares/auth.middleware');
const {autorizarRoles}=require('../middlewares/roles.middleware');
const c=require('../controllers/zkteco.controller');
const r=express.Router();
const admin=autorizarRoles('SUPER_ADMIN','ADMINISTRADOR','MESA_DIRECTIVA');
const operar=autorizarRoles('SUPER_ADMIN','ADMINISTRADOR','SEGURIDAD');

r.get('/estado',autenticarToken,operar,c.estado);
r.get('/tarjetas',autenticarToken,admin,c.inventario);
r.post('/inventario',autenticarToken,admin,c.importarLectura);
r.post('/simular-corte',autenticarToken,admin,c.simular);
r.post('/pluma/comandos',autenticarToken,operar,c.solicitarPluma);
r.get('/pluma/comandos/:id',autenticarToken,operar,c.estadoComando);

r.post('/gateway/heartbeat',c.requireGateway,c.heartbeat);
r.get('/gateway/comandos/siguiente',c.requireGateway,c.siguienteComando);
r.post('/gateway/comandos/:id/finalizar',c.requireGateway,c.finalizarComando);

module.exports=r;
