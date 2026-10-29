'use strict';

const recibos = require('../services/recibo-mantenimiento-analisis.service');
const jwt = require('jsonwebtoken');
const VISTA_AUD='mj-recibo-visor';
const VISTA_ISS='mision-jardines';


function casaIdSolicitada(req) {
    const id = Number(req.params.casaId);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw Object.assign(new Error('Vivienda inválida'), { status: 400 });
    }
    return id;
}

function periodoSolicitado(req) {
    const periodo = req.query?.periodo;
    if (periodo == null || periodo === '') return null;
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(periodo))) {
        throw Object.assign(new Error('El período solicitado no es válido'), { status: 400 });
    }
    return String(periodo);
}

function referenciaSolicitada(req) {
    const referencia = req.query?.referencia;
    if (referencia == null) return null;
    if (typeof referencia !== 'string' || !referencia.trim() || referencia.length > 255) {
        throw Object.assign(new Error('La referencia del movimiento no es válida'), { status: 400 });
    }
    if (req.query?.periodo != null && req.query.periodo !== '') {
        throw Object.assign(new Error('Selecciona un período o una referencia, no ambos'), { status: 400 });
    }
    return referencia.trim();
}

function responderError(res, error) {
    if (!error.status) console.error('[finanzas recibo mantenimiento]', error);
    return res.status(error.status || 503).json({
        ok: false,
        message: error.status ? error.message : 'No fue posible generar el recibo de mantenimiento'
    });
}

async function datosRecibo(req, res) {
    try {
        const { casa, resumen } = await recibos.consultarPago(casaIdSolicitada(req), periodoSolicitado(req), referenciaSolicitada(req));
        const telefonos = await recibos.consultarTelefonos(casa);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.json({ ok: true, data: { ...resumen, telefonos } });
    } catch (error) {
        return responderError(res, error);
    }
}

async function pdfRecibo(req, res) {
    try {
        const { recibo } = await recibos.consultarPago(casaIdSolicitada(req), periodoSolicitado(req), referenciaSolicitada(req));
        const { buffer, nombreArchivo } = await recibos.generarPdf(recibo);
        const nombreSeguro = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_');
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${nombreSeguro}"`);
        res.setHeader('Content-Length', buffer.length);
        return res.end(buffer);
    } catch (error) {
        return responderError(res, error);
    }
}


async function urlVistaRecibo(req,res){
 try{
  const casaId=casaIdSolicitada(req),periodo=periodoSolicitado(req),referencia=referenciaSolicitada(req);
  // Evita emitir enlaces para viviendas o movimientos no autorizados/inexistentes.
  await recibos.consultarPago(casaId,periodo,referencia);
  const permiso=jwt.sign({tipo:'vista-recibo',casaId,periodo,referencia,usuarioId:req.usuario.usuarioId},
   process.env.JWT_SECRET,{expiresIn:'5m',audience:VISTA_AUD,issuer:VISTA_ISS});
  res.setHeader('Cache-Control','private, no-store');
  return res.json({ok:true,data:{url:'/api/recibo-vista/'+encodeURIComponent(permiso)}});
 }catch(error){return responderError(res,error);}
}

// La vista del navegador no puede enviar Authorization: Bearer. Por eso
// usa un pase restringido a UN recibo con duración máxima de cinco minutos.
// Nunca acepta el JWT de sesión ni parámetros de vivienda elegidos por el cliente.
async function vistaPdfTemporal(req,res){
 try{
  const payload=jwt.verify(String(req.params.permiso||''),process.env.JWT_SECRET,
   {audience:VISTA_AUD,issuer:VISTA_ISS});
  if(payload.tipo!=='vista-recibo'||!Number.isSafeInteger(payload.casaId)||payload.casaId<1)
   return res.status(403).json({ok:false,message:'Pase de recibo inválido'});
  const {recibo}=await recibos.consultarPago(payload.casaId,payload.periodo||null,payload.referencia||null);
  const {buffer,nombreArchivo}=await recibos.generarPdf(recibo);
  const nombreSeguro=nombreArchivo.replace(/[^a-zA-Z0-9._-]/g,'_');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  // Helmet protege las otras rutas, pero este PDF debe poder incrustarse en
  // la app oficial de GitHub Pages, en un iframe de origen diferente.
  res.removeHeader('X-Frame-Options');
  res.setHeader('Cross-Origin-Resource-Policy','cross-origin');
  res.setHeader('Content-Security-Policy',
   "default-src 'none'; frame-ancestors 'self' https://listoenlinea-labs.github.io");
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`inline; filename="${nombreSeguro}"`);
  res.setHeader('Content-Length',buffer.length);
  return res.end(buffer);
 }catch(error){
  if(['TokenExpiredError','JsonWebTokenError','NotBeforeError'].includes(error.name))
   return res.status(403).json({ok:false,message:'Vista de recibo vencida. Vuelve a abrir el recibo.'});
  return responderError(res,error);
 }
}

module.exports = { datosRecibo, pdfRecibo, urlVistaRecibo, vistaPdfTemporal };
