const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { crearRelaciones, viviendaIds } = require('./condominos-viviendas.service');
const { buscarUsuariosPorTelefono } = require('./telefono-cuenta.service');
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
const trialHouse = casa => casa && (/\bprueba\b/i.test((casa.calleCorrecta || '') + ' ' + (casa.calle || '')) || /^TEST(?:-|$)/i.test(String(casa.numero)));
const trialUser = user => /^AUTO_USERS_PRUEBA:[a-f0-9]{32}$/.test(user?.observaciones || '');
function crearServicio({ db, Usuario, Condomino, CondominoVivienda, Casa, Rol, UsuarioCasa, Invitacion, Reporte,
    correoSender, buscarTelefono = buscarUsuariosPorTelefono, hashPassword = (value => bcrypt.hash(value, 12)) }) {
    const relaciones = crearRelaciones({ CondominoVivienda, Casa });
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
    async function createOne(id, existingTransaction) {
        const operation = async transaction => {
            const condo = await Condomino.findByPk(id, lock(transaction));
            if (!condo || !condo.activo) throw fail(409, 'Condómino inactivo; requiere revisión.');
            if (!String(condo.nombreCompleto || '').trim()) throw fail(409, 'El condómino no tiene nombre completo registrado.');
            // The condominium row serializes creation. Existing-user reads must not
            // invert the user -> condominium lock order used by acceptance/correction.
            const linked = await Usuario.findOne({ where: { condominoId: condo.id }, transaction });
            if (linked) return { condominoId: id, usuarioId: linked.id, resultado: 'EXISTENTE' };
            const casas = await relaciones.viviendas(condo.id, transaction);
            // Stable initial context; account.casaId remains an explicit selection on correction.
            const casa = casas[0];
            if (!casa) throw fail(409, 'El condómino no tiene una vivienda válida.');
            const correo = normal(condo.correo) || null;
            let existing = correo ? await Usuario.findOne({ where: { correo }, ...lock(transaction) }) : null;
            if (!existing && !correo && condo.telefono) {
                const candidates = await Usuario.findAll({ where: { casaId: { [Op.in]: casas.map(c => c.id) } }, ...lock(transaction) });
                const matches = candidates.filter(u => String(u.telefono || '').replace(/\D/g, '') === String(condo.telefono).replace(/\D/g, '')
                    && compact([u.nombre, u.apellidoPaterno, u.apellidoMaterno].filter(Boolean).join(' ')) === compact(condo.nombreCompleto));
                if (matches.length > 1) throw fail(409, 'Existen varias cuentas coincidentes; revisa el vínculo del condómino.');
                existing = matches[0] || null;
            }
            if (existing) {
                const role = await Rol.findByPk(existing.rolId, { transaction });
                const actualName = [existing.nombre, existing.apellidoPaterno, existing.apellidoMaterno].filter(Boolean).join(' ');
                if (!existing.condominoId && existing.estatus === 'ACTIVO' && role?.nombre === 'CONDOMINO'
                    && casas.some(c => String(c.id) === String(existing.casaId)) && compact(actualName) === compact(condo.nombreCompleto)) {
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
            for (const vivienda of casas) await UsuarioCasa.findOrCreate({ where: { usuarioId: user.id, casaId: vivienda.id },
                defaults: { tipo: 'MIEMBRO', activo: false }, transaction });
            await Invitacion.create({ usuarioId: user.id, envioEstado: 'SIN_ENVIAR' }, { transaction });
            return { condominoId: id, usuarioId: user.id, resultado: 'CREADO' };
        };
        return existingTransaction ? operation(existingTransaction) : db.transaction(operation);
    }
    async function viviendasPrueba() {
        return (await Casa.findAll({ attributes: ['id', 'calle', 'calleCorrecta', 'numero'], order: [['id', 'ASC']] })).filter(trialHouse);
    }
    async function crearPrueba(casaId, clave) {
        if (!/^[a-f0-9]{32}$/.test(String(clave || ''))) throw fail(400, 'Identificador de prueba inválido.');
        return db.transaction(async transaction => {
            const casa = await Casa.findByPk(casaId, lock(transaction));
            if (!trialHouse(casa)) throw fail(400, 'Selecciona una vivienda identificada como Prueba o TEST.');
            const observaciones = 'AUTO_USERS_PRUEBA:' + clave;
            const existing = await Usuario.findOne({ where: { observaciones }, transaction });
            if (existing) {
                if (String(existing.casaId) !== String(casaId)) throw fail(409, 'Esta prueba ya pertenece a otra vivienda.');
                return { usuarioId: existing.id, resultado: 'EXISTENTE', cuentaAceptada: existing.cuentaAceptada };
            }
            const condo = await Condomino.create({ nombreCompleto: 'Prueba Registro ' + clave.slice(0, 6),
                correo: 'preregistro.prueba.' + clave + '@example.com', telefono: null, activo: true,
                creadoEn: new Date(), actualizadoEn: new Date() }, { transaction });
            await relaciones.reemplazar(condo.id, [casa.id], transaction);
            const result = await createOne(condo.id, transaction);
            await Usuario.update({ observaciones }, { where: { id: result.usuarioId }, transaction });
            return { ...result, cuentaAceptada: false };
        });
    }
    async function enlacePrueba(id, frontend) {
        let url;
        try { url = new URL(frontend); } catch { throw fail(400, 'Dirección del portal inválida.'); }
        if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' ||
            (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw fail(400, 'Dirección del portal inválida.');
        return db.transaction(async transaction => {
            const user = await Usuario.findByPk(id, lock(transaction));
            if (!trialUser(user) || !pending(user)) throw fail(409, 'Solo se generan enlaces para cuentas de prueba pendientes.');
            const casa = await Casa.findByPk(user.casaId, { transaction });
            if (!trialHouse(casa)) throw fail(409, 'La cuenta de prueba debe permanecer en una vivienda de pruebas.');
            if (await Reporte.findOne({ where: { usuarioId: id, estatus: 'ABIERTO' }, transaction })) throw fail(409, 'Primero corrige el reporte abierto.');
            const [inv] = await Invitacion.findOrCreate({ where: { usuarioId: id }, defaults: { envioEstado: 'SIN_ENVIAR' }, transaction });
            const token = crypto.randomBytes(32).toString('hex');
            await inv.update({ tokenHash: hash(token), expiraEn: new Date(Date.now() + 14 * 86400000),
                envioEstado: 'PRUEBA_SIN_ENVIO', ultimoError: null }, { transaction });
            return { enlace: url.href.replace(/\/$/, '') + '/aceptar-cuenta.html#invitacion=' + token };
        });
    }
    async function listarPruebas(page = 1) {
        const { count, rows } = await Usuario.findAndCountAll({ where: { observaciones: { [Op.like]: 'AUTO_USERS_PRUEBA:%' } },
            attributes: ['id', 'condominoId', 'casaId', 'nombre', 'apellidoPaterno', 'apellidoMaterno', 'nombreUsuario', 'correo', 'telefono', 'cuentaAceptada', 'estatus', 'creadoEn', 'actualizadoEn', 'observaciones'],
            order: [['id', 'DESC']], limit: 50, offset: (page - 1) * 50, raw: true });
        const registros = [];
        for (const row of rows.filter(trialUser)) {
            const { observaciones, ...user } = row;
            const casa = await Casa.findByPk(user.casaId, { attributes: ['id', 'calle', 'calleCorrecta', 'numero'] });
            const condo = await Condomino.findByPk(user.condominoId, { attributes: ['id', 'nombreCompleto', 'correo', 'telefono', 'activo'] });
            const invitacion = await Invitacion.findByPk(user.id, { attributes: ['envioEstado', 'expiraEn', 'enviadoEn', 'ultimoError'] });
            registros.push({ ...user, casa, viviendas: await relaciones.viviendas(user.condominoId), condomino: condo, invitacion: invitacion ? { envioEstado: invitacion.envioEstado, expiraEn: invitacion.expiraEn, enviadoEn: invitacion.enviadoEn, ultimoError: invitacion.ultimoError } : null });
        }
        return { registros, total: count, pagina: page };
    }
    async function borrarPrueba(id) {
        return db.transaction(async transaction => {
            const user = await Usuario.findByPk(id, lock(transaction));
            if (!trialUser(user)) throw fail(403, 'Solo puedes borrar cuentas generadas como prueba.');
            const role = await Rol.findByPk(user.rolId, { transaction });
            if (role?.nombre !== 'CONDOMINO') throw fail(409, 'Esta cuenta tiene otro rol y requiere revisión.');
            const condo = await Condomino.findByPk(user.condominoId, lock(transaction));
            if (!condo) throw fail(409, 'El vínculo del condómino requiere revisión.');
            if (await Usuario.findOne({ where: { condominoId: condo.id, id: { [Op.ne]: id } }, transaction })) throw fail(409, 'El condómino tiene otra cuenta asociada.');
            // Check only real tables/columns; selecting a complete model can fail
            // on unrelated legacy fields before deletion is even attempted.
            const models = Object.values(db.models || {}).filter(model => ![Usuario, Condomino, CondominoVivienda, UsuarioCasa, Invitacion, Reporte].includes(model));
            const candidates = models.map(model => {
                const references = [];
                for (const [attribute, definition] of Object.entries(model.rawAttributes || {})) {
                    const reference = definition.references?.model;
                    const table = typeof reference === 'string' ? reference : reference?.tableName;
                    const target = table === 'usuarios' || /usuario.*Id$/i.test(attribute) ? id
                        : table === 'condominos' || /condomino.*Id$/i.test(attribute) ? condo.id : null;
                    if (target !== null) references.push({ attribute, column: definition.field || attribute, target });
                }
                return { model, references };
            }).filter(candidate => candidate.references.length);
            if (candidates.length) {
                const qi = db.getQueryInterface();
                const existingTables = new Set((await qi.showAllTables({ transaction })).map(table => typeof table === 'string' ? table : table.tableName));
                for (const { model, references } of candidates) {
                    const table = model.getTableName();
                    const tableName = typeof table === 'string' ? table : table.tableName;
                    if (!existingTables.has(tableName)) continue; // An absent optional module has no rows to protect.
                    try {
                        const columns = await qi.describeTable(table, { transaction });
                        const present = references.filter(reference => Object.hasOwn(columns, reference.column));
                        if (!present.length) continue;
                        const found = await model.findOne({ attributes: present.map(reference => reference.attribute),
                            where: { [Op.or]: present.map(reference => ({ [reference.attribute]: reference.target })) },
                            ...lock(transaction) });
                        if (found) throw fail(409, 'Esta cuenta tiene historial en ' + tableName + '. Revisa esas referencias antes de borrarla.');
                    } catch (error) {
                        if (error.status) throw error;
                        const code = String(error.original?.code || error.parent?.code || error.name || 'ERROR_INTERNO');
                        const safeCode = /^[A-Za-z0-9_]{1,80}$/.test(code) ? code : 'ERROR_INTERNO';
                        throw fail(503, 'No se pudo revisar la tabla ' + tableName + ' (' + safeCode + ') antes de borrar. Revisa el esquema del backend o sus registros de error. No se eliminó ningún dato.');
                    }
                }
            }
            await Reporte.destroy({ where: { usuarioId: id }, transaction });
            await Invitacion.destroy({ where: { usuarioId: id }, transaction });
            await UsuarioCasa.destroy({ where: { usuarioId: id }, transaction });
            await Usuario.destroy({ where: { id }, transaction });
            await CondominoVivienda.destroy({ where: { condominoId: condo.id }, transaction });
            await Condomino.destroy({ where: { id: condo.id }, transaction });
            return { mensaje: 'Cuenta de prueba, condómino ficticio, invitación y reportes eliminados. La vivienda se conserva.' };
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
        const casas = condo ? await relaciones.viviendas(condo.id, transaction) : [];
        if (!casa || !condo?.activo || !casas.some(c => String(c.id) === String(casa.id))) throw fail(409, 'La vivienda requiere revisión de Administración.');
        if (trialUser(user) && casas.some(c => !trialHouse(c))) throw fail(409, 'Las pruebas solo pueden vincular viviendas de pruebas.');
        return { user, inv, casa, condo, casas };
    }
    const publicData = ({ user, casa, condo, casas }) => ({ nombre: condo.nombreCompleto, calle: casa.calleCorrecta || casa.calle,
        numero: casa.numero, casaId: casa.id, viviendas: casas.map(c => ({ id: c.id, calle: c.calleCorrecta || c.calle, numero: c.numero })),
        nombreUsuario: user.nombreUsuario, correo: user.correo || '' });
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
            const { user, inv, casa, casas } = await context(token, transaction);
            const confirmed = body.viviendasConfirmadas;
            const correct = Array.isArray(confirmed)
                ? confirmed.length === casas.length && new Set(confirmed.map(c => String(c?.id))).size === casas.length
                  && casas.every(c => confirmed.some(v => String(v?.id) === String(c.id) && houseNumber(v.numero) === houseNumber(c.numero)))
                : casas.length === 1 && houseNumber(body.numeroConfirmado) === houseNumber(casa.numero);
            if (!correct) throw fail(400, 'Confirma el número de cada vivienda asignada. Si alguna no te pertenece, reporta el error.');
            if (await conflicts(data.nombreUsuario, data.correo, user.id, transaction)) throw fail(409, 'El nombre de usuario o correo ya está registrado. Usa otro.');
            const role = await Rol.findByPk(user.rolId, { transaction });
            if (!role?.activo || role.nombre !== 'CONDOMINO') throw fail(409, 'El rol de esta cuenta requiere revisión.');
            await user.update({ ...data, contrasenaHash, cuentaAceptada: true, estatus: 'ACTIVO',
                ultimoAccesoEn: new Date(), actualizadoEn: new Date(), sesionVersion: Number(user.sesionVersion || 0) + 1 }, { transaction });
            await Condomino.update({ correo: data.correo, actualizadoEn: new Date() }, { where: { id: user.condominoId }, transaction });
            await UsuarioCasa.update({ activo: false }, { where: { usuarioId: user.id }, transaction });
            for (const vivienda of casas) {
                const [link] = await UsuarioCasa.findOrCreate({ where: { usuarioId: user.id, casaId: vivienda.id }, defaults: { tipo: 'MIEMBRO', activo: true }, transaction });
                await link.update({ activo: true, desvinculadoEn: null }, { transaction });
            }
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
    async function editar(id, body, actorId, onlyTrial = false) {
        const data = credentials(body), casaId = Number(body.casaId), nombreCompleto = String(body.nombreCompleto || '').trim();
        if (!Number.isSafeInteger(casaId) || casaId < 1 || !nombreCompleto || nombreCompleto.length > 180) throw fail(400, 'Selecciona una vivienda existente y revisa el nombre.');
        const telefono = String(body.telefono || '').trim();
        if (telefono.length > 25) throw fail(400, 'Revisa el teléfono (máximo 25 caracteres).');
        return db.transaction(async transaction => {
            const user = await Usuario.findByPk(id, lock(transaction));
            if (onlyTrial && !trialUser(user)) throw fail(403, 'Solo puedes editar cuentas generadas como prueba.');
            if (!pending(user) && !(onlyTrial && user?.cuentaAceptada === true && user.estatus === 'ACTIVO')) throw fail(409, 'Solo se pueden corregir prerregistros pendientes o cuentas de prueba activas.');
            if (onlyTrial && (await Rol.findByPk(user.rolId, { transaction }))?.nombre !== 'CONDOMINO') throw fail(409, 'El rol de la cuenta requiere revisión.');
            const condo = await Condomino.findByPk(user.condominoId, lock(transaction));
            if (!condo) throw fail(409, 'El condómino requiere revisión.');
            const anteriores = await relaciones.viviendas(condo.id, transaction);
            if (body.viviendaIds === undefined && anteriores.length > 1) throw fail(409, 'Actualiza la página y selecciona todas las viviendas del condómino.');
            const ids = viviendaIds(body.viviendaIds === undefined ? [casaId] : body.viviendaIds);
            if (!ids.includes(casaId)) throw fail(400, 'La vivienda principal debe estar seleccionada.');
            for (const id of ids) {
                const casa = await Casa.findByPk(id, { transaction });
                if (!casa) throw fail(400, 'Una vivienda seleccionada no existe.');
                if (trialUser(user) && !trialHouse(casa)) throw fail(400, 'Las cuentas de prueba solo pueden usar viviendas de pruebas.');
            }
            await relaciones.reemplazar(condo.id, ids, transaction);
            if (await conflicts(data.nombreUsuario, data.correo, user.id, transaction)) throw fail(409, 'Usuario o correo ya registrado en otra cuenta.');
            await user.update({ ...data, ...names(nombreCompleto), casaId, telefono: telefono || null, actualizadoEn: new Date(),
                ...(onlyTrial ? { sesionVersion: Number(user.sesionVersion || 0) + 1 } : {}) }, { transaction });
            await Condomino.update({ nombreCompleto, telefono: telefono || null, correo: data.correo,
                actualizadoEn: new Date() }, { where: { id: user.condominoId }, transaction });
            await UsuarioCasa.update({ activo: false }, { where: { usuarioId: user.id }, transaction });
            for (const id of ids) {
                const [membership] = await UsuarioCasa.findOrCreate({ where: { usuarioId: user.id, casaId: id }, defaults: { tipo: 'MIEMBRO', activo: false }, transaction });
                await membership.update({ activo: user.cuentaAceptada === true, desvinculadoEn: null }, { transaction });
            }
            await Invitacion.update({ tokenHash: null, expiraEn: null, envioEstado: 'SIN_ENVIAR' }, { where: { usuarioId: user.id }, transaction });
            await Reporte.update({ estatus: 'CORREGIDO', corregidoEn: new Date(), corregidoPor: actorId }, { where: { usuarioId: user.id, estatus: 'ABIERTO' }, transaction });
            return { mensaje: 'Prerregistro corregido. Envía una nueva invitación.' };
        });
    }
    async function sendOne(id, publicRequest = false) {
        if (trialUser(await Usuario.findByPk(id))) return { usuarioId: id, resultado: 'PRUEBA_SIN_ENVIO' };
        const config = correoSender.configuracion();
        const data = await db.transaction(async transaction => {
            const user = await Usuario.findByPk(id, lock(transaction));
            if (!pending(user)) return null;
            if (await Reporte.findOne({ where: { usuarioId: id, estatus: 'ABIERTO' }, transaction })) throw fail(409, 'Primero corrige el reporte abierto.');
            const casa = await Casa.findByPk(user.casaId, { transaction });
            const condo = await Condomino.findByPk(user.condominoId, lock(transaction));
            const casas = condo?.activo ? await relaciones.viviendas(condo.id, transaction) : [];
            if (!casas.some(c => String(c.id) === String(user.casaId))) throw fail(409, 'Revisa las viviendas del condómino antes de enviar.');
            if (!casa || !correoSender.correoValido(user.correo)) throw fail(400, 'Corrige la vivienda o el correo antes de enviar.');
            const [inv] = await Invitacion.findOrCreate({ where: { usuarioId: id }, defaults: { envioEstado: 'SIN_ENVIAR' }, transaction });
            if (publicRequest && inv.enviadoEn && inv.tokenHash && new Date(inv.expiraEn) > new Date() && new Date(inv.enviadoEn).getTime() > Date.now() - 5 * 60000) return { reciente: true };
            // Avoid simultaneous clicks sending twice; a stalled request can be retried after 1 minute.
            if (inv.envioEstado === 'ENVIANDO' && inv.expiraEn && new Date(inv.expiraEn).getTime() - 14 * 86400000 > Date.now() - 60000) throw fail(409, 'Esta invitación ya se está enviando.');
            const token = crypto.randomBytes(32).toString('hex'), digest = hash(token);
            await inv.update({ tokenHash: digest, expiraEn: new Date(Date.now() + 14 * 86400000),
                envioEstado: 'ENVIANDO', ultimoError: null }, { transaction });
            return { digest, correo: user.correo, nombre: [user.nombre, user.apellidoPaterno, user.apellidoMaterno].filter(Boolean).join(' '),
                domicilio: casas.map(c => (c.calleCorrecta || c.calle) + ' ' + c.numero).join('; '),
                enlace: config.frontend + '/aceptar-cuenta.html#invitacion=' + token };
        });
        if (!data) return { usuarioId: id, resultado: 'ACEPTADA_O_NO_ELEGIBLE' };
        if (data.reciente) return { usuarioId: id, resultado: 'ENVIADO_RECIENTE' };
        try {
            const mensajeId = await correoSender.enviarInvitacion(data);
            await Invitacion.update({ envioEstado: 'ENVIADO', enviadoEn: new Date(), mensajeId }, { where: { usuarioId: id, tokenHash: data.digest } });
            return { usuarioId: id, resultado: 'ENVIADO' };
        } catch (error) {
            await Invitacion.update({ envioEstado: 'ERROR', ultimoError: 'No se confirmó el envío; revisa el correo y reintenta.' }, { where: { usuarioId: id, tokenHash: data.digest } });
            return { usuarioId: id, resultado: 'ERROR', mensaje: 'No se confirmó el envío; revisa el destinatario y la configuración SMTP.' };
        }
    }
    async function enviarLote(afterId = 0, id = null) {
        correoSender.configuracion(); // No token rotation or fake success if provider is not configured.
        const rows = id ? [{ id }] : await Usuario.findAll({ where: { condominoId: { [Op.ne]: null }, cuentaAceptada: false,
            estatus: 'PENDIENTE', id: { [Op.gt]: afterId } }, order: [['id', 'ASC']], limit: 1 });
        const results = [];
        for (const user of rows) {
            try { results.push(await sendOne(user.id)); }
            catch (error) { results.push({ usuarioId: user.id, resultado: 'REVISAR', mensaje: error.status ? error.message : 'No fue posible preparar la invitación.' }); }
        }
        return { resultados: results, siguiente: !id && rows.length === 1 ? rows.at(-1).id : null };
    }
    async function consultarTelefono(telefono) {
        const users = await buscarTelefono(Usuario, telefono, { attributes: ['id', 'estatus', 'cuentaAceptada', 'condominoId'] });
        if (!users.length) return { estado: 'NUEVA' };
        if (users.length !== 1) return { estado: 'REVISION', mensaje: 'Ese teléfono corresponde a más de una cuenta. Usa tu usuario/correo o contacta a Administración.' };
        const user = users[0];
        if (user.estatus === 'ACTIVO' && user.cuentaAceptada !== false) return { estado: 'ACEPTADA' };
        if (pending(user)) return { estado: 'PRERREGISTRO' };
        return { estado: 'REVISION', mensaje: 'Tu cuenta requiere revisión de Administración. Si ya enviaste una solicitud, espera su autorización.' };
    }
    async function enviarPorTelefono(telefono) {
        const users = await buscarTelefono(Usuario, telefono);
        if (users.length !== 1 || !pending(users[0]) || trialUser(users[0])) throw fail(409, 'Solicita ayuda a Administración para revisar el acceso a tu cuenta.');
        const result = await sendOne(users[0].id, true);
        if (!['ENVIADO', 'ENVIADO_RECIENTE'].includes(result.resultado)) throw fail(503, 'No se pudo confirmar el envío del correo. Contacta a Administración.');
        // Never return account details, address, email, or activation tokens from a phone lookup.
        return { mensaje: 'Revisa el correo registrado para tu cuenta y abre el enlace personal. Si solicitaste uno hace poco, utiliza ese mismo enlace. Si no tienes acceso a ese correo, contacta a Administración.' };
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
            attributes: ['id', 'condominoId', 'casaId', 'nombre', 'apellidoPaterno', 'apellidoMaterno', 'nombreUsuario', 'correo', 'telefono', 'cuentaAceptada', 'estatus'], raw: true }) : [];
        for (const user of [...rows, ...reportUsers]) user.viviendas = await relaciones.viviendas(user.condominoId);
        return { total: count, pagina: page, registros: rows.map(u => ({ ...u, casa: casas.find(c => String(c.id) === String(u.casaId)),
            invitacion: invitaciones.find(i => String(i.usuarioId) === String(u.id)) })),
            totalReportes: reportsResult.count, paginaReportes: reportPage,
            reportes: reportes.map(r => ({ ...r, usuario: reportUsers.find(u => String(u.id) === String(r.usuarioId)) })) };
    }
    return { consultarTelefono, enviarPorTelefono, listarPruebas, borrarPrueba, editarPrueba: (id, body, actorId) => editar(id, body, actorId, true), viviendasPrueba, crearPrueba, enlacePrueba, crearLote, createOne, consultar, aceptar, reportar, editar, enviarLote, sendOne, listar };
}
module.exports = { crearServicio, credentials, houseNumber, names };
