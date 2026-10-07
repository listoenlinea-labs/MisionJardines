/* eslint-disable no-console */
require('dotenv').config();

const { withC3, getDirectConfig } = require('../services/zkteco-c3-client.service');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizeCard(value) {
  return String(value || '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
}

function date8(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D+/g, '');
  if (digits.length >= 8) return digits.slice(0, 8);
  throw new Error('Fecha inválida. Usa YYYY-MM-DD');
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

async function readAccessState(card) {
  return withC3(async client => {
    const users = await client.getData('user');
    const wanted = normalizeCard(card);
    const user = users.find(row => normalizeCard(row.CardNo) === wanted) || null;
    if (!user) {
      return { found: false, card: String(card), user: null, auth: null };
    }

    const pin = String(user.Pin ?? '').trim();
    let authRows = [];
    try {
      authRows = await client.getData('userauthorize');
    } catch (error) {
      throw new Error('No pude leer userauthorize: ' + error.message);
    }

    const auth = authRows.find(row => String(row.Pin ?? '').trim() === pin) || null;
    return {
      found: true,
      card: String(user.CardNo ?? card),
      pin,
      user,
      auth,
      authorized: Boolean(auth && Number(auth.AuthorizeDoorId || 0) > 0),
      doorMask: Number(auth?.AuthorizeDoorId || 0),
      timezoneId: Number(auth?.AuthorizeTimezoneId || 0)
    };
  });
}

function isTransientC3Error(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return [
    'econnreset',
    'econnrefused',
    'epipe',
    'socket hang up',
    'cerró inesperadamente',
    'no respondió a tiempo',
    'tiempo de espera agotado'
  ].some(token => message.includes(token));
}

async function readAccessStateWithRetry(card, { attempts = 5, delayMs = 900 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await readAccessState(card);
    } catch (error) {
      lastError = error;
      if (!isTransientC3Error(error) || attempt === attempts) throw error;
      console.log(`Lectura C3 transitoria (${error.message}); reintento ${attempt + 1}/${attempts}...`);
      await sleep(delayMs * attempt);
    }
  }
  throw lastError || new Error('No fue posible leer el C3-200');
}

async function writeAuthorizationDirect({ pin, authorized, doorMask, timezoneId }) {
  return withC3(async client => {
    if (authorized) {
      // Captura Wireshark del PullSDK: 0x07 con Pin + timezone + door mask.
      await client.putRecord('userauthorize', {
        Pin: String(pin),
        AuthorizeTimezoneId: Number(timezoneId),
        AuthorizeDoorId: Number(doorMask)
      });
      return;
    }

    // Captura Wireshark del PullSDK: 0x09 con solamente Pin elimina la autorización.
    await client.deleteRecord('userauthorize', {
      Pin: String(pin)
    });
  });
}

async function createUserDirect({ card, pin, startDate, endDate, doorMask, timezoneId }) {
  return withC3(async client => {
    await client.putRecord('user', {
      Pin: String(pin),
      CardNo: String(card),
      Password: '',
      Group: 1,
      ...(startDate ? { StartTime: Number(startDate) } : {}),
      ...(endDate ? { EndTime: Number(endDate) } : {})
    });

    await client.putRecord('userauthorize', {
      Pin: String(pin),
      AuthorizeTimezoneId: Number(timezoneId),
      AuthorizeDoorId: Number(doorMask)
    });
  });
}

async function deleteAuthorizationDirect({ pin }) {
  return withC3(client => client.deleteRecord('userauthorize', { Pin: String(pin) }));
}

async function deleteUserRowDirect({ pin }) {
  return withC3(client => client.deleteRecord('user', { Pin: String(pin) }));
}

async function verifyExpected(card, authorized) {
  const state = await readAccessStateWithRetry(card);
  if (!state.found) {
    return { ok: false, state, reason: 'El TAG ya no aparece en la tabla user' };
  }

  const ok = authorized ? state.authorized : !state.authorized;
  return {
    ok,
    state,
    reason: ok
      ? null
      : authorized
        ? 'El TAG sigue sin autorización de puertas'
        : 'El TAG todavía conserva autorización de puertas'
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const card = String(args.card || '').trim();
  const action = String(args.action || 'status').trim().toLowerCase();
  const confirm = String(args.confirm || '').trim();
  const doorMask = Number(args['door-mask'] || 3);
  const timezoneId = Number(args['timezone-id'] || 1);
  const config = getDirectConfig();

  console.log('============================================================');
  console.log('PRUEBA EXPERIMENTAL · ESCRITURA DIRECTA C3-200');
  console.log('============================================================');
  console.log('Host:', config.host || '(sin configurar)');
  console.log('Puerto:', config.port);
  console.log('Acción:', action);
  console.log('TAG:', card || '(no indicado)');
  console.log('IMPORTANTE: este script NO modifica MySQL ni usa el PullSDK bridge.');
  console.log('');

  if (!card) {
    throw new Error('Falta --card NUMERO_TAG');
  }

  const before = await readAccessStateWithRetry(card);

  console.log('Estado actual:');
  console.log(JSON.stringify(before.found ? {
    card: before.card,
    pin: before.pin,
    authorized: before.authorized,
    doorMask: before.doorMask,
    timezoneId: before.timezoneId
  } : {
    card: String(card),
    found: false
  }, null, 2));

  if (!before.found && !['create', 'delete'].includes(action)) {
    throw new Error('El TAG no existe en la tabla user del C3-200');
  }

  if (action === 'status') {
    console.log('\nSolo lectura. No se realizó ninguna escritura.');
    return;
  }

  if (!['block', 'activate', 'create', 'delete'].includes(action)) {
    throw new Error('Acción inválida. Usa --action status, block, activate, create o delete');
  }

  if (confirm !== 'WRITE-DIRECT-C3') {
    throw new Error(
      'Protección activa. Para permitir escritura agrega exactamente: --confirm WRITE-DIRECT-C3'
    );
  }

  if (action === 'create') {
    if (before.found) {
      throw new Error('Ese TAG ya existe en el C3. Usa un TAG de prueba que todavía no exista.');
    }

    const pin = String(args.pin || normalizeCard(card)).trim();
    if (!pin || pin === '0') throw new Error('No fue posible determinar un PIN válido');

    const startDate = date8(args.start || '2020-01-01');
    const endDate = date8(args.end || '2099-12-31');
    if (!Number.isInteger(doorMask) || doorMask <= 0) throw new Error('--door-mask debe ser > 0');
    if (!Number.isInteger(timezoneId) || timezoneId <= 0) throw new Error('--timezone-id debe ser > 0');

    console.log('\nIntentando CREAR directamente en user + userauthorize con PUTDATA 0x07...');
    let writeError = null;
    try {
      await createUserDirect({ card: normalizeCard(card), pin, startDate, endDate, doorMask, timezoneId });
      console.log('El C3 respondió a ambas escrituras sin error.');
    } catch (error) {
      writeError = error;
      console.log('La creación devolvió error:', error.message);
      console.log('No repetiré a ciegas. Primero verificaré el estado real del C3...');
    }

    await sleep(1200);
    const created = await readAccessStateWithRetry(card);
    if (created.found && created.authorized) {
      console.log('\n✅ TAG CREADO Y AUTORIZADO DIRECTAMENTE EN EL C3-200');
      console.log(JSON.stringify({
        card: created.card,
        pin: created.pin,
        authorized: created.authorized,
        doorMask: created.doorMask,
        timezoneId: created.timezoneId,
        writeReturnedError: Boolean(writeError),
        writeError: writeError?.message || null
      }, null, 2));
      return;
    }
    throw new Error(writeError?.message || 'El C3 no confirmó la creación/autorización del TAG');
  }

  if (action === 'delete') {
    if (!before.found) {
      console.log('\nEl TAG ya no existe en el C3. No se envió ninguna escritura.');
      return;
    }

    console.log('\nEtapa 1/2: eliminando userauthorize con DELETEDATA 0x09...');
    let authWriteError = null;
    try {
      await deleteAuthorizationDirect({ pin: before.pin });
      console.log('El C3 respondió a delete userauthorize sin error.');
    } catch (error) {
      authWriteError = error;
      console.log('delete userauthorize devolvió error:', error.message);
      console.log('Verificando antes de decidir si es necesario reintentar...');
    }

    await sleep(900);
    let afterAuth = await readAccessStateWithRetry(card);
    if (afterAuth.found && afterAuth.authorized) {
      if (authWriteError && isTransientC3Error(authWriteError)) {
        console.log('La autorización sigue presente; reintentando una sola vez...');
        await deleteAuthorizationDirect({ pin: before.pin });
        await sleep(900);
        afterAuth = await readAccessStateWithRetry(card);
      }
      if (afterAuth.found && afterAuth.authorized) {
        throw new Error('El C3 todavía conserva userauthorize; no borraré la fila user');
      }
    }
    console.log('Autorización eliminada/verificada.');

    console.log('\nEtapa 2/2: eliminando la fila user con DELETEDATA 0x09...');
    let userWriteError = null;
    try {
      await deleteUserRowDirect({ pin: before.pin });
      console.log('El C3 respondió a delete user sin error.');
    } catch (error) {
      userWriteError = error;
      console.log('delete user devolvió error:', error.message);
      console.log('Verificando antes de decidir si es necesario reintentar...');
    }

    await sleep(900);
    let afterDelete = await readAccessStateWithRetry(card);
    if (afterDelete.found && userWriteError && isTransientC3Error(userWriteError)) {
      console.log('La fila user sigue presente; reintentando una sola vez...');
      await deleteUserRowDirect({ pin: before.pin });
      await sleep(900);
      afterDelete = await readAccessStateWithRetry(card);
    }

    if (!afterDelete.found) {
      console.log('\n✅ TAG ELIMINADO DIRECTAMENTE DEL C3-200');
      return;
    }

    throw new Error('El C3 todavía devuelve el TAG después de eliminar la fila user');
  }

  const authorized = action === 'activate';
  if (authorized && (!Number.isInteger(doorMask) || doorMask <= 0)) {
    throw new Error('--door-mask debe ser un entero mayor que 0');
  }
  if (!Number.isInteger(timezoneId) || timezoneId <= 0) {
    throw new Error('--timezone-id debe ser un entero mayor que 0');
  }

  if (before.authorized === authorized) {
    console.log('\nEl C3 ya está en el estado solicitado. No se envió ninguna escritura.');
    return;
  }

  console.log(
    authorized
      ? '\nIntentando ACTIVAR directamente con PUTDATA 0x07 en userauthorize...'
      : '\nIntentando BLOQUEAR directamente con DELETEDATA 0x09 en userauthorize...'
  );

  let writeError = null;
  try {
    await writeAuthorizationDirect({
      pin: before.pin,
      authorized,
      doorMask,
      timezoneId
    });
    console.log('El C3 respondió al SETDATA sin error.');
  } catch (error) {
    writeError = error;
    console.log('La escritura devolvió error:', error.message);
    console.log('No repetiré a ciegas. Primero verificaré el estado real del C3...');
  }

  await sleep(1200);

  let verification = null;
  let verificationError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      verification = await verifyExpected(card, authorized);
      if (verification.ok) break;
    } catch (error) {
      verificationError = error;
    }
    if (attempt < 4) await sleep(900);
  }

  if (verification?.ok) {
    console.log('\n✅ CAMBIO CONFIRMADO DIRECTAMENTE EN EL C3-200');
    console.log(JSON.stringify({
      card: verification.state.card,
      pin: verification.state.pin,
      authorized: verification.state.authorized,
      doorMask: verification.state.doorMask,
      timezoneId: verification.state.timezoneId,
      writeReturnedError: Boolean(writeError),
      writeError: writeError?.message || null
    }, null, 2));
    return;
  }

  console.log('\n❌ EL CAMBIO NO QUEDÓ CONFIRMADO');
  if (verification?.state) {
    console.log(JSON.stringify({
      card: verification.state.card,
      pin: verification.state.pin,
      authorized: verification.state.authorized,
      doorMask: verification.state.doorMask,
      timezoneId: verification.state.timezoneId
    }, null, 2));
  }

  const details = [
    writeError?.message,
    verification?.reason,
    verificationError?.message
  ].filter(Boolean).join(' | ');

  throw new Error(details || 'El C3 no confirmó la escritura directa');
}

main().catch(error => {
  console.error('\nERROR:', error.message);
  process.exitCode = 1;
});
