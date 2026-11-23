(() => {
  'use strict';

  // El documento principal conserva la navegación y la sesión. Cada sección
  // funciona en un documento aislado para evitar listeners y temporizadores
  // duplicados al pasar entre módulos heredados.
  const home = 'index.html';
  const securityLanding = 'conmutador.html';
  const resolveEntry = candidate => userRole === 'SEGURIDAD' && (!candidate || candidate === home) ? securityLanding : candidate;
  const frames = [document.getElementById('mjPageA'), document.getElementById('mjPageB')];
  const frameStates = new WeakMap();
  const cached = new Map();
  // Las conexiones a ZKTeco, Conmutador, controles, visitas y los procesos
  // bancarios NO se conservan en segundo plano: mantienen su ciclo original.
  const SAFE_CACHE = new Set([
    'index.html','analisis-cuotas.html','casa-club.html',
    'anuncios.html','calendario.html','directorio.html'
  ]);
  const MAX_CACHE_AGE = 4 * 60 * 1000;
  // Nunca conservar enlaces con folios, tokens o parámetros de formularios.
  const canCache = route => SAFE_CACHE.has(route.page) && route.target === route.page;
  const frameLimit = () => matchMedia('(max-width:820px)').matches ? 3 : 4;
  const currentToken = () => localStorage.getItem('misionJardinesToken')
    || sessionStorage.getItem('misionJardinesToken');
  const houseContext = () => sessionStorage.getItem('mjCasaSeleccionada') || '';
  let currentHouse = houseContext();
  const frameHost = document.getElementById('mjAppContent');

  function signalFrame(frame, active, fromCache = false) {
    if (!frame) return;
    try {
      frame.contentWindow.MJSectionActive = active;
      frame.contentWindow.dispatchEvent(new CustomEvent(active ? 'mj:shell-activated' : 'mj:shell-deactivated', {
        detail: { fromCache }
      }));
    } catch (_) { /* Frame descargado o cambiando de origen */ }
  }
  function removeCache(frame) {
    for (const [key, entry] of cached) {
      if (entry.frame === frame) cached.delete(key);
    }
  }
  function forgetFrame(frame) {
    removeCache(frame);
    frameStates.delete(frame);
    frame.classList.remove('is-active','is-leaving');
    frame.setAttribute('aria-hidden','true');
    frame.setAttribute('tabindex','-1');
    frame.src = 'about:blank';
  }
  function invalidateAllFrames() {
    cached.clear();
    ++sequence; // Invalidar callbacks de cargas anteriores
    for (const frame of frames) forgetFrame(frame);
    activeIndex = -1;
    requested = '';
    window.MJShellVerifiedSession = null;
  }
  function validSessionContext() {
    if (!currentToken() || currentToken() !== token) {
      invalidateAllFrames();
      location.replace('login.html');
      return false;
    }
    if (houseContext() !== currentHouse) {
      currentHouse = houseContext();
      invalidateAllFrames();
    }
    return true;
  }
  function cacheEntry(route) {
    const entry = cached.get(route.target);
    if (!entry) return null;
    if (!entry.ready || entry.house !== currentHouse || entry.token !== token ||
        Date.now()-entry.createdAt > MAX_CACHE_AGE) {
      cached.delete(route.target);
      return null;
    }
    try {
      const here = new URL(entry.frame.contentWindow.location.href);
      if (here.origin !== location.origin || here.pathname.split('/').pop() !== route.page ||
          !(entry.frame.contentDocument?.documentElement?.hasAttribute('data-mj-authorized') ||
            route.page === 'casa-club.html')) {
        cached.delete(route.target);
        return null;
      }
    } catch (_) { cached.delete(route.target);return null; }
    return entry;
  }
  function acquireFrame() {
    const active = frames[activeIndex];
    // Reutilizar primero un marco libre/no cacheado; después crear uno nuevo
    // hasta un máximo acotado, y finalmente descartar el menos reciente.
    let free = frames.find(f => f !== active && ![...cached.values()].some(e=>e.frame===f));
    if (free) return free;
    if (frames.length < frameLimit()) {
      const frame = document.createElement('iframe');
      frame.id = 'mjPageCache' + frames.length;
      frame.className = 'mj-app-frame';
      frame.title = 'Sección del portal';
      frame.setAttribute('aria-hidden','true');
      frame.setAttribute('tabindex','-1');
      frame.setAttribute('allow','clipboard-write; fullscreen');
      frameHost.insertBefore(frame,loading);
      frames.push(frame);
      watchFrameNavigation(frame);
      return frame;
    }
    const candidates = [...cached.values()].filter(e=>e.frame!==active);
    if (candidates.length) {
      candidates.sort((a,b)=>a.lastUsed-b.lastUsed);
      return candidates[0].frame;
    }
    return frames.find(f=>f!==active) || frames[0];
  }

  const loading = document.getElementById('mjAppLoading');
  const errorBox = document.getElementById('mjAppError');
  const refreshHint = document.getElementById('mjAppRefresh');
  const refreshDocuments = new WeakSet();
  const token = window.MJ_TOKEN;
  const publicClubEntry = new URLSearchParams(location.search).get('page') === 'casa-club.html';
  // El enlace compartido sale del marco privado hacia el formulario público.
  const openPublicClub = () => location.replace('casa-club.html');
  const openWithoutSession = () => publicClubEntry ? openPublicClub() : location.replace('login.html');
  const base = new URL('.', location.href);
  let userRole = '';
  // Perfil validado en memoria para las secciones embebidas. El backend
  // sigue autorizando cada petición y el cambio de vivienda lo invalida.
  window.MJShellVerifiedSession = null;
  const prefetchedRoutes = new Set();
  function prefetchRoute(input) {
    const route = allowed(input);
    if (!route || navigator.connection?.saveData || navigator.connection?.effectiveType === '2g') return;
    const href = frameUrl(route);
    if (prefetchedRoutes.has(href) || prefetchedRoutes.size >= 8) return;
    prefetchedRoutes.add(href);
    const hint = document.createElement('link');
    hint.rel = 'prefetch';
    hint.as = 'document';
    hint.href = href;
    document.head.appendChild(hint);
  }
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
    window.MJInstallPullRefresh({
      doc,
      hint: refreshHint,
      enabled: () => frames[activeIndex] === frame && loading.hidden
        && !hasVisibleChildModal(doc) && !document.querySelector('.mj-mobile-scrim:not([hidden])'),
      revision: () => sequence,
      reload: () => window.MJShell.reload()
    });
  }

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

  function hasVisibleChildModal(doc) {
    if (!doc?.body) return false;
    return [...doc.querySelectorAll(childModalSelector)].some(modal => {
      // Hay diálogos renderizados permanentemente dentro de overlays ocultos:
      // no cuentan hasta que todo su árbol esté visible.
      if (modal.tagName === 'DIALOG' && !modal.open) return false;
      if (modal.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const computed = doc.defaultView.getComputedStyle(modal);
      return computed.display !== 'none' && computed.visibility !== 'hidden' && modal.getClientRects().length > 0;
    });
  }

  function syncChildModalChrome(frame) {
    if (activeIndex < 0 || frames[activeIndex] !== frame) return;
    const hasOpenModal = hasVisibleChildModal(frame.contentDocument);
    document.body.classList.toggle('mj-child-modal-open', hasOpenModal);
    if (hasOpenModal) hideRefreshHint();
  }

  function watchChildModals(frame) {
    resetChildModalChrome();
    const body = frame.contentDocument?.body;
    if (!body) return;
    // También reinstalar el gesto si la sección se recarga por su cuenta.
    installPullToRefresh(frame);
    hideRefreshHint();
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
    if(route.page==='analisis-cuotas.html')url.searchParams.set('_mjVersion','recibos-manuales-20261109');
    if(route.page==='visitas.html')url.searchParams.set('_mjVersion','tablero-visitas-20261109');
    if(route.page==='pagos.html')url.searchParams.set('_mjVersion','aportaciones-libres-20261103');
     if(route.page==='zkteco.html')url.searchParams.set('_mjVersion','tag-ios-sin-autofill-20261103');
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

  function activateFrame(frame, route, ordinal, fromCache = false) {
    if (ordinal !== sequence) return;
    // También cubrir secciones que aún tengan el script lateral en caché.
    frame.contentDocument?.body?.classList.add('mj-shared-sidebar-collapsed');
    const old = activeIndex >= 0 ? frames[activeIndex] : null;
    if (old && old !== frame) {
      signalFrame(old,false);
      old.classList.remove('is-active');
      old.classList.add('is-leaving');
      old.setAttribute('aria-hidden','true');
      old.setAttribute('tabindex','-1');
      const oldState = frameStates.get(old);
      // Transición visual y liberación de marcos no conservables; los marcos
      // cacheados quedan vivos y no pierden scroll/filtros.
      setTimeout(() => {
        old.classList.remove('is-leaving');
        if (frames[activeIndex] !== old && oldState === frameStates.get(old) &&
            ![...cached.values()].some(e=>e.frame===old)) forgetFrame(old);
      }, 220);
    }
    frame.classList.remove('is-leaving');
    frame.classList.add('is-active');
    frame.setAttribute('aria-hidden','false');
    frame.removeAttribute('tabindex');
    activeIndex = frames.indexOf(frame);
    signalFrame(frame,true,fromCache);
    watchChildModals(frame);
    currentPage = route.page;
    document.body.classList.toggle('mj-shell-home-header', currentPage === home);
    requested = route.target;
    loading.hidden = true;
    errorBox.hidden = true;
    document.title = (frame.contentDocument?.title || route.page) + ' | Misión Jardines';
    updateSidebar();
    document.dispatchEvent(new CustomEvent('mj-shell-page-ready', {detail:{page:route.page,fromCache}}));
    performance.mark?.('mj-section-visible-' + ordinal);
    try {performance.measure('mj-section-navigation','mj-section-start-' + ordinal,'mj-section-visible-' + ordinal);}
    catch (_) { /* No disponible en navegadores anteriores */ }
  }

  let pendingNavigation = null;
  function navigate(input, { replace = false, fromHistory = false, reload = false } = {}) {
    const route = allowed(input);
    if (!route || !validSessionContext()) return false;
    if (!reload && route.target === requested && activeIndex >= 0) return true;
    resetChildModalChrome();
    const ordinal = ++sequence;
    performance.mark?.('mj-section-start-' + ordinal);
    pendingNavigation = null;
    const address = new URL(location.href);
    address.searchParams.set('page', route.target);
    if (!fromHistory) history[replace ? 'replaceState' : 'pushState']({page:route.target},'',address);
    currentPage = route.page;
    requested = route.target;
    updateSidebar();
    errorBox.hidden = true;

    // Ruta ya visitada: volver instantáneamente al MISMO documento.
    // Nunca permite reutilizar otra vivienda, token ni una página hardware/pago.
    const hit = !reload && canCache(route) ? cacheEntry(route) : null;
    if (hit) {
      hit.lastUsed=Date.now();
      activateFrame(hit.frame,route,ordinal,true);
      return true;
    }

    loading.hidden = false;
    const frame = acquireFrame();
    removeCache(frame);
    const state = {target:route.target,ordinal,ready:false,createdAt:Date.now()};
    frameStates.set(frame,state);
    const targetUrl = frameUrl(route);
    let finished=false;
    const finish = async () => {
      if (finished || ordinal!==sequence || frameStates.get(frame)!==state) return;
      finished=true;
      try {
        const doc = frame.contentDocument;
        const ready = frame.contentWindow.MJAccessReady;
        // Si falta autorización el marco nunca se hace visible. No convertir
        // el timeout de sesión en un "acceso concedido" por accidente.
        if (ready) {
          const result = await Promise.race([
            Promise.resolve(ready),
            new Promise((_,reject)=>setTimeout(()=>reject(Error('La validación de sesión tardó demasiado.')),15000))
          ]);
          if (!result) throw Error('No fue posible validar tu sesión.');
        }
        if (ordinal!==sequence || frameStates.get(frame)!==state) return;
        const here = new URL(frame.contentWindow.location.href);
        if (here.origin!==location.origin || here.pathname.split('/').pop()!==route.page ||
            doc?.documentElement?.hasAttribute('data-mj-denied')) {
          throw Error('Esta sección no está disponible para tu cuenta.');
        }
        state.ready=true;
        if (canCache(route)) {
          cached.set(route.target,{
            frame,token,house:currentHouse,ready:true,
            createdAt:Date.now(),lastUsed:Date.now()
          });
        }
        activateFrame(frame,route,ordinal,false);
      } catch (e) {
        if (ordinal===sequence) error(e.message||'No fue posible abrir esta sección.');
      }
    };
    pendingNavigation = {frame,route,ordinal,finish};
    // La página secundaria notifica cuando su DOM está autorizado. El load
    // clásico queda como respaldo, por ejemplo para secciones antiguas.
    const onTargetLoad=()=>{
      if (ordinal!==sequence || frameStates.get(frame)!==state){
        frame.removeEventListener('load',onTargetLoad);
        return;
      }
      // Cambiar src desde about:blank puede emitir un load anterior.
      // No consumir el listener hasta que llegue la URL solicitada.
      try{
        const here=new URL(frame.contentWindow.location.href);
        if(here.origin!==location.origin||here.pathname.split('/').pop()!==route.page)return;
      }catch(_){return;}
      frame.removeEventListener('load',onTargetLoad);
      void finish();
    };
    frame.addEventListener('load',onTargetLoad);
    frame.src=targetUrl;
    return true;
  }

  function watchFrameNavigation(frame) {
    frame.addEventListener('load', () => {
      if (frames[activeIndex] !== frame) return;
      let href;
      try {href=frame.contentWindow.location.href;} catch (_) {return;}
      const url = new URL(href);
      if (url.pathname.endsWith('/login.html')) {invalidateAllFrames();location.replace('login.html');return;}
      const route = allowed(href);
      if (route && route.page!==currentPage) navigate(route.target,{replace:true});
      else watchChildModals(frame);
    });
  }

  window.MJShell = {
    get currentPage() { return currentPage; },
    navigate,
    reload() {
      // El refresco explícito siempre hace una carga real, no usa caché.
      removeCache(frames[activeIndex]);
      return navigate(requested,{fromHistory:true,reload:true});
    },
    clearCache() { invalidateAllFrames(); }
  };

  // El encabezado pertenece al documento exterior: sus eventos táctiles nunca
  // llegan al iframe. Permitir el mismo gesto sin empezar sobre sus botones.
  window.MJInstallPullRefresh({
    doc: document,
    hint: refreshHint,
    enabled: () => activeIndex >= 0 && loading.hidden
      && !hasVisibleChildModal(frames[activeIndex].contentDocument)
      && !document.querySelector('.mj-mobile-scrim:not([hidden])'),
    revision: () => sequence,
    scrollRoots: () => {
      const doc = frames[activeIndex].contentDocument;
      return [doc.scrollingElement, ...doc.querySelectorAll('*')].filter(node => node
        && node.scrollHeight > node.clientHeight + 1
        && /auto|scroll|overlay/.test(doc.defaultView.getComputedStyle(node).overflowY));
    },
    reload: () => window.MJShell.reload()
  });

  // Algunos formularios antiguos aún usan location.href internamente.
  // Si cambian el documento interior, sincronizar URL y menú sin recargar el
  // marco exterior ni permitir que una redirección de sesión quede anidada.
  frames.forEach(watchFrameNavigation);

  window.addEventListener('message', event=>{
    if(event.origin!==location.origin || event.data?.type!=='MJ_SHELL_READY')return;
    const pending=pendingNavigation;
    if(!pending || pending.ordinal!==sequence ||
       event.source!==pending.frame.contentWindow)return;
    if(event.data.page!==pending.route.page)return;
    void pending.finish();
  });

  window.MJAccessReady = (async () => {
    if (!token) { openWithoutSession(); return false; }
    try {
      const response = await window.MJFetchWithTimeout(`${window.MJ_API_URL}/auth/perfil`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
      }, 20000);
      if (response.status === 401 || response.status === 403) {
        ['misionJardinesToken', 'misionJardinesUsuario'].forEach(key => {
          localStorage.removeItem(key); sessionStorage.removeItem(key);
        });
        openWithoutSession();
        return false;
      }
      if (!response.ok) throw Error('No fue posible validar la sesión.');
      const result = await response.json();
      userRole = result.usuario?.rol?.nombre || result.usuario?.rol || '';
      // No persistimos este estado en el disco ni lo exponemos a otros orígenes.
      // El contexto de casa se captura junto con el perfil; otra casa exige
      // una nueva validación con el backend.
      if (!result.ok || !window.MJPermissions.canAccess(userRole, window.MJPermissions.landing(userRole))) throw Error('Sesión inválida.');
      window.MJShellVerifiedSession = {
        token, user: result.usuario,
        houseId: sessionStorage.getItem('mjCasaSeleccionada') || '',
        verifiedAt: Date.now()
      };
      for (const storage of [localStorage, sessionStorage]) {
        if (storage.getItem('misionJardinesToken') === token) {
          storage.setItem('misionJardinesUsuario', JSON.stringify(result.usuario));
        }
      }
      window.MJVerifiedRole = userRole;
      if (userRole === 'SEGURIDAD') sessionStorage.removeItem('mjCasaSeleccionada');
      return true;
    } catch (cause) {
      if (publicClubEntry) openPublicClub();
      else error(cause.message || 'No fue posible verificar tu sesión.');
      return false;
    }
  })();

  // Prefetch de HTML autorizado solo cuando el usuario se aproxima a un enlace;
  // no descarga datos privados ni ejecuta scripts de esa sección.
  const warmLink = event => {
    const link = event.target.closest?.('a[href]');
    if (link && !link.hasAttribute('download') && link.target !== '_blank')
      prefetchRoute(link.getAttribute('href'));
  };
  document.addEventListener('pointerover', warmLink, { passive: true });
  document.addEventListener('focusin', warmLink);
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
    const target = resolveEntry(new URLSearchParams(location.search).get('page') || window.MJPermissions.landing(userRole));
    navigate(allowed(target)?.target || window.MJPermissions.landing(userRole), { fromHistory: true });
  });
  document.getElementById('mjAppRetry').addEventListener('click', () => {
    if (userRole) navigate(resolveEntry(requested || window.MJPermissions.landing(userRole)), { fromHistory: true, reload: true });
    else location.reload();
  });

  window.MJAccessReady.then(ok => {
    if (!ok) return;
    if (publicClubEntry && !allowed('casa-club.html')) { openPublicClub(); return; }
    const raw = resolveEntry(new URLSearchParams(location.search).get('page') || window.MJPermissions.landing(userRole));
    navigate(allowed(raw)?.target || window.MJPermissions.landing(userRole), { replace: true });
  });
})();
