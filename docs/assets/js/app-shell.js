(() => {
  'use strict';

  // El documento principal conserva la navegación y la sesión. Cada sección
  // funciona en un documento aislado para evitar listeners y temporizadores
  // duplicados al pasar entre módulos heredados.
  const home = 'index.html';
  const frames = [document.getElementById('mjPageA'), document.getElementById('mjPageB')];
  const loading = document.getElementById('mjAppLoading');
  const errorBox = document.getElementById('mjAppError');
  const refreshHint = document.getElementById('mjAppRefresh');
  const refreshDocuments = new WeakSet();
  const token = window.MJ_TOKEN;
  const base = new URL('.', location.href);
  let userRole = '';
  let activeIndex = -1;
  let requested = '';
  let currentPage = home;
  let sequence = 0;

  function hideRefreshHint() {
    if (refreshHint) refreshHint.hidden = true;
  }

  function installPullToRefresh(frame) {
    const doc = frame.contentDocument;
    if (!doc || refreshDocuments.has(doc)) return;
    refreshDocuments.add(doc);
    let gesture = null;
    const cancel = () => { gesture = null; hideRefreshHint(); };
    const atTop = () => (doc.scrollingElement?.scrollTop || 0) <= 1 && (doc.defaultView?.scrollY || 0) <= 1;
    function protectedTarget(target) {
      if (!target || target.closest('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),dialog,[role="dialog"],canvas,video,iframe,.leaflet-container,.gm-style,[data-no-pull-refresh]')) return true;
      const modalOpen = [...doc.querySelectorAll('dialog[open],[aria-modal="true"]')].some(modal => {
        const style = doc.defaultView.getComputedStyle(modal);
        return !modal.hidden && style.display !== 'none' && style.visibility !== 'hidden' && modal.getClientRects().length;
      });
      if (modalOpen || document.querySelector('.mj-mobile-scrim:not([hidden])')) return true;
      // Las tablas/listas con scroll propio conservan su gesto, incluso en su borde.
      for (let node = target; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
        const vertical = node.scrollHeight > node.clientHeight + 1, horizontal = node.scrollWidth > node.clientWidth + 1;
        if (!vertical && !horizontal) continue;
        const style = doc.defaultView.getComputedStyle(node);
        if (vertical && /auto|scroll|overlay/.test(style.overflowY) || horizontal && /auto|scroll|overlay/.test(style.overflowX)) return true;
      }
      return false;
    }
    doc.addEventListener('touchstart', event => {
      cancel();
      if (frames[activeIndex] !== frame || !loading.hidden || event.touches.length !== 1
          || !window.matchMedia('(max-width: 820px)').matches || !atTop() || protectedTarget(event.target)) return;
      const touch = event.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, distance: 0, sequence };
    }, { passive: true });
    doc.addEventListener('touchmove', event => {
      if (!gesture) return;
      if (event.touches.length !== 1 || gesture.sequence !== sequence || !atTop() || event.defaultPrevented) { cancel(); return; }
      const touch = event.touches[0], dy = touch.clientY - gesture.y, dx = Math.abs(touch.clientX - gesture.x);
      if (dy < 0 || dx > Math.max(4, dy)) { cancel(); return; }
      gesture.distance = dy;
      if (dy === 0) return;
      if (!event.cancelable) { cancel(); return; }
      // Tomar el gesto desde su primer movimiento descendente evita que el
      // navegador lo convierta en scroll no cancelable antes de llegar al umbral.
      event.preventDefault();
      if (dy < 12) { hideRefreshHint(); return; }
      if (refreshHint) {
        const text = dy >= 90 ? 'Suelta para actualizar' : 'Desliza hacia abajo para actualizar';
        if (refreshHint.textContent !== text) refreshHint.textContent = text;
        refreshHint.hidden = false;
      }
    }, { passive: false });
    doc.addEventListener('touchend', () => {
      const refresh = gesture && gesture.distance >= 90 && gesture.sequence === sequence
        && frames[activeIndex] === frame && loading.hidden && atTop();
      cancel();
      if (refresh) window.MJShell.reload();
    }, { passive: true });
    doc.addEventListener('touchcancel', cancel, { passive: true });
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
    installPullToRefresh(frame);
    hideRefreshHint();
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
