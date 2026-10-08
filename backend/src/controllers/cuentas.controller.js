const { Op } = require('sequelize');
const db = require('../config/database');
const { SolicitudCuenta, Usuario, Rol, Casa, UsuarioCasa } = require('../models');
const bcrypt=require('bcryptjs');
const crypto=require('crypto');
const { vincular } = require('../services/viviendas.service');
const fail = (status, message) => Object.assign(new Error(message), { status });
const roles = ['CONDOMINO', 'SEGURIDAD', 'ADMINISTRADOR'];

async function listar(req, res) {
    const estatus = req.query.estatus || 'PENDIENTE';
    const pagina = Number(req.query.pagina || 1);
    if (!['PENDIENTE', 'APROBADA', 'RECHAZADA'].includes(estatus) || !Number.isSafeInteger(pagina) || pagina < 1 || pagina > 100000) {
        return res.status(400).json({ ok: false, message: 'Filtro inválido' });
    }
    try {
        const nombre=String(req.query.nombre||'').trim().slice(0,90);
        const calle=String(req.query.calle||'').trim().slice(0,100);
        const numero=String(req.query.numero||'').trim().slice(0,20);
        const cond=[{estatus}];
        if(calle)cond.push({calle:{[Op.like]:'%'+calle+'%'}});
        if(numero)cond.push({numeroCasa:{[Op.like]:'%'+numero+'%'}});
        if(nombre){
          const terms=nombre.split(/\s+/).filter(Boolean).slice(0,5);
          const names=await Usuario.findAll({where:{[Op.and]:terms.map(term=>({[Op.or]:[
              {nombre:{[Op.like]:'%'+term+'%'}},
              {apellidoPaterno:{[Op.like]:'%'+term+'%'}},
              {apellidoMaterno:{[Op.like]:'%'+term+'%'}}
            ]}))},attributes:['id']});
          cond.push({usuarioId:{[Op.in]:names.map(x=>x.id)}});
        }
        const { rows, count } = await SolicitudCuenta.findAndCountAll({ where: {[Op.and]:cond},
            include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'apellidoPaterno', 'apellidoMaterno', 'correo', 'telefono', 'estatus'] },
                { model: Usuario, as: 'revisadoPor', attributes: ['nombre', 'apellidoPaterno'] }],
            order: [['creadoEn', 'DESC'], ['id', 'DESC']], limit: 20, offset: (pagina - 1) * 20 });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ ok: true, solicitudes: rows, total: count, pagina, paginas: Math.max(1, Math.ceil(count / 20)) });
    } catch (error) {
        console.error('Listado de cuentas:', error.message);
        return res.status(503).json({ ok: false, message: 'No fue posible consultar las solicitudes' });
    }
}

async function viviendas(req, res) {
    const q = String(req.query.q || '').trim().slice(0, 100);
    try {
        const rows = await Casa.findAll({ attributes: ['id', 'calle', 'numero'],
            where: q ? { [Op.or]: [{ calle: { [Op.like]: `%${q}%` } }, { numero: { [Op.like]: `%${q}%` } }] } : {},
            order: [['calle', 'ASC'], ['numero', 'ASC']], limit: 200 });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ ok: true, viviendas: rows });
    } catch (error) { return res.status(503).json({ ok: false, message: 'No fue posible consultar el padrón de viviendas' }); }
}

async function revisar(req, res) {
    const { accion, rol, casaId, identidadVerificada } = req.body;
    const comentario = String(req.body.comentario || '').trim();
    if (!/^[1-9]\d*$/.test(String(req.params.id)) || !['APROBAR', 'RECHAZAR'].includes(accion) || comentario.length > 600 ||
        (accion === 'APROBAR' && (!roles.includes(rol) || identidadVerificada !== true)) ||
        (accion === 'RECHAZAR' && !comentario)) {
        return res.status(400).json({ ok: false, message: 'Verifica la identidad y selecciona un rol válido; para rechazar, indica el motivo.' });
    }
    try {
        await db.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
            const reviewer = await Usuario.findByPk(req.usuario.usuarioId, { transaction, lock: transaction.LOCK.UPDATE,
                include: [{ model: Rol, as: 'rol', attributes: ['nombre', 'activo'] }] });
            if (!reviewer || reviewer.estatus !== 'ACTIVO' || !reviewer.rol?.activo || !['SUPER_ADMIN', 'ADMINISTRADOR'].includes(reviewer.rol.nombre)) {
                throw fail(403, 'Solo Administración puede verificar cuentas');
            }
            const solicitud = await SolicitudCuenta.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
            if (!solicitud) throw fail(404, 'Solicitud no encontrada');
            if (solicitud.estatus !== 'PENDIENTE') throw fail(409, 'La solicitud ya fue revisada. Actualiza la lista.');
            if (String(solicitud.usuarioId) === String(reviewer.id)) throw fail(403, 'No puedes aprobar tu propia cuenta');
            const user = await Usuario.findByPk(solicitud.usuarioId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!user || user.estatus !== 'PENDIENTE') throw fail(409, 'La cuenta ya no está pendiente de verificación');
            if (accion === 'APROBAR') {
                const assigned = await Rol.findOne({ where: { nombre: rol, activo: true }, transaction });
                if (!assigned) throw fail(409, 'El rol seleccionado no está disponible');
                let house = null;
                if (rol !== 'SEGURIDAD' && casaId) {
                    if (!/^[1-9]\d*$/.test(String(casaId))) throw fail(400, 'Vivienda inválida');
                    house = await Casa.findByPk(casaId, { transaction });
                    if (!house) throw fail(400, 'La vivienda seleccionada no existe en el padrón');
                }
                if (rol === 'CONDOMINO' && !house) throw fail(400, 'Selecciona la vivienda real del condómino');
                await user.update({ rolId: assigned.id, casaId: house?.id || null, estatus: 'ACTIVO',
                    esContactoPrincipal: false, actualizadoEn: new Date() }, { transaction });
                if (house) await vincular({ usuarioId: user.id, casaId: house.id, tipo: solicitud.tipoVinculo === 'RESPONSABLE' ? 'RESPONSABLE' : 'MIEMBRO', actorId: reviewer.id, transaction });
            } else {
                await user.update({ estatus: 'BLOQUEADO', actualizadoEn: new Date() }, { transaction });
            }
            await solicitud.update({ estatus: accion === 'APROBAR' ? 'APROBADA' : 'RECHAZADA',
                rolAsignado: accion === 'APROBAR' ? rol : null,
                ...(accion === 'APROBAR' && house ? { casaSugeridaId: house.id, calle: house.calle, numeroCasa: house.numero } : {}),
                revisadoPorUsuarioId: reviewer.id,
                comentarioRevision: comentario || null, revisadoEn: new Date() }, { transaction });
        });
        return res.json({ ok: true, message: accion === 'APROBAR' ? 'Cuenta aprobada. La persona ya puede iniciar sesión.' : 'Solicitud rechazada. La cuenta permanece sin acceso.' });
    } catch (error) {
        if (!error.status) console.error('Verificación de cuentas:', error.message);
        return res.status(error.status || 503).json({ ok: false, message: error.status ? error.message : 'No fue posible guardar la revisión. No se aprobó la cuenta.' });
    }
}
async function revocar(req,res){
 if(!/^[1-9][0-9]*$/.test(String(req.params.id)))return res.status(400).json({ok:false,message:'Solicitud inválida'});
 try {
  await db.transaction({isolationLevel:'READ COMMITTED'},async transaction=>{
   const reviewer=await Usuario.findByPk(req.usuario.usuarioId,{transaction,lock:transaction.LOCK.UPDATE,include:[{model:Rol,as:'rol',attributes:['nombre','activo']}]});
   if(!reviewer||reviewer.estatus!=='ACTIVO'||!reviewer.rol?.activo||!['SUPER_ADMIN','ADMINISTRADOR'].includes(reviewer.rol.nombre))throw fail(403,'Solo Administración puede revocar cuentas');
   const solicitud=await SolicitudCuenta.findByPk(req.params.id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!solicitud||solicitud.estatus!=='APROBADA')throw fail(404,'Cuenta aprobada no encontrada');
   if(String(solicitud.usuarioId)===String(reviewer.id))throw fail(403,'No puedes revocar tu propia cuenta');
   const user=await Usuario.findByPk(solicitud.usuarioId,{transaction,lock:transaction.LOCK.UPDATE,include:[{model:Rol,as:'rol',attributes:['nombre']}]});
   if(!user||user.estatus!=='ACTIVO')throw fail(409,'Cuenta ya desactivada');
   if(user.rol?.nombre==='SUPER_ADMIN')throw fail(403,'No es posible revocar Super Admin desde este módulo');
   if(user.rol?.nombre==='ADMINISTRADOR'&&reviewer.rol.nombre!=='SUPER_ADMIN')throw fail(403,'Solo Super Admin puede revocar administradores');
   const ahora=new Date();
   await user.update({estatus:'BAJA',contrasenaHash:await bcrypt.hash(crypto.randomBytes(36).toString('hex'),12),actualizadoEn:ahora},{transaction});
   await UsuarioCasa.update({activo:false,desvinculadoEn:ahora},{where:{usuarioId:user.id,activo:true},transaction});
   await solicitud.update({comentarioRevision:(String(solicitud.comentarioRevision||'').slice(0,370)+' | Acceso revocado por administrador '+reviewer.id+' en '+ahora.toISOString()).slice(0,600)},{transaction});
  });
  return res.json({ok:true,message:'Acceso revocado. Las credenciales y sesiones anteriores dejan de funcionar. El historial de pagos permanece.'});
 }catch(e){if(!e.status)console.error('Revocar cuenta:',e);return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible desactivar la cuenta'});}
}
module.exports = { listar, viviendas, revisar, revocar };
