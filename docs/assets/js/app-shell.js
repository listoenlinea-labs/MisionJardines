(() => {
  'use strict';

  // El documento principal conserva la navegación y la sesión. Cada sección
  // funciona en un documento aislado para evitar listeners y temporizadores
  // duplicados al pasar entre módulos heredados.
  const home = 'index.html';
  const frames = [document.getElementById('mjPageA'), document.getElementById('mjPageB')];
  const loading = document.getElementById('mjAppLoading');
  const errorBox = document.getElementById('mjAppError');
  const token = window.MJ_TOKEN;
  const base = new URL('.', location.href);
  let userRole = '';
  let activeIndex = -1;
  let requested = '';
  let currentPage = home;
  let sequence = 0;

  // Los modales de cada sección viven dentro del iframe, pero los botones
  // flotantes de búsqueda, cuenta y menú se dibujan en el documento padre.
  // Un z-index del iframe no puede cubrir esos controles exteriores.
  let childModalObserver = null;
  const childModalSelector = '.finance-pay-overlay, .modal-overlay, .modal-backdrop, .modal-shell, .edit-modal, dialog, [role="dialog"][aria-modal="true"]';

  function resetChildModalChrome() {
    childModalObserver?.disconnect();
    childModalObserver = null;
    document.body.classList.remove('mj-child-modal-open');
  }

  function syncChildModalChrome(frame) {
    if (activeIndex < 0 || frames[activeIndex] !== frame) return;
    const doc = frame.contentDocument;
    if (!doc?.body) return;
    const hasOpenModal = [...doc.querySelectorAll(childModalSelector)].some(modal => {
      // Hay diálogos renderizados permanentemente dentro de overlays ocultos:
      // no cuentan hasta que todo su árbol esté visible.
      if (modal.tagName === 'DIALOG' && !modal.open) return false;
      if (modal.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const computed = doc.defaultView.getComputedStyle(modal);
      return computed.display !== 'none' && computed.visibility !== 'hidden' && modal.getClientRects().length > 0;
    });
    document.body.classList.toggle('mj-child-modal-open', hasOpenModal);
  }

  function watchChildModals(frame) {
    resetChildModalChrome();
    const body = frame.contentDocument?.body;
    if (!body) return;
    childModalObserver = new MutationObserver(() => syncChildModalChrome(frame));
    childModalObserver.observe(body, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['hidden', 'open', 'class', 'style', 'aria-hidden', 'inert']
    });
    syncChildModalChrome(frame);
  }

  function safeRoute(input) {
    if (typeof input !== 'string' || input.length > 512) return null;
    let url;
    try { url = new URL(input, base); } catch (_) { return null; }
    if (url.origin !== location.origin || url.pathname.slice(0, -url.pathname.split('/').pop().length) !== base.pathname) return null;
    const page = url.pathname.split('/').pop();
    if (!/^[a-z0-9_-]+\.html$/.test(page) || !window.MJPermissions.pages.includes(page)) return null;
    if (url.searchParams.has('_mjFrame')) url.searchParams.delete('_mjFrame');
    return { page, target: page + url.search + url.hash };
  }

  function allowed(input) {
    const route = safeRoute(input);
    return route && userRole && window.MJPermissions.canAccess(userRole, route.page) ? route : null;
  }

  function frameUrl(route) {
    const url = new URL(route.target, base);
    url.searchParams.set('_mjFrame', '1');
    return url.href;
  }

  function updateSidebar() {
    document.querySelectorAll('.mj-side-link').forEach(link => {
      const isCurrent = safeRoute(link.getAttribute('href'))?.page === currentPage;
      link.classList.toggle('active', isCurrent);
      if (isCurrent) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const account = document.querySelector('.mj-side-account');
    account?.classList.toggle('active', currentPage === 'cuenta.html');
  }

  function error(message) {
    loading.hidden = true;
    errorBox.hidden = false;
    if (message) errorBox.querySelector('p').textContent = message;
    document.getElementById('mjAppFallback').href = requested || home;
  }

  function finishFrame(frame, route, next, ordinal) {
    if (ordinal !== sequence) return;
    let href;
    try { href = frame.contentWindow.location.href; }
    catch (_) { error('La sección intentó abrir contenido de otro sitio.'); return; }
    if (new URL(href).pathname.endsWith('/login.html')) {
      location.replace('login.html');
      return;
    }
    if (safeRoute(href)?.page !== route.page) {
      error('El servidor redirigió esta sección. Regresa al menú e intenta nuevamente.');
      return;
    }
    // También cubrir secciones que aún tengan el script lateral en caché:
    // su menú está en el documento principal, no dentro del iframe.
    frame.contentDocument?.body?.classList.add('mj-shared-sidebar-collapsed');
    const old = activeIndex >= 0 ? frames[activeIndex] : null;
    frame.classList.add('is-active');
    frame.setAttribute('aria-hidden', 'false');
    frame.removeAttribute('tabindex');
    if (old && old !== frame) {
      old.classList.remove('is-active');
      old.classList.add('is-leaving');
      old.setAttribute('aria-hidden', 'true');
      old.setAttribute('tabindex', '-1');
      setTimeout(() => {
        old.classList.remove('is-leaving');
        if (frames[activeIndex] !== old) old.src = 'about:blank';
      }, 250);
    }
    activeIndex = next;
    watchChildModals(frame);
    currentPage = route.page;
    requested = route.target;
    loading.hidden = true;
    errorBox.hidden = true;
    document.title = (frame.contentDocument?.title || route.page) + ' | Misión Jardines';
    updateSidebar();
  }

  function navigate(input, { replace = false, fromHistory = false, reload = false } = {}) {
    const route = allowed(input);
    if (!route) return false;
    if (!reload && route.target === requested) return true;
    resetChildModalChrome();
    const ordinal = ++sequence;
    const next = activeIndex < 0 ? 0 : 1 - activeIndex;
    const frame = frames[next];
    const address = new URL(location.href);
    address.searchParams.set('page', route.target);
    if (!fromHistory) history[replace ? 'replaceState' : 'pushState']({ page: route.target }, '', address);
    currentPage = route.page;
    requested = route.target;
    updateSidebar();
    loading.hidden = false;
    errorBox.hidden = true;
    const targetUrl = frameUrl(route);
    const onLoad = async () => {
      if (ordinal !== sequence) return;
      try {
        const ready = frame.contentWindow.MJAccessReady;
        if (ready) {
          let timeout;
          try {
            await Promise.race([ready, new Promise(resolve => {timeout = setTimeout(resolve, 12000);})]);
          } finally { clearTimeout(timeout); }
        }
        finishFrame(frame, route, next, ordinal);
      } catch (_) { error('No fue posible validar tu acceso a esta sección.'); }
    };
    frame.addEventListener('load', onLoad, { once: true });
    frame.src = targetUrl;
    return true;
  }

  window.MJShell = {
    get currentPage() { return currentPage; },
    navigate,
    reload() { return navigate(requested, { fromHistory: true, reload: true }); }
  };

  // Algunos formularios antiguos aún usan location.href internamente.
  // Si cambian el documento interior, sincronizar URL y menú sin recargar el
  // marco exterior ni permitir que una redirección de sesión quede anidada.
  frames.forEach(frame => frame.addEventListener('load', () => {
    if (frames[activeIndex] !== frame) return;
    let href;
    try { href = frame.contentWindow.location.href; } catch (_) { return; }
    const url = new URL(href);
    if (url.pathname.endsWith('/login.html')) { location.replace('login.html'); return; }
    const route = allowed(href);
    if (route && route.page !== currentPage) navigate(route.target, { replace: true });
    else watchChildModals(frame); // iframe recargado sin cambiar de módulo
  }));

  window.MJAccessReady = (async () => {
    if (!token) { location.replace('login.html'); return false; }
    try {
      const response = await fetch(`${window.MJ_API_URL}/auth/perfil`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
        signal: AbortSignal.timeout(20000)
      });
      if (response.status === 401 || response.status === 403) {
        ['misionJardinesToken', 'misionJardinesUsuario'].forEach(key => {
          localStorage.removeItem(key); sessionStorage.removeItem(key);
        });
        location.replace('login.html');
        return false;
      }
      if (!response.ok) throw Error('No fue posible validar la sesión.');
      const result = await response.json();
      userRole = result.usuario?.rol?.nombre || result.usuario?.rol || '';
      if (!result.ok || !window.MJPermissions.canAccess(userRole, 'cuenta.html')) throw Error('Sesión inválida.');
      for (const storage of [localStorage, sessionStorage]) {
        if (storage.getItem('misionJardinesToken') === token) {
          storage.setItem('misionJardinesUsuario', JSON.stringify(result.usuario));
        }
      }
      window.MJVerifiedRole = userRole;
      if (userRole === 'SEGURIDAD') sessionStorage.removeItem('mjCasaSeleccionada');
      return true;
    } catch (cause) {
      error(cause.message || 'No fue posible verificar tu sesión.');
      return false;
    }
  })();

  document.addEventListener('click', event => {
    const anchor = event.target.closest('a[href]');
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey ||
        event.shiftKey || event.altKey || anchor.hasAttribute('download') || anchor.target === '_blank') return;
    const route = safeRoute(anchor.getAttribute('href'));
    if (!route) return;
    event.preventDefault();
    navigate(route.target);
  }, true);

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.data?.type !== 'MJ_SHELL_NAVIGATE') return;
    if (activeIndex < 0 || event.source !== frames[activeIndex].contentWindow) return;
    navigate(event.data.target);
  });
  window.addEventListener('popstate', () => {
    const target = new URLSearchParams(location.search).get('page') || home;
    navigate(allowed(target)?.target || home, { fromHistory: true });
  });
  document.getElementById('mjAppRetry').addEventListener('click', () => {
    if (userRole) navigate(requested || home, { fromHistory: true, reload: true });
    else location.reload();
  });

  window.MJAccessReady.then(ok => {
    if (!ok) return;
    const raw = new URLSearchParams(location.search).get('page') || window.MJPermissions.landing(userRole);
    navigate(allowed(raw)?.target || window.MJPermissions.landing(userRole), { replace: true });
  });
})();
