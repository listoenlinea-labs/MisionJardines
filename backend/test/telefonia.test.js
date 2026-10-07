const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { TELEFONIA_HABILITADA, obtenerConfiguracion } = require('../src/config/telefonia');
const sipEnv = {
  TELEFONIA_WSS_URL: 'wss://voz.example.com:8089/ws', TELEFONIA_SIP_DOMAIN: 'voz.example.com',
  TELEFONIA_SIP_USER: 'caseta-web', TELEFONIA_SIP_PASSWORD: 'test-only-password'
};

test('false hardcodeado ignora credenciales y entrega únicamente modo WhatsApp', () => {
  assert.equal(TELEFONIA_HABILITADA, false);
  assert.deepEqual(obtenerConfiguracion(sipEnv), { ok: true, habilitada: false, modo: 'WHATSAPP' });
});

test('telefonía activada exige WSS y credenciales válidas, incluyendo TURN si se configura', () => {
  assert.throws(() => obtenerConfiguracion({}, true));
  assert.throws(() => obtenerConfiguracion({ ...sipEnv, TELEFONIA_WSS_URL: 'ws://voz.example.com/ws' }, true));
  assert.throws(() => obtenerConfiguracion({ ...sipEnv, TELEFONIA_TURN_URL: 'turn:relay.example.com' }, true));
  const result = obtenerConfiguracion({ ...sipEnv, TELEFONIA_TURN_URL: 'turns:relay.example.com',
    TELEFONIA_TURN_USER: 'caseta', TELEFONIA_TURN_PASSWORD: 'test-relay' }, true);
  assert.equal(result.habilitada, true);
  assert.equal(result.sip.iceServers[0].credential, 'test-relay');
});

function browser(config, { microphoneError = false, autoplayError = false } = {}) {
  const status = [];
  const stats = { sockets: 0, microphones: 0, calls: [], stopped: 0, popups: 0 };
  const elements = [];
  const element = () => {
    const listeners = {};
    const el = {
      style: {}, hidden: false, textContent: '', disabled: false, srcObject: null,
      appendChild() {}, setAttribute() {}, insertAdjacentElement() {}, pause() {}, remove() {},
      addEventListener(name, callback) { listeners[name] = callback; },
      click() { return listeners.click?.(); },
      play() { return autoplayError ? Promise.reject(new Error('blocked')) : Promise.resolve(); }
    };
    elements.push(el);
    return el;
  };
  class UA extends EventEmitter {
    constructor(options) { super(); this.options = options; this.registered = false; }
    start() { this.registered = true; queueMicrotask(() => this.emit('registered')); }
    stop() { this.registered = false; }
    isRegistered() { return this.registered; }
    call(destination, options) {
      let ended = false, muted = false;
      const session = {
        isEnded: () => ended, isMuted: () => ({ audio: muted }),
        mute: () => { muted = true; }, unmute: () => { muted = false; },
        terminate: () => { ended = true; options.eventHandlers.ended(); }
      };
      stats.calls.push({ destination, options, session });
      return session;
    }
  }
  const stream = { getTracks: () => [{ stop: () => { stats.stopped++; } }] };
  const window = {
    isSecureContext: true, addEventListener() {}, open() { stats.popups++; return { close() {} }; },
    JsSIP: { UA, WebSocketInterface: class { constructor() { stats.sockets++; } } }
  };
  const context = vm.createContext({
    window, document: { body: element(), head: element(), createElement: element,
      getElementById: element, querySelectorAll: () => [] },
    navigator: { mediaDevices: { getUserMedia: async () => {
      stats.microphones++;
      if (microphoneError) throw new Error('denied');
      return stream;
    } } }, MediaStream: class {},
    fetch: async () => ({ ok: config.ok !== false, json: async () => config }),
    setTimeout, clearTimeout
  });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../docs/assets/js/telefonia-engine.js'), 'utf8'), context);
  const engine = new window.TelefoniaEngine({ api: '/api', token: 'test-session', status: (...args) => status.push(args) });
  return { engine, stats, status, elements, window };
}

test('WhatsApp no registra SIP ni accede al micrófono y conserva ventana preparada', async () => {
  const { engine, stats } = browser(obtenerConfiguracion());
  await engine.init();
  const popup = engine.prepareWindow();
  let actual;
  await engine.call('3312345678', popup, (phone, prepared) => { actual = { phone, prepared }; });
  assert.equal(actual.phone, '3312345678');
  assert.equal(actual.prepared, popup);
  assert.equal(stats.popups, 1);
  assert.equal(stats.sockets, 0);
  assert.equal(stats.microphones, 0);
});

test('true llama por SIP, maneja audio, ocupado, mute y colgar sin abrir WhatsApp', async () => {
  const { engine, stats } = browser(obtenerConfiguracion(sipEnv, true));
  await engine.init();
  assert.equal(engine.prepareWindow(), null);
  let whatsapp = 0;
  await engine.call('+52 33 1234 5678', null, () => whatsapp++);
  assert.equal(stats.calls[0].destination, 'sip:3312345678@voz.example.com');
  assert.equal(stats.microphones, 1);
  assert.equal(whatsapp, 0);
  assert.equal(stats.popups, 0);
  const events = stats.calls[0].options.eventHandlers;
  events.confirmed();
  assert.equal(engine.mute.disabled, false);
  engine.mute.click();
  assert.equal(engine.session.isMuted().audio, true);
  engine.mute.click();
  assert.equal(engine.session.isMuted().audio, false);
  await assert.rejects(engine.dial('3312345678'), /llamada en curso/);
  let track;
  events.peerconnection({ peerconnection: { addEventListener: (_, callback) => { track = callback; } } });
  const incoming = {};
  track({ track: { kind: 'audio' }, streams: [incoming] });
  assert.equal(engine.audio.srcObject, incoming);
  engine.end();
  assert.equal(engine.busy, false);
  assert.equal(stats.stopped, 1);
  assert.equal(engine.audio.srcObject, null);
  assert.equal(engine.controls.hidden, true);
  await engine.dial('3312345678');
  // Un evento tardío de la llamada anterior no cuelga la nueva.
  events.failed({ cause: 'Connection Error' });
  assert.equal(engine.busy, true);
  engine.end();
});

test('rechazo de micrófono libera la llamada y no hace fallback a WhatsApp', async () => {
  const { engine, stats, status } = browser(obtenerConfiguracion(sipEnv, true), { microphoneError: true });
  await engine.init();
  let whatsapp = 0;
  await engine.call('3312345678', null, () => whatsapp++);
  assert.equal(stats.calls.length, 0);
  assert.equal(engine.busy, false);
  assert.equal(whatsapp, 0);
  assert.match(status.at(-1)[0], /micrófono/);
});

test('fallo de configuración no habilita WhatsApp por accidente', async () => {
  const { engine } = browser({ ok: false, message: 'Configuración incompleta' });
  await assert.rejects(engine.init(), /Configuración incompleta/);
  assert.throws(() => engine.prepareWindow(), /Espera/);
});

test('formatos nacionales se normalizan; se rechazan internacionales y prefijos especiales', async () => {
  const { engine, stats } = browser(obtenerConfiguracion(sipEnv, true));
  assert.equal(engine.normalize('+5213312345678'), '3312345678');
  for (const number of ['911', '+14155551234', '0013312345678', '0133123456']) {
    assert.throws(() => engine.normalize(number));
  }
  assert.equal(stats.microphones, 0);
});

test('ambas publicaciones comparten motor y no incluyen JavaScript inline', () => {
  const root = path.resolve(__dirname, '../..');
  assert.equal(fs.readFileSync(path.join(root, 'docs/assets/js/telefonia-engine.js'), 'utf8'),
    fs.readFileSync(path.join(root, 'backend/public/assets/js/telefonia-engine.js'), 'utf8'));
  for (const file of ['docs/conmutador.html', 'backend/public/conmutador.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(html, /<script\s*>/);
    assert.match(html, /assets\/js\/telefonia-engine.js/);
  }
});
