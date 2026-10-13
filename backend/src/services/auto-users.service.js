const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const fail = (status, message) => Object.assign(new Error(message), { status });
const normal = value => String(value || '').normalize('NFKC').trim().toLowerCase();
const compact = value => normal(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const houseNumber = value => String(value || '').normalize('NFKC').trim().toUpperCase().replace(/\s+/g, '');
const validEmail = value => !value || (value.length <= 150 && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value));
const validUsername = value => /^[a-z0-9][a-z0-9._@+-]{2,189}$/.test(value);
function names(fullName) {
    const words = String(fullName || '').trim().split(/\s+/);
    const result = words.length < 3 ? { nombre: words[0], apellidoPaterno: words.slice(1).join(' '), apellidoMaterno: null }
        : { nombre: words.slice(0, -2).join(' '), apellidoPaterno: words.at(-2), apellidoMaterno: words.at(-1) };
    if (Object.values(result).some(value => value && value.length > 100)) throw fail(400, 'El nombre excede el tamaño de la cuenta. Revisa sus componentes antes de crearla.');
    return result;
}
function credentials(body) {
    const nombreUsuario = normal(body.nombreUsuario), correo = normal(body.correo) || null;
    if (!validUsername(nombreUsuario) || !validEmail(correo)) throw fail(400, 'Escribe un usuario de 3 a 190 caracteres sin espacios y un correo válido, o deja el correo vacío si no tienes uno.');
    return { nombreUsuario, correo };
}
function crearServicio({ db, Usuario, Condomino, Casa, Rol, UsuarioCasa, Invitacion, Reporte,
    whatsapp, hashPassword = (value => bcrypt.hash(value, 12)) }) {
    const lock = transaction => ({ transaction, lock: transaction.LOCK.UPDATE });
    const pending = user => user && user.condominoId && user.cuentaAceptada === false && user.estatus === 'PENDIENTE';
    async function conflicts(nombreUsuario, correo, id, transaction) {
        const values = [...new Set([nombreUsuario, correo].filter(Boolean))];
        return Usuario.findOne({ where: { ...(id ? { id: { [Op.ne]: id } } : {}),
            [Op.or]: [{ nombreUsuario: { [Op.in]: values } }, { correo: { [Op.in]: values } }] },
            ...(transaction ? lock(transaction) : {}) });
    }
    async function username(condo, transaction) {
        const correo = normal(condo.correo), telefono = String(condo.telefono || '').replace(/\D/g, '');
        if (correo) {
            if (!validEmail(correo)) throw fail(409, 'El correo del condómino debe corregirse antes de crear su cuenta.');
            if (await conflicts(correo, correo, null, transaction)) throw fail(409, 'El correo coincide con otra cuenta; Administración debe revisar la identidad.');
            return correo;
        }
        const base = telefono || 'condomino' + condo.id;
        const phoneRows = telefono ? await Usuario.findAll({ where: { telefono: { [Op.ne]: null } }, attributes: ['telefono'], transaction }) : [];
        const samePhone = phoneRows.some(u => String(u.telefono || '').replace(/\D/g, '') === telefono);
        if (!samePhone && !(await conflicts(base, null, null, transaction))) return base;
        const withName = (base + compact(condo.nombreCompleto)).slice(0, 175);
        if (!(await conflicts(withName, null, null, transaction))) return withName;
        return withName + '.' + condo.id;
    }
    async function createOne(id) {
        return db.transaction(async transaction => {
            const condo = await Condomino.findByPk(id, lock(transaction));
            if (!condo || !condo.activo) throw fail(409, 'Condómino inactivo; requiere revisión.');
            if (!String(condo.nombreCompleto || '').trim()) throw fail(409, 'El condómino no tiene nombre completo registrado.');
            // The condominium row serializes creation. Existing-user reads must not
            // invert the user -> condominium lock order used by acceptance/correction.
            const linked = await Usuario.findOne({ where: { condominoId: condo.id }, transaction });
            if (linked) return { condominoId: id, usuarioId: linked.id, resultado: 'EXISTENTE' };
            const casa = await Casa.findByPk(condo.direccionId, { transaction });
            if (!casa) throw fail(409, 'El condómino no tiene una vivienda válida.');
            const correo = normal(condo.correo) || null;
            let existing = correo ? await Usuario.findOne({ where: { correo }, ...lock(transaction) }) : null;
            if (!existing && !correo && condo.telefono) {
                const candidates = await Usuario.findAll({ where: { casaId: casa.id }, ...lock(transaction) });
                const matches = candidates.filter(u => String(u.telefono || '').replace(/\D/g, '') === String(condo.telefono).replace(/\D/g, '')
                    && compact([u.nombre, u.apellidoPaterno, u.apellidoMaterno].filter(Boolean).join(' ')) === compact(condo.nombreCompleto));
                if (matches.length > 1) throw fail(409, 'Existen varias cuentas coincidentes; revisa el vínculo del condómino.');
                existing = matches[0] || null;
            }
            if (existing) {
                const role = await Rol.findByPk(existing.rolId, { transaction });
                const actualName = [existing.nombre, existing.apellidoPaterno, existing.apellidoMaterno].filter(Boolean).join(' ');
                if (!existing.condominoId && existing.estatus === 'ACTIVO' && role?.nombre === 'CONDOMINO'
                    && String(existing.casaId) === String(casa.id) && compact(actualName) === compact(condo.nombreCompleto)) {
                    await existing.update({ condominoId: condo.id }, { transaction });
                    return { condominoId: id, usuarioId: existing.id, resultado: 'VINCULADO_EXISTENTE' };
                }
                throw fail(409, 'Ese correo ya tiene cuenta o solicitud; revisa la identidad y vivienda antes de vincular.');
            }
            const role = await Rol.findOne({ where: { nombre: 'CONDOMINO', activo: true }, transaction });
            if (!role) throw fail(503, 'El rol Condómino no está disponible.');
            const nombreUsuario = await username(condo, transaction);
            const randomPassword = await hashPassword(crypto.randomBytes(32).toString('hex'));
            const user = await Usuario.create({ ...names(condo.nombreCompleto), condominoId: condo.id,
                casaId: casa.id, rolId: role.id, correo, nombreUsuario,
                telefono: String(condo.telefono || '').length <= 25 ? (String(condo.telefono || '').trim() || null) : null,
                contrasenaHash: randomPassword, cuentaAceptada: false, estatus: 'PENDIENTE',
                creadoEn: new Date(), actualizadoEn: new Date() }, { transaction });
            await UsuarioCasa.findOrCreate({ where: { usuarioId: user.id, casaId: casa.id },
                defaults: { tipo: 'MIEMBRO', activo: false }, transaction });
            await Invitacion.create({ usuarioId: user.id, envioEstado: 'SIN_ENVIAR' }, { transaction });
            return { condominoId: id, usuarioId: user.id, resultado: 'CREADO' };
        });
    }
    async function crearLote(afterId = 0) {
        const rows = await Condomino.findAll({ where: { id: { [Op.gt]: afterId } }, order: [['id', 'ASC']], limit: 20 });
        const results = [];
        for (const row of rows) {
            try { results.push(await createOne(row.id)); }
            catch (error) { results.push({ condominoId: row.id, nombre: row.nombreCompleto, resultado: 'REVISAR', mensaje: error.status ? error.message : 'Conflicto de datos; revisa el registro antes de reintentar.' }); }
        }
        return { resultados: results, siguiente: rows.length === 20 ? rows.at(-1).id : null };
    }
    async function context(token, transaction) {
        if (!/^[a-f0-9]{64}$/.test(String(token || ''))) throw fail(410, 'Este enlace ya no es válido. Solicita una nueva invitación.');
        const digest = hash(token);
        const found = await Invitacion.findOne({ where: { tokenHash: digest }, transaction });
        if (!found) throw fail(410, 'Este enlace venció, fue reemplazado o ya se utilizó.');
        const user = await Usuario.findByPk(found.usuarioId, transaction ? lock(transaction) : {});
        const inv = transaction ? await Invitacion.findByPk(found.usuarioId, lock(transaction)) : found;
        if (!pending(user) || inv?.tokenHash !== digest || !inv.expiraEn || new Date(inv.expiraEn) <= new Date()) throw fail(410, 'Este enlace venció, fue reemplazado o ya se utilizó.');
        const open = await Reporte.findOne({ where: { usuarioId: user.id, estatus: 'ABIERTO' }, transaction });
        if (open) throw fail(409, 'Administración está revisando la corrección de tu registro.');
        const casa = await Casa.findByPk(user.casaId, transaction ? lock(transaction) : {});
        const condo = await Condomino.findByPk(user.condominoId, transaction ? lock(transaction) : {});
        if (!casa || !condo?.activo || String(condo.direccionId) !== String(casa.id)) throw fail(409, 'La vivienda requiere revisión de Administración.');
        return { user, inv, casa, condo };
    }
    const publicData = ({ user, casa, condo }) => ({ nombre: condo.nombreCompleto, calle: casa.calleCorrecta || casa.calle,
        numero: casa.numero, nombreUsuario: user.nombreUsuario, correo: user.correo || '' });
    async function consultar(token) { return publicData(await context(token)); }
    async function aceptar(token, body) {
        const data = credentials(body), password = body.contrasena;
        if (typeof password !== 'string' || password !== body.confirmarContrasena || password.length < 8
            || Buffer.byteLength(password, 'utf8') > 72 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
            throw fail(400, 'La contraseña y confirmación deben coincidir; usa 8 caracteres, mayúscula, minúscula y número.');
        }
        await context(token); // Refuse invalid links before expensive password hashing; recheck under lock below.
        const contrasenaHash = await hashPassword(password);
        return db.transaction(async transaction => {
            const { user, inv, casa } = await context(token, transaction);
            if (houseNumber(body.numeroConfirmado) !== houseNumber(casa.numero)) throw fail(400, 'El número que escribiste no coincide con tu vivienda. Revisa o reporta el error.');
            if (await conflicts(data.nombreUsuario, data.correo, user.id, transaction)) throw fail(409, 'El nombre de usuario o correo ya está registrado. Usa otro.');
            const role = await Rol.findByPk(user.rolId, { transaction });
            if (!role?.activo || role.nombre !== 'CONDOMINO') throw fail(409, 'El rol de esta cuenta requiere revisión.');
            await user.update({ ...data, contrasenaHash, cuentaAceptada: true, estatus: 'ACTIVO',
                ultimoAccesoEn: new Date(), actualizadoEn: new Date(), sesionVersion: Number(user.sesionVersion || 0) + 1 }, { transaction });
            await Condomino.update({ correo: data.correo, actualizadoEn: new Date() }, { where: { id: user.condominoId }, transaction });
            await UsuarioCasa.update({ activo: false }, { where: { usuarioId: user.id }, transaction });
            const [link] = await UsuarioCasa.findOrCreate({ where: { usuarioId: user.id, casaId: casa.id }, defaults: { tipo: 'MIEMBRO', activo: true }, transaction });
            await link.update({ activo: true, desvinculadoEn: null }, { transaction });
            await inv.update({ tokenHash: null, expiraEn: null }, { transaction });
            const tokenSesion = jwt.sign({ usuarioId: user.id, casaId: casa.id, rolId: user.rolId,
                rol: role.nombre, sesionVersion: Number(user.sesionVersion) }, process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
            return { token: tokenSesion, usuario: { id: user.id, casaId: casa.id, nombre: user.nombre,
                apellidoPaterno: user.apellidoPaterno, apellidoMaterno: user.apellidoMaterno,
                nombreUsuario: user.nombreUsuario, correo: user.correo, cuentaAceptada: true, estatus: 'ACTIVO',
                rol: { id: role.id, nombre: role.nombre }, casa: { id: casa.id, calle: casa.calle,
                    calleCorrecta: casa.calleCorrecta, numero: casa.numero } } };
        });
    }
    async function reportar(token, comentario) {
        comentario = String(comentario || '').trim();
        if (comentario.length < 5 || comentario.length > 2000) throw fail(400, 'Describe la corrección con entre 5 y 2000 caracteres.');
        return db.transaction(async transaction => {
            const info = await context(token, transaction);
            await Reporte.create({ usuarioId: info.user.id, comentario, datosReportados: publicData(info), estatus: 'ABIERTO' }, { transaction });
            await info.inv.update({ tokenHash: null, expiraEn: null, envioEstado: 'REQUIERE_CORRECCION' }, { transaction });
            return { mensaje: 'Nuestro administrador revisará tu caso y te enviará otro enlace una vez cotejada la información.' };
        });
    }
    async function editar(id, body, actorId) {
        const data = credentials(body), casaId = Number(body.casaId), nombreCompleto = String(body.nombreCompleto || '').trim();
        if (!Number.isSafeInteger(casaId) || casaId < 1 || !nombreCompleto || nombreCompleto.length > 180) throw fail(400, 'Selecciona una vivienda existente y revisa el nombre.');
        const telefono = String(body.telefono || '').trim();
        if (telefono.length > 25) throw fail(400, 'Revisa el teléfono (máximo 25 caracteres).');
        return db.transaction(async transaction => {
            const user = await Usuario.findByPk(id, lock(transaction));
            if (!pending(user)) throw fail(409, 'Solo se pueden corregir prerregistros todavía no aceptados.');
            const casa = await Casa.findByPk(casaId, { transaction });
            if (!casa) throw fail(400, 'La vivienda seleccionada no existe.');
            if (await conflicts(data.nombreUsuario, data.correo, user.id, transaction)) throw fail(409, 'Usuario o correo ya registrado en otra cuenta.');
            await user.update({ ...data, ...names(nombreCompleto), casaId, telefono: telefono || null, actualizadoEn: new Date() }, { transaction });
            await Condomino.update({ direccionId: casaId, nombreCompleto, telefono: telefono || null, correo: data.correo,
                actualizadoEn: new Date() }, { where: { id: user.condominoId }, transaction });
            await UsuarioCasa.update({ activo: false }, { where: { usuarioId: user.id }, transaction });
            await UsuarioCasa.findOrCreate({ where: { usuarioId: user.id, casaId }, defaults: { tipo: 'MIEMBRO', activo: false }, transaction });
            await Invitacion.update({ tokenHash: null, expiraEn: null, envioEstado: 'SIN_ENVIAR' }, { where: { usuarioId: user.id }, transaction });
            await Reporte.update({ estatus: 'CORREGIDO', corregidoEn: new Date(), corregidoPor: actorId }, { where: { usuarioId: user.id, estatus: 'ABIERTO' }, transaction });
            return { mensaje: 'Prerregistro corregido. Envía una nueva invitación.' };
        });
    }
    async function sendOne(id) {
        const config = whatsapp.configuracion();
        const data = await db.transaction(async transaction => {
            const user = await Usuario.findByPk(id, lock(transaction));
            if (!pending(user)) return null;
            if (await Reporte.findOne({ where: { usuarioId: id, estatus: 'ABIERTO' }, transaction })) throw fail(409, 'Primero corrige el reporte abierto.');
            const casa = await Casa.findByPk(user.casaId, { transaction });
            if (!casa || !whatsapp.telefonoWhatsApp(user.telefono)) throw fail(400, 'Corrige la vivienda o el teléfono antes de enviar.');
            const [inv] = await Invitacion.findOrCreate({ where: { usuarioId: id }, defaults: { envioEstado: 'SIN_ENVIAR' }, transaction });
            // Avoid simultaneous clicks sending twice; a stalled request can be retried after 1 minute.
            if (inv.envioEstado === 'ENVIANDO' && inv.expiraEn && new Date(inv.expiraEn).getTime() - 14 * 86400000 > Date.now() - 60000) throw fail(409, 'Esta invitación ya se está enviando.');
            const token = crypto.randomBytes(32).toString('hex'), digest = hash(token);
            await inv.update({ tokenHash: digest, expiraEn: new Date(Date.now() + 14 * 86400000),
                envioEstado: 'ENVIANDO', ultimoError: null }, { transaction });
            return { digest, telefono: user.telefono, nombre: [user.nombre, user.apellidoPaterno, user.apellidoMaterno].filter(Boolean).join(' '),
                domicilio: (casa.calleCorrecta || casa.calle) + ' ' + casa.numero,
                enlace: config.frontend + '/aceptar-cuenta.html#invitacion=' + token };
        });
        if (!data) return { usuarioId: id, resultado: 'ACEPTADA_O_NO_ELEGIBLE' };
        try {
            const mensajeId = await whatsapp.enviarInvitacion(data);
            await Invitacion.update({ envioEstado: 'ENVIADO', enviadoEn: new Date(), mensajeId }, { where: { usuarioId: id, tokenHash: data.digest } });
            return { usuarioId: id, resultado: 'ENVIADO' };
        } catch (error) {
            await Invitacion.update({ envioEstado: 'ERROR', ultimoError: 'No se confirmó el envío; revisa WhatsApp y reintenta.' }, { where: { usuarioId: id, tokenHash: data.digest } });
            return { usuarioId: id, resultado: 'ERROR', mensaje: 'No se confirmó el envío; revisa el teléfono y la configuración de WhatsApp.' };
        }
    }
    async function enviarLote(afterId = 0, id = null) {
        whatsapp.configuracion(); // No token rotation or fake success if provider is not configured.
        const rows = id ? [{ id }] : await Usuario.findAll({ where: { condominoId: { [Op.ne]: null }, cuentaAceptada: false,
            estatus: 'PENDIENTE', id: { [Op.gt]: afterId } }, order: [['id', 'ASC']], limit: 5 });
        const results = [];
        for (const user of rows) {
            try { results.push(await sendOne(user.id)); }
            catch (error) { results.push({ usuarioId: user.id, resultado: 'REVISAR', mensaje: error.status ? error.message : 'No fue posible preparar la invitación.' }); }
        }
        return { resultados: results, siguiente: !id && rows.length === 5 ? rows.at(-1).id : null };
    }
    async function listar(page = 1, reportPage = 1) {
        const { count, rows } = await Usuario.findAndCountAll({ where: { condominoId: { [Op.ne]: null } },
            attributes: ['id', 'condominoId', 'casaId', 'nombre', 'apellidoPaterno', 'apellidoMaterno', 'nombreUsuario', 'correo', 'telefono', 'cuentaAceptada', 'estatus'],
            order: [['id', 'ASC']], limit: 50, offset: (page - 1) * 50, raw: true });
        const ids = rows.map(r => r.id), houseIds = rows.map(r => r.casaId);
        const [casas, invitaciones, reportsResult] = await Promise.all([
            ids.length ? Casa.findAll({ where: { id: { [Op.in]: houseIds } }, attributes: ['id', 'calle', 'calleCorrecta', 'numero'], raw: true }) : [],
            ids.length ? Invitacion.findAll({ where: { usuarioId: { [Op.in]: ids } }, attributes: ['usuarioId', 'envioEstado', 'enviadoEn', 'ultimoError'], raw: true }) : [],
            Reporte.findAndCountAll({ order: [['estatus', 'ASC'], ['id', 'DESC']], limit: 50, offset: (reportPage - 1) * 50, raw: true })
        ]);
        const reportes = reportsResult.rows;
        const reportUserIds = [...new Set(reportes.map(r => r.usuarioId))];
        const reportUsers = reportUserIds.length ? await Usuario.findAll({ where: { id: { [Op.in]: reportUserIds } },
            attributes: ['id', 'casaId', 'nombre', 'apellidoPaterno', 'apellidoMaterno', 'nombreUsuario', 'correo', 'telefono', 'cuentaAceptada', 'estatus'], raw: true }) : [];
        return { total: count, pagina: page, registros: rows.map(u => ({ ...u, casa: casas.find(c => String(c.id) === String(u.casaId)),
            invitacion: invitaciones.find(i => String(i.usuarioId) === String(u.id)) })),
            totalReportes: reportsResult.count, paginaReportes: reportPage,
            reportes: reportes.map(r => ({ ...r, usuario: reportUsers.find(u => String(u.id) === String(r.usuarioId)) })) };
    }
    return { crearLote, createOne, consultar, aceptar, reportar, editar, enviarLote, sendOne, listar };
}
module.exports = { crearServicio, credentials, houseNumber, names };
