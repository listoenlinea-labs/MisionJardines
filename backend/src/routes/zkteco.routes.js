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

r.post('/accesos/sincronizar',autenticarToken,admin,c.solicitarSincronizacion);
r.patch('/tarjetas/:id/vigencia',autenticarToken,admin,c.actualizarVigencia);
r.patch('/tarjetas/:id/vivienda',autenticarToken,admin,c.vincularCasa);
r.get('/accesos/comandos/:id',autenticarToken,admin,c.estadoAccesoComando);

r.post('/pluma/comandos',autenticarToken,operar,c.solicitarPluma);
r.get('/pluma/comandos/:id',autenticarToken,operar,c.estadoComando);

r.post('/gateway/heartbeat',c.requireGateway,c.heartbeat);
r.get('/gateway/comandos/siguiente',c.requireGateway,c.siguienteComando);
r.post('/gateway/comandos/:id/finalizar',c.requireGateway,c.finalizarComando);
r.get('/gateway/accesos/siguiente',c.requireGateway,c.siguienteAcceso);
r.post('/gateway/accesos/:id/finalizar',c.requireGateway,c.finalizarAcceso);

module.exports=r;
