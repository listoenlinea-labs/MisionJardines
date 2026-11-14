/* Onboarding contextual del portal. Controlado desde el shell para cruzar iframes
 * de forma segura: no realiza clics, solicitudes ni mutaciones de negocio. */
(() => {
  'use strict';
  const SUPPORTED = new Set(['SUPER_ADMIN', 'ADMINISTRADOR', 'CONDOMINO', 'SEGURIDAD']);
  const PREFIX = 'mjPortalRecorridoV1:';
  const NEXT_EVENT = 'mj-shell-page-ready';
  let role = '';
  let storageKey = '';
  let steps = [];
  let index = 0;
  let open = false;
  let busy = false;
  let welcomeOpen = false;
  let originalPage = '';
  let overlay = null;
  let lastTarget = null;

  const byId = id => document.getElementById(id);
  const limit = (value, min, max) => Math.max(min, Math.min(max, value));

  function account() {
    for (const area of [localStorage, sessionStorage]) {
      try {
        const raw = area.getItem('misionJardinesUsuario');
        if (raw) return JSON.parse(raw);
      } catch (_) { /* El almacenamiento puede estar bloqueado. */ }
    }
    return {};
  }

  function keyFor(user) {
    // El registro es exclusivamente local al navegador; nunca incluye token.
    const rawId = user.id ?? user.usuarioId ?? user.idUsuario ?? '';
    const identity = String(rawId).replace(/[^0-9A-Za-z_-]/g, '').slice(0, 64);
    return PREFIX + role + ':' + (identity || 'rol');
  }

  function readSaved() {
    try { return localStorage.getItem(storageKey); }
    catch (_) { return null; }
  }

  function save(value) {
    try { localStorage.setItem(storageKey, value); }
    catch (_) { /* Navegación privada: se mostrará otra vez en próxima sesión. */ }
  }

  function currentFrame() {
    return document.querySelector('.mj-app-frame.is-active');
  }

  function visibleElement(element) {
    if (!element?.isConnected || element.closest('[hidden], [inert]')) return false;
    const view = element.ownerDocument.defaultView;
    if (!view || element.getClientRects().length === 0) return false;
    let node = element;
    while (node && node.nodeType === 1) {
      const style = view.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      node = node.parentElement;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  function targetFor(step) {
    const mobile = matchMedia('(max-width: 820px)').matches;
    if (!step.page) {
      // En celular el menú está cerrado: resaltar su pestaña amarilla, NO
      // un menú invisible que se encuentra fuera de la pantalla.
      let el = mobile && step.selector.includes('.mj-side-nav')
        ? document.querySelector('.mj-side-tab')
        : document.querySelector(step.selector);
      if (!visibleElement(el)) el = document.querySelector('.mj-side-tab');
      if (!visibleElement(el)) return null;
      const rect = el.getBoundingClientRect();
      if (rect.right <= 0 || rect.left >= innerWidth) return null;
      return {el, frame:null};
    }
    const frame = currentFrame();
    if (!frame?.contentDocument) return null;
    let el;
    try { el = frame.contentDocument.querySelector(step.selector); }
    catch (_) { return null; }
    // La pestaña puede existir pero estar oculta/inactiva: nunca iluminar
    // un h1 o main aleatorio que no corresponde al paso explicado.
    if (!visibleElement(el)) return null;
    const bounds = el.getBoundingClientRect();
    const maxHeight = Math.min(460, frame.clientHeight * .82);
    if (el.matches('main, body, .dashboard') || bounds.height > maxHeight) {
      const precise = el.querySelector(
        ':scope > .section-header, :scope > .heading, :scope > .hl-welcome, ' +
        '.finance-expense-panel-heading, .section-header, .hl-card-head, h1, h2'
      );
      if (visibleElement(precise)) el = precise;
      // Si solo existe un contenedor gigante sin título, es mejor mostrar
      // la explicación sin foco que iluminar una sección incorrecta.
      else if (bounds.height > maxHeight) return null;
    }
    return {el, frame};
  }

  function screenRect(target) {
    if (!target) return null;
    const bounds = target.el.getBoundingClientRect();
    const frame = target.frame?.getBoundingClientRect();
    const frameLeft = frame?.left || 0;
    const frameTop = frame?.top || 0;
    const panel = overlay?.querySelector('.mj-tour-panel');
    const mobile = innerWidth <= 660;
    const panelTop = mobile && panel ? panel.getBoundingClientRect().top : innerHeight;
    // Recortar a la parte visible del iframe Y al espacio libre sobre la
    // tarjeta de la guía. Nunca dibujar un foco debajo del texto de ayuda.
    const clipLeft = Math.max(8, frame?.left ?? 8);
    const clipRight = Math.min(innerWidth - 8, frame?.right ?? innerWidth - 8);
    const clipTop = Math.max(8, frame?.top ?? 8);
    const clipBottom = Math.min(
      innerHeight - 8, frame?.bottom ?? innerHeight - 8,
      mobile ? panelTop - 14 : innerHeight - 8
    );
    const left = Math.max(clipLeft, bounds.left + frameLeft - 5);
    const top = Math.max(clipTop, bounds.top + frameTop - 5);
    const right = Math.min(clipRight, bounds.right + frameLeft + 5);
    const bottom = Math.min(clipBottom, bounds.bottom + frameTop + 5);
    if (right - left < 18 || bottom - top < 18) return null;
    return {left, top, width:right - left, height:bottom - top};
  }

  function scrollTargetIntoView(target) {
    if (!target?.frame || !visibleElement(target.el)) return;
    const el = target.el;
    try { el.scrollIntoView({block:'center', inline:'nearest', behavior:'instant'}); }
    catch (_) { el.scrollIntoView(); }
    if (innerWidth > 660) return;
    // El scrollIntoView normal centra el elemento detrás de la tarjeta inferior.
    // Subirlo al área utilizable mediante el contenedor con scroll más cercano.
    const panelTop = overlay?.querySelector('.mj-tour-panel')?.getBoundingClientRect().top;
    if (!Number.isFinite(panelTop)) return;
    const frameTop = target.frame.getBoundingClientRect().top;
    const usefulBottom = panelTop - frameTop - 20;
    if (usefulBottom < 105) return;
    const bounds = el.getBoundingClientRect();
    const desiredCenter = 18 + (usefulBottom - 18) * .43;
    const visibleTargetHeight = Math.min(bounds.height, 150);
    const delta = bounds.top + visibleTargetHeight / 2 - desiredCenter;
    if (Math.abs(delta) < 12) return;
    const doc = el.ownerDocument;
    let scrollable = el.parentElement;
    while (scrollable && scrollable !== doc.body && scrollable !== doc.documentElement) {
      const computed = doc.defaultView.getComputedStyle(scrollable);
      if (/auto|scroll|overlay/.test(computed.overflowY) &&
          scrollable.scrollHeight > scrollable.clientHeight + 1) break;
      scrollable = scrollable.parentElement;
    }
    const root = doc.scrollingElement || doc.documentElement;
    const chosen = scrollable && scrollable !== doc.body && scrollable !== doc.documentElement
      ? scrollable : root;
    chosen.scrollTop += delta;
  }

  function createOverlay() {
    if (overlay) return overlay;
    const root = document.createElement('div');
    root.id = 'mjPortalTourOverlay';
    root.className = 'mj-tour-root';
    root.hidden = true;
    root.innerHTML = `
      <div class="mj-tour-focus" aria-hidden="true"></div>
      <section class="mj-tour-panel" role="dialog" aria-modal="true" aria-labelledby="mjTourTitle">
        <div class="mj-tour-panel-top"><span class="mj-tour-group" id="mjTourGroup"></span>
          <button class="mj-tour-close" id="mjTourExit" type="button" aria-label="Cerrar recorrido">×</button></div>
        <div class="mj-tour-track" aria-hidden="true"><span id="mjTourTrack"></span></div>
        <h2 id="mjTourTitle"></h2>
        <p class="mj-tour-copy" id="mjTourDescription"></p>
        <div class="mj-tour-foot">
          <div class="mj-tour-foot-left"><span id="mjTourCounter" class="mj-tour-counter" aria-live="polite"></span>
            <button type="button" class="mj-tour-skip" id="mjTourSkip">Omitir guía</button></div>
          <div class="mj-tour-buttons">
            <button type="button" class="mj-tour-prev" id="mjTourPrevious">Atrás</button>
            <button type="button" class="mj-tour-next" id="mjTourNext">Siguiente</button>
          </div>
        </div>
        <p class="mj-tour-safety">El recorrido es solo demostrativo; no ejecuta operaciones.</p>
      </section>`;
    document.body.appendChild(root);
    overlay = root;
    byId('mjTourExit').addEventListener('click', () => finish('dismissed'));
    byId('mjTourSkip').addEventListener('click', () => finish('skipped'));
    byId('mjTourPrevious').addEventListener('click', () => void go(index - 1));
    byId('mjTourNext').addEventListener('click', () => {
      if (index === steps.length - 1) finish('completed');
      else void go(index + 1);
    });
    window.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !open) return;
      event.preventDefault();
      finish('dismissed');
    });
    const alignViewport = () => {
      if (!open || busy) return;
      requestAnimationFrame(() => {
        if (!open || busy) return;
        reposition();
        scrollTargetIntoView(targetFor(steps[index]));
        requestAnimationFrame(reposition);
      });
    };
    window.addEventListener('resize', alignViewport, {passive:true});
    window.addEventListener('scroll', reposition, {passive:true});
    window.visualViewport?.addEventListener('resize', alignViewport, {passive:true});
    // Seguir el desplazamiento dentro de los marcos, no solo del shell.
    document.querySelectorAll('.mj-app-frame').forEach(frame => {
      const attachScroll = () => {
        try { frame.contentWindow?.addEventListener('scroll', reposition, {passive:true}); }
        catch (_) { /* Página inaccesible: no romper el recorrido. */ }
      };
      frame.addEventListener('load', attachScroll);
      attachScroll(); // El iframe actual ya estaba cargado al abrir la guía.
    });
    return root;
  }

  function reposition() {
    if (!open || !overlay || overlay.hidden || busy) return;
    const step = steps[index];
    if (!step) return;
    const panel = overlay.querySelector('.mj-tour-panel');
    const focus = overlay.querySelector('.mj-tour-focus');
    const mobile = innerWidth <= 660;
    const target = targetFor(step);
    lastTarget = target;
    // Colocar PRIMERO la tarjeta inferior. screenRect necesita su posición
    // actual para no dibujar un foco debajo de ella.
    if (mobile) {
      panel.style.left = '12px';
      panel.style.top = 'auto';
      panel.style.bottom = 'max(12px, env(safe-area-inset-bottom))';
      panel.style.transform = 'none';
    } else {
      panel.style.bottom = 'auto';
    }
    const rect = screenRect(target);
    if (!rect) {
      overlay.classList.add('mj-tour-no-focus');
      focus.style.display = 'none';
      if (!mobile) {
        panel.style.left = '50%';
        panel.style.top = '50%';
        panel.style.transform = 'translate(-50%, -50%)';
      }
      return;
    }
    overlay.classList.remove('mj-tour-no-focus');
    focus.style.display = 'block';
    focus.style.left = rect.left + 'px';
    focus.style.top = rect.top + 'px';
    focus.style.width = rect.width + 'px';
    focus.style.height = rect.height + 'px';
    if (mobile) return;
    panel.style.transform = 'none';
    const panelWidth = Math.min(400, innerWidth - 22);
    const panelHeight = panel.offsetHeight || 260;
    let top = rect.top + rect.height + 15;
    if (top + panelHeight > innerHeight - 10) top = rect.top - panelHeight - 15;
    if (top < 10) top = limit(innerHeight - panelHeight - 12, 10, innerHeight);
    const left = limit(rect.left + rect.width / 2 - panelWidth / 2, 11, innerWidth - panelWidth - 11);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  async function routeTo(page) {
    if (!page || window.MJShell?.currentPage === page) return true;
    if (!window.MJPermissions?.canAccess(role, page)) return false;
    return new Promise(resolve => {
      let finished = false;
      const done = value => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        document.removeEventListener(NEXT_EVENT, onReady);
        resolve(value);
      };
      const onReady = event => {
        if (event.detail?.page === page) done(true);
      };
      document.addEventListener(NEXT_EVENT, onReady);
      const timeout = setTimeout(() => done(false), 16000);
      if (!window.MJShell.navigate(page)) done(false);
    });
  }

  async function go(to) {
    if (!open || busy || to < 0 || to >= steps.length) return;
    const targetStep = steps[to];
    busy = true;
    byId('mjTourPrevious').disabled = true;
    byId('mjTourNext').disabled = true;
    byId('mjTourTitle').textContent = 'Abriendo ' + targetStep.group + '…';
    try {
      const ok = await routeTo(targetStep.page);
      // Si el usuario cerró el recorrido durante una navegación, no intentar
      // reabrirlo ni desplazar la página en una promesa ya obsoleta.
      if (!open) return;
      if (!ok) {
        byId('mjTourTitle').textContent = 'No se pudo abrir esta sección';
        byId('mjTourDescription').textContent = 'Revisa tu conexión o abre otro módulo desde el menú. Puedes salir y reiniciar la guía más tarde.';
        return;
      }
      index = to;
      const step = steps[index];
      byId('mjTourGroup').textContent = step.group;
      byId('mjTourTitle').textContent = step.title;
      byId('mjTourDescription').textContent = step.description;
      byId('mjTourCounter').textContent = 'Paso ' + (index+1) + ' de ' + steps.length;
      byId('mjTourTrack').style.width = ((index+1)/steps.length*100) + '%';
      byId('mjTourNext').textContent = index === steps.length - 1 ? 'Finalizar' : 'Siguiente';
      byId('mjTourPrevious').hidden = index === 0;
    } finally {
      busy = false;
      byId('mjTourPrevious').disabled = false;
      byId('mjTourNext').disabled = false;
      requestAnimationFrame(() => {
        if (!open) return;
        // Actualizar panel antes de desplazar el documento dentro del iframe.
        reposition();
        scrollTargetIntoView(targetFor(steps[index]));
        requestAnimationFrame(reposition);
      });
      // Algunos módulos muestran las tarjetas después de recibir datos.
      // Reintentar el foco de ese paso sin seleccionar otra sección por error.
      if (open) setTimeout(() => {
        if (!open || busy || index !== to) return;
        const target = targetFor(steps[index]);
        if (target) scrollTargetIntoView(target);
        reposition();
      }, 650);
    }
  }

  function finish(status) {
    if (!open) return;
    open = false;
    busy = false;
    save(status);
    window.MJPortalTourActive = false;
    if (overlay) overlay.hidden = true;
    // Reponer el módulo en el que se solicitó la guía, sin modificar datos.
    if (originalPage && window.MJShell?.currentPage !== originalPage &&
      window.MJPermissions?.canAccess(role, originalPage)) {
      window.MJShell.navigate(originalPage);
    }
  }

  function start() {
    if (!window.MJPortalTourContent || !SUPPORTED.has(role) || open) return;
    closeWelcome();
    steps = window.MJPortalTourContent.getSteps(role).filter(step =>
      !step.page || window.MJPermissions.canAccess(role, step.page));
    if (!steps.length) return;
    originalPage = window.MJShell?.currentPage || window.MJPermissions.landing(role);
    window.MJPortalTourActive = true;
    // No abrir el menú para enseñar navegación en móvil. Forzar cierre
    // visual antes del spotlight sin guardar una preferencia distinta.
    document.dispatchEvent(new CustomEvent('mj:portal-tour-start'));
    createOverlay();
    overlay.hidden = false;
    open = true;
    save('started'); // Dispositivo recordado incluso si se cierra a mitad de camino.
    index = 0;
    void go(0);
    byId('mjTourExit').focus({preventScroll:true});
  }

  function closeWelcome() {
    const dialog = byId('mjPortalTourWelcome');
    if (!dialog) return;
    if (dialog.open) dialog.close();
    dialog.remove();
    welcomeOpen = false;
  }

  function invite() {
    if (welcomeOpen || open || readSaved() || !SUPPORTED.has(role)) return;
    if (document.querySelector('.mj-child-modal-open, #mjPortalTourWelcome')) return;
    document.dispatchEvent(new CustomEvent('mj:portal-tour-start'));
    const dialog = document.createElement('dialog');
    dialog.id = 'mjPortalTourWelcome';
    dialog.className = 'mj-tour-welcome';
    const title = role === 'SEGURIDAD' ? 'Tu guía de caseta' :
      role === 'CONDOMINO' ? 'Conoce tu portal de residente' : 'Conoce la administración de Misión Jardines';
    dialog.innerHTML = `<span class="mj-tour-tag">PRIMER ACCESO EN ESTE DISPOSITIVO</span>
      <h2 id="mjWelcomeTitle"></h2>
      <p>¿Quieres conocer paso a paso las pantallas disponibles para tu perfil?
      El recorrido es interactivo y muestra dónde está cada función, sin crear registros ni pagos reales.</p>
      <p class="mj-tour-once">Solo preguntaremos una vez en este navegador y para este perfil. Cuando quieras, podrás reiniciar la guía desde el menú.</p>
      <div class="mj-tour-welcome-actions"><button type="button" id="mjWelcomeNotNow">Omitir guía</button>
        <button type="button" id="mjWelcomeStart">Comenzar recorrido</button></div>`;
    dialog.querySelector('h2').textContent = title;
    document.body.append(dialog);
    welcomeOpen = true;
    // Recordar el consentimiento o el rechazo, no una invitación sin respuesta.
    dialog.querySelector('#mjWelcomeNotNow').addEventListener('click', () => {
      save('skipped');
      closeWelcome();
    });
    dialog.querySelector('#mjWelcomeStart').addEventListener('click', start);
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      save('dismissed');
      closeWelcome();
    });
    dialog.showModal();
  }

  function addLauncher() {
    if (byId('mjPortalTourLauncher')) return true;
    const inner = document.querySelector('.mj-shared-sidebar .mj-side-inner');
    if (!inner) return false;
    const btn = document.createElement('button');
    btn.id = 'mjPortalTourLauncher';
    btn.type = 'button';
    btn.className = 'mj-tour-restart';
    btn.innerHTML = '<span aria-hidden="true">✦</span> Recorrido guiado';
    btn.setAttribute('aria-label','Volver a iniciar el recorrido de ayuda del portal');
    btn.addEventListener('click', start);
    const before = inner.querySelector('.mj-side-support') || inner.querySelector('.mj-side-logout');
    if (before) inner.insertBefore(btn, before);
    else inner.append(btn);
    return true;
  }

  async function boot() {
    const verified = await window.MJAccessReady;
    if (!verified) return;
    role = window.MJVerifiedRole || '';
    if (!SUPPORTED.has(role)) return;
    storageKey = keyFor(account());
    if (!addLauncher()) {
      const observer = new MutationObserver(() => {
        if (addLauncher()) observer.disconnect();
      });
      observer.observe(document.body, {childList:true,subtree:true});
    }
    const ready = () => window.MJShell?.currentPage &&
      document.querySelector('.mj-app-frame.is-active');
    if (ready()) {
      setTimeout(invite, 1100);
    } else {
      document.addEventListener(NEXT_EVENT, () => setTimeout(invite, 1100), {once:true});
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void boot(); }, {once:true});
  } else void boot();
})();
