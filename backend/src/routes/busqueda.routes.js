const {filtrarViviendasVisibles,esViviendaVisible}=require('../services/viviendas-visibles.service');
const express = require('express');
const sequelize = require('../config/database');
const { Op } = require('sequelize');
const { domicilioConmutador, buscarTelefonosConmutador, guardarContactosAdministrados, telefonoContactoValido, nombresGuardadosConmutador, guardarNombreConmutador, obtenerContactosAdministrados } = require('../services/conmutador-padron.service');
const { casetaHabilitada } = require('../config/conmutador-caseta');
const { Casa, Condomino, Cuota, Visita, Acceso, Evento, PagoReportado } = require('../models');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');

const router = express.Router();
const { ordenarDirecciones } = require('../services/direccion-sort.service');
const { normalizarCalle } = require('../services/viviendas-visibles.service');
router.use(autenticarToken);

const personnel = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'SEGURIDAD'];
const finance = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'CONDOMINO'];
const like = value => `%${value.replace(/[\\%_]/g, '\\$&')}%`;
const normalize = value => typeof value === 'string' ? value.trim().slice(0, 80) : '';
const house = { model: Casa, as: 'casa', attributes: ['id', 'calle', 'calleCorrecta', 'numero'] };
const fields = (term, names) => ({ [Op.or]: names.map(name => ({ [name]: { [Op.like]: term } })) });

router.get('/', async (req, res) => {
  const q = normalize(req.query.q);
  const result = { ok: true, casas: [], residentes: [], cuotas: [], visitas: [], accesos: [], eventos: [], pagos: [] };
  if (q.length < 2) return res.json(result);
  const term = like(q);
  const numeric = /^\d{1,9}$/.test(q) ? Number(q) : null;
  const role = req.usuario.rol;
  try {
    const queries = [];
    if (personnel.includes(role)) {
      queries.push(Casa.findAll({ attributes: ['id', 'calle', 'calleCorrecta', 'numero'], where: fields(term, ['calleCorrecta', 'numero', 'nombre', 'telefono', 'correo']), limit: 1000, order: [['calleCorrecta', 'ASC'], ['numero', 'ASC']] }).then(rows => { result.casas = ordenarDirecciones(filtrarViviendasVisibles(rows)).slice(0, 5); }));
      queries.push(Condomino.findAll({ attributes: ['id', 'nombreCompleto'], where: { activo: true, ...fields(term, ['nombreCompleto', 'telefono', 'correo']) }, include: [{ ...house, as: 'viviendas', through: { attributes: [], where: { activo: true } } }], limit: 5, order: [['nombreCompleto', 'ASC']] }).then(rows => { result.residentes = rows.flatMap(r => { const row = r.toJSON ? r.toJSON() : r; return (row.viviendas || []).filter(esViviendaVisible).map(casa => ({ id: row.id, nombreCompleto: row.nombreCompleto, casa })); }).slice(0, 5); }));
      if (['SUPER_ADMIN', 'ADMINISTRADOR', 'SEGURIDAD'].includes(role)) queries.push(Acceso.findAll({ attributes: ['id', 'nombre', 'tipo', 'placas', 'fechaEntrada'], where: fields(term, ['nombre', 'placas', 'proveedor', 'motivo', 'telefono', 'tipo']), include: [house], limit: 5, order: [['fechaEntrada', 'DESC']] }).then(rows => { result.accesos = rows.filter(r=>!r.casa||esViviendaVisible(r.casa)); }));
    }
    if (finance.includes(role)) {
      const where = fields(term, ['nombrePagador', 'folio', 'calleSnapshot', 'numeroCasaSnapshot', 'mes', 'estatusPago']);
      if (numeric !== null) where[Op.or].push({ anio: numeric }, { id: numeric });
      if (role === 'CONDOMINO') {
        if (!req.usuario.casaId) return res.status(403).json({ ok: false, message: 'Vivienda no asignada' });
        where.casaId = req.usuario.casaId;
      }
      queries.push(Cuota.findAll({ attributes: ['id', 'anio', 'mes', 'estatusPago', 'nombrePagador'], where, include: [house], limit: 5, order: [['anio', 'DESC'], ['id', 'DESC']] }).then(rows => { result.cuotas = rows.filter(r=>!r.casa||esViviendaVisible(r.casa)); }));
      if (req.usuario.casaId) queries.push(PagoReportado.findAll({ attributes: ['id', 'folioReporte', 'folioOperacion', 'concepto', 'estatus'], where: { casaId: req.usuario.casaId, ...fields(term, ['folioReporte', 'folioOperacion', 'concepto', 'estatus', 'calleSnapshot', 'numeroCasaSnapshot']) }, limit: 5, order: [['creadoEn', 'DESC']] }).then(rows => { result.pagos = rows; }));
    }
    if (['SUPER_ADMIN', 'ADMINISTRADOR', 'SEGURIDAD'].includes(role)) {
      const where = fields(term, ['nombreVisitante', 'codigo', 'placas', 'autorizadoPor', 'estatus', 'telefono']);
      if (/^\d{4}-\d{2}-\d{2}$/.test(q)) where[Op.or].push({ fechaProgramada: q });
      if (role === 'CONDOMINO') {
        if (!req.usuario.casaId) return res.status(403).json({ ok: false, message: 'Vivienda no asignada' });
        where.casaId = req.usuario.casaId;
      }
      queries.push(Visita.findAll({ attributes: ['id', 'codigo', 'nombreVisitante', 'fechaProgramada', 'estatus'], where, include: [house], limit: 5, order: [['fechaProgramada', 'DESC']] }).then(rows => { result.visitas = rows.filter(r=>!r.casa||esViviendaVisible(r.casa)); }));
    }
    if (['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'MANTENIMIENTO', 'CONDOMINO'].includes(role)) {
      const eventWhere = { activo: true, ...fields(term, ['titulo', 'descripcion', 'ubicacion', 'tipoEvento']) };
      if (/^\d{4}-\d{2}-\d{2}$/.test(q)) eventWhere[Op.or].push({ fechaInicio: { [Op.between]: [`${q} 00:00:00`, `${q} 23:59:59`] } });
      if (!['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA'].includes(role)) eventWhere[Op.and] = [{ [Op.or]: [{ visibilidad: 'TODOS' }, { visibilidad: 'SOLO_CASA', casaId: req.usuario.casaId || 0 }] }];
      queries.push(Evento.findAll({ attributes: ['id', 'titulo', 'fechaInicio', 'ubicacion'], where: eventWhere, limit: 5, order: [['fechaInicio', 'DESC']] }).then(rows => { result.eventos = rows; }));
    }
    const outcomes = await Promise.allSettled(queries);
    result.partial = outcomes.some(outcome => outcome.status === 'rejected');
    if (result.partial) outcomes.filter(outcome => outcome.status === 'rejected').forEach(outcome => console.error('Fuente de búsqueda no disponible:', outcome.reason));
    return res.json(result);
  } catch (error) {
    console.error('Error de búsqueda global:', error);
    return res.status(500).json({ ok: false, message: 'No fue posible buscar en este momento' });
  }
});



/**
 * ÚNICO rol con acceso a esta agenda: ADMINISTRADOR.
 * No reutilizar la autorización amplia de /conmutador/telefono.
 * Jamás entregar números al personal de Seguridad o Mesa Directiva.
 */
router.post('/conmutador/contactos-admin/consultar', autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const domicilios = req.body?.domicilios;
  // Se consulta una sola vez el padrón completo para permitir filtros globales (teléfono/sin número).
  if (!Array.isArray(domicilios) || !domicilios.length || domicilios.length > 350) {
    return res.status(400).json({ok:false,message:'Consulta de contactos inválida'});
  }
  const validos = domicilios.map(row=>({
    grupo:typeof row?.grupo==='string'?row.grupo.trim():'',
    numero:typeof row?.numero==='string'?row.numero.trim():''
  }));
  if (validos.some(x=>!domicilioConmutador(x.grupo,x.numero))) {
    return res.status(400).json({ok:false,message:'Domicilio de contacto no disponible'});
  }
  try {
    const [padron,ediciones] = await Promise.all([
      Casa.findAll({attributes:['calle','calleCorrecta','numero','nombre'],raw:true}),
      nombresGuardadosConmutador()
    ]);
    const coincidencias = new Map();
    for(const casa of padron) {
      const calle=normalizarCalle(casa.calleCorrecta||casa.calle);
      const key=calle+'|'+String(casa.numero).trim();
      if(!coincidencias.has(key))coincidencias.set(key,[]);
      coincidencias.get(key).push(casa.nombre||'');
    }
    const propietarios = new Map(ediciones.map(x=>[x.grupo+'|'+x.numero,x.propietario]));
    const contactos = new Array(validos.length);
    // Limitar concurrencia evita saturar MySQL (padrón de >200 viviendas).
    for(let i=0;i<validos.length;i+=8){
      await Promise.all(validos.slice(i,i+8).map(async (domicilio,j)=>{
        const grupo=normalizarCalle(domicilio.grupo).replace(/^jardines [123]$/,'jardines');
        const candidatos=coincidencias.get(grupo+'|'+domicilio.numero)||[];
        const nombrePadron=candidatos.length===1?candidatos[0]:'';
        const clave=domicilio.grupo+'|'+domicilio.numero;
        contactos[i+j]={...domicilio,telefonos:await buscarTelefonosConmutador(domicilio),
          propietario:propietarios.has(clave)?propietarios.get(clave):nombrePadron};
      }));
    }
    return res.json({ok:true,contactos});
  } catch(error) {
    console.error('Error consultando contactos del conmutador:',error.name);
    return res.status(503).json({ok:false,message:'No fue posible obtener los contactos'});
  }
});

router.put('/conmutador/contactos-admin', autorizarRoles('ADMINISTRADOR'), async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  const grupo=typeof req.body?.grupo==='string'?req.body.grupo.trim():'';
  const numero=typeof req.body?.numero==='string'?req.body.numero.trim():'';
  if(!domicilioConmutador(grupo,numero))return res.status(400).json({ok:false,message:'Vivienda inválida'});
  try {
    // Compatibilidad con la interfaz anterior sin borrar sus contactos B.
    if(Array.isArray(req.body?.telefonos)&&req.body?.propietario===undefined) {
      const telefonos=await guardarContactosAdministrados({grupo,numero},req.body.telefonos,req.usuario.usuarioId);
      return res.json({ok:true,grupo,numero,telefonos,message:'Contactos actualizados'});
    }
    const {telefono,propietario}=req.body||{};
    if(typeof telefono!=='string'||telefonoContactoValido(telefono)===null ||
      typeof propietario!=='string'||propietario.length>150){
      return res.status(400).json({ok:false,message:'Escribe un teléfono válido y un nombre de máximo 150 caracteres'});
    }
    const domicilio={grupo,numero};
    // El contacto B permanece almacenado para no perder datos previos aunque ya no aparezca en esta tabla.
    const administrados=await obtenerContactosAdministrados(domicilio);
    const existentes=administrados===null?await buscarTelefonosConmutador(domicilio):administrados;
    const guardado=await sequelize.transaction(async transaction=>{
      const telefonos=await guardarContactosAdministrados(domicilio,[telefono,existentes[1]||''],req.usuario.usuarioId,transaction);
      const nombre=await guardarNombreConmutador(domicilio,propietario,req.usuario.usuarioId,transaction);
      return {telefonos,propietario:nombre};
    });
    return res.json({ok:true,grupo,numero,...guardado,message:'Contacto y propietario actualizados'});
  } catch(error) {
    if(error.status===400)return res.status(400).json({ok:false,message:error.message});
    console.error('Error guardando contacto y propietario:',error.name);
    return res.status(503).json({ok:false,message:'No fue posible guardar el contacto'});
  }
});

router.get('/conmutador/telefono', autorizarRoles(...personnel), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (casetaHabilitada() && req.usuario.rol === 'SEGURIDAD') {
    return res.status(403).json({ ok: false, message: 'Usa el conmutador de caseta para llamar' });
  }
  const grupo = normalize(req.query.grupo);
  const numero = normalize(req.query.numero);
  const domicilio = domicilioConmutador(grupo, numero);
  if (!domicilio) return res.status(400).json({ ok: false, message: 'Domicilio no válido o no disponible' });
  try {
    const telefonos = await buscarTelefonosConmutador(domicilio);
    return res.json({ ok: true, grupo, numero, telefonos, multiples: telefonos.length > 1 });
  } catch (error) {
    console.error('Error al consultar teléfono del conmutador:', error.name);
    return res.status(500).json({ ok: false, message: 'No fue posible consultar el teléfono de este domicilio' });
  }
});

router.get('/conmutador/opciones', autorizarRoles(...personnel), async (_req, res) => {
  try {
    const casas = await Casa.findAll({ attributes: ['calle', 'calleCorrecta', 'numero'], order: [['calleCorrecta', 'ASC'], ['numero', 'ASC']], raw: true });
    return res.json({ ok: true, casas: ordenarDirecciones(filtrarViviendasVisibles(casas)).map(casa => ({ ...casa, calle: casa.calleCorrecta || casa.calle })) });
  } catch (error) {
    console.error('Error al cargar domicilios del conmutador:', error);
    return res.status(500).json({ ok: false, message: 'No fue posible cargar los domicilios' });
  }
});

router.get('/conmutador', autorizarRoles(...personnel), async (req, res) => {
  const calle = normalize(req.query.calle);
  const numero = normalize(req.query.numero);
  if (!calle && !numero) return res.json({ ok: true, casas: [] });
  try {
    const casas = await Casa.findAll({
      attributes: ['id', 'calle', 'calleCorrecta', 'numero'],
      where: { ...(calle && { calleCorrecta: { [Op.like]: like(calle) } }), ...(numero && { numero: { [Op.like]: like(numero) } }) },
      include: casetaHabilitada() && req.usuario.rol === 'SEGURIDAD' ? [] : [{ model: Condomino, as: 'condominos', through: { attributes: [], where: { activo: true } }, where: { activo: true }, required: false, attributes: ['nombreCompleto', 'telefono'] }],
      limit: 1000,
      order: [['calleCorrecta', 'ASC'], ['numero', 'ASC']]
    });
    return res.json({ ok: true, casas: ordenarDirecciones(filtrarViviendasVisibles(casas)).slice(0, 40).map(casa => ({ ...casa.toJSON(), calle: casa.calleCorrecta || casa.calle })) });
  } catch (error) {
    console.error('Error del conmutador:', error);
    return res.status(500).json({ ok: false, message: 'No fue posible consultar el conmutador' });
  }
});

module.exports = router;
