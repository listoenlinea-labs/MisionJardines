/* Cliente de voz del conmutador. El interruptor vive exclusivamente en el backend. */
(() => {
  'use strict';
  class TelefoniaEngine {
    constructor({ api, token, status }) {
      this.api = api.replace(/\/$/, '');
      this.token = token;
      this.status = status;
      this.config = null;
      this.ua = null;
      this.session = null;
      this.busy = false;
      this.cancelled = false;
      this.attempt = 0;
      this.stream = null;
      this.audio = document.createElement('audio');
      this.audio.autoplay = true;
      document.body.appendChild(this.audio);
      this.controls = document.createElement('div');
      this.controls.hidden = true;
      this.controls.setAttribute('aria-label', 'Controles de llamada');
      this.controls.style.cssText = 'margin:12px 0;display:flex;gap:12px;flex-wrap:wrap';
      // hidden debe prevalecer sobre display:flex.
      this.controls.style.display = 'none';
      this.hangup = this.button('Colgar', () => this.end());
      this.mute = this.button('Silenciar micrófono', () => {
        if (!this.session) return;
        if (this.session.isMuted().audio) {
          this.session.unmute({ audio: true });
          this.mute.textContent = 'Silenciar micrófono';
        } else {
          this.session.mute({ audio: true });
          this.mute.textContent = 'Activar micrófono';
        }
      });
      this.play = this.button('Escuchar llamada', () => {
        this.audio.play().then(() => { this.play.hidden = true; })
          .catch(() => this.status('Permite la reproducción de audio en el navegador.', 'error'));
      });
      this.play.hidden = true;
      const statusElement = document.getElementById('callStatus') || document.getElementById('status');
      statusElement.insertAdjacentElement('afterend', this.controls);
      window.addEventListener('pagehide', () => { this.end(); if (this.ua) this.ua.stop(); });
    }

    button(label, callback) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = 'padding:10px 16px;border:1px solid #cbd5e1;border-radius:8px;cursor:pointer';
      button.addEventListener('click', callback);
      this.controls.appendChild(button);
      return button;
    }

    async init() {
      const response = await fetch(this.api + '/telefonia/configuracion', {
        headers: { Authorization: 'Bearer ' + this.token }, cache: 'no-store'
      });
      const config = await response.json();
      if (!response.ok || !config.ok || typeof config.habilitada !== 'boolean') {
        throw new Error(config.message || 'No se pudo consultar el modo de llamadas.');
      }
      this.config = config;
      const enabled = config.habilitada;
      document.querySelectorAll('[data-call-description]').forEach(element => {
        element.textContent = enabled
          ? 'Selecciona una calle y una casa para llamar al residente desde esta página.'
          : 'Selecciona una calle y una casa para llamar al residente por WhatsApp.';
      });
      document.querySelectorAll('[data-whatsapp-only]').forEach(element => { element.hidden = enabled; });
      this.status(enabled ? 'Telefonía seleccionada. Conecta tus audífonos para llamar.'
        : 'Conmutador listo. Al seleccionar una casa se abrirá WhatsApp Desktop.', 'ok');
      return config;
    }

    prepareWindow() {
      if (!this.config) throw new Error('Espera a que se cargue el modo de llamadas.');
      return this.config.habilitada ? null : window.open('', 'mj-whatsapp-caseta');
    }

    async call(number, preparedWindow, whatsapp) {
      try {
        if (!this.config) throw new Error('El modo de llamadas todavía no está disponible.');
        if (!this.config.habilitada) return whatsapp(number, preparedWindow);
        await this.dial(number);
      } catch (error) {
        this.status(error.message || 'No fue posible iniciar la llamada.', 'error');
      }
    }

    normalize(number) {
      let digits = String(number || '').replace(/\D/g, '');
      if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3);
      if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
      if (!/^[2-9]\d{9}$/.test(digits)) throw new Error('El teléfono debe ser un número nacional válido de 10 dígitos.');
      return digits;
    }

    async loadSip() {
      if (window.JsSIP) return;
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = this.api.replace(/\/api$/, '') + '/vendor/jssip-3.10.1.min.js';
        script.onload = () => window.JsSIP ? resolve() : reject(new Error('No se cargó el cliente de telefonía.'));
        script.onerror = () => { script.remove(); reject(new Error('No se pudo cargar el cliente de telefonía.')); };
        document.head.appendChild(script);
      });
    }

    async connect() {
      if (this.ua && this.ua.isRegistered()) return;
      await this.loadSip();
      const sip = this.config.sip;
      if (this.ua) this.ua.stop();
      const ua = new window.JsSIP.UA({
        sockets: [new window.JsSIP.WebSocketInterface(sip.websocket)],
        uri: 'sip:' + sip.user + '@' + sip.domain,
        password: sip.password, display_name: 'Caseta Misión Jardines',
        register: true, session_timers: false
      });
      this.ua = ua;
      ua.on('newRTCSession', event => {
        // Esta primera versión atiende llamadas salientes desde el padrón.
        if (event.originator === 'remote') event.session.terminate({ status_code: 486 });
      });
      ua.on('disconnected', () => {
        if (this.ua !== ua) return;
        if (this.session) this.end();
        this.status('Se perdió la conexión con telefonía. Intenta nuevamente.', 'error');
      });
      await new Promise((resolve, reject) => {
        const finish = error => {
          clearTimeout(timeout);
          ua.removeListener('registered', registered);
          ua.removeListener('registrationFailed', failed);
          if (error) { ua.stop(); reject(error); } else resolve();
        };
        const registered = () => finish();
        const failed = () => finish(new Error('La extensión no pudo registrarse. Revisa la configuración del servidor.'));
        const timeout = setTimeout(() => finish(new Error('El servidor de telefonía no respondió.')), 15000);
        ua.on('registered', registered);
        ua.on('registrationFailed', failed);
        ua.start();
      });
    }

    async dial(number) {
      const destination = this.normalize(number);
      if (this.busy) throw new Error('Ya hay una llamada en curso. Cuélgala antes de iniciar otra.');
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('La telefonía necesita HTTPS y un navegador con acceso al micrófono.');
      }
      this.busy = true;
      const attempt = ++this.attempt;
      const current = () => this.attempt === attempt;
      this.cancelled = false;
      this.controls.hidden = false;
      this.controls.style.display = 'flex';
      this.mute.disabled = true;
      this.status('Conectando con telefonía…');
      try {
        await this.connect();
        if (this.cancelled) return this.cleanup();
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (_) { throw new Error('No se pudo acceder al micrófono. Revisa sus permisos y conexión.'); }
        if (this.cancelled) return this.cleanup();
        const session = this.ua.call('sip:' + destination + '@' + this.config.sip.domain, {
          mediaStream: this.stream, mediaConstraints: { audio: true, video: false },
          pcConfig: { iceServers: this.config.sip.iceServers || [] },
          eventHandlers: {
            progress: () => { if (current()) this.status('Llamando al residente…'); },
            accepted: () => { if (current()) this.status('Llamada contestada.', 'ok'); },
            confirmed: () => { if (current()) { this.mute.disabled = false; this.status('Llamada en curso.', 'ok'); } },
            ended: () => { if (current()) { this.cleanup(); this.status('Llamada finalizada.'); } },
            failed: event => {
              if (!current()) return;
              this.cleanup();
              this.status(event.cause === 'Canceled' ? 'Llamada cancelada.'
                : 'La llamada no se completó: ' + (event.cause || 'revisa el gateway y la línea'), 'error');
            },
            peerconnection: event => this.attachAudio(event.peerconnection, attempt)
          }
        });
        this.session = session;
      } catch (error) {
        this.cleanup();
        throw error;
      }
    }

    attachAudio(connection, attempt) {
      connection.addEventListener('track', event => {
        if (this.attempt !== attempt || event.track.kind !== 'audio') return;
        this.audio.srcObject = event.streams[0] || new MediaStream([event.track]);
        this.audio.play().catch(() => { this.play.hidden = false; });
      });
    }

    end() {
      this.cancelled = true;
      if (this.session && !this.session.isEnded()) this.session.terminate();
      // Durante conexión/micrófono, dial() conserva el bloqueo hasta finalizar.
      if (this.session) this.cleanup();
      this.status('Llamada cancelada.');
    }

    cleanup() {
      this.attempt++;
      if (this.stream) this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
      this.session = null;
      this.busy = false;
      this.audio.pause();
      this.audio.srcObject = null;
      this.controls.hidden = true;
      this.controls.style.display = 'none';
      this.mute.textContent = 'Silenciar micrófono';
      this.play.hidden = true;
    }
  }
  window.TelefoniaEngine = TelefoniaEngine;
})();
