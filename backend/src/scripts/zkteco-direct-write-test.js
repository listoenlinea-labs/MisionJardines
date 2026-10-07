/* eslint-disable no-console */
require('dotenv').config();

const { withC3, getDirectConfig } = require('../services/zkteco-c3-client.service');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizeCard(value) {
  return String(value || '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
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

async function writeAuthorizationDirect({ pin, authorized, doorMask, timezoneId }) {
  return withC3(async client => {
    await client.setRecord('userauthorize', {
      Pin: String(pin),
      AuthorizeTimezoneId: Number(timezoneId),
      AuthorizeDoorId: authorized ? Number(doorMask) : 0
    });
  });
}

async function verifyExpected(card, authorized) {
  const state = await readAccessState(card);
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

  const before = await readAccessState(card);
  if (!before.found) {
    throw new Error('El TAG no existe en la tabla user del C3-200');
  }

  console.log('Estado actual:');
  console.log(JSON.stringify({
    card: before.card,
    pin: before.pin,
    authorized: before.authorized,
    doorMask: before.doorMask,
    timezoneId: before.timezoneId
  }, null, 2));

  if (action === 'status') {
    console.log('\nSolo lectura. No se realizó ninguna escritura.');
    return;
  }

  if (!['block', 'activate'].includes(action)) {
    throw new Error('Acción inválida. Usa --action status, block o activate');
  }

  if (confirm !== 'WRITE-DIRECT-C3') {
    throw new Error(
      'Protección activa. Para permitir escritura agrega exactamente: --confirm WRITE-DIRECT-C3'
    );
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
      ? '\nIntentando ACTIVAR directamente mediante SETDATA userauthorize...'
      : '\nIntentando BLOQUEAR directamente dejando AuthorizeDoorId=0...'
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
