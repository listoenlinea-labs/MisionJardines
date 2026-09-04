(() => {
  const STORAGE_KEY = 'misionJardinesSidebarCollapsed';
  const MOBILE = '(max-width: 820px)';
  const svg = (body) => `<svg class="mj-side-icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const icons = {
    home: svg('<path d="m3 11 9-8 9 8"></path><path d="M5 10v10h14V10M9 20v-6h6v6"></path>'),
    payment: svg('<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 10h18M7 15h3"></path>'),
    residents: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>'),
    map: svg('<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"></path><path d="M9 3v15M15 6v15"></path>'),
    visits: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M19 8v6M22 11h-6"></path>'),
    reports: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6M8 13h8M8 17h5"></path>'),
    calendar: svg('<rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01"></path>'),
    directory: svg('<path d="M4 4h16v16H4z"></path><path d="M8 2v4M16 2v4M8 11h8M8 15h5"></path>'),
    shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path><path d="M12 8v4M12 16h.01"></path>'),
    headset: svg('<path d="M4 14a8 8 0 0 1 16 0M18 19h1a2 2 0 0 0 2-2v-3h-3v5ZM6 19H5a2 2 0 0 1-2-2v-3h3v5ZM18 19c0 2-2 3-6 3"></path>'),
    logout: svg('<path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"></path>')
  };

  const groups = [
    { label: '', items: [{ page: 'index.html', label: 'Inicio', icon: 'home' }] },
    { label: 'Comunidad', items: [
      { page: 'cuotas.html', label: 'Cuotas', icon: 'payment', roles: 'SUPER_ADMIN,ADMINISTRADOR,MESA_DIRECTIVA,CONDOMINO' },
      { page: 'bases_datos.html', label: 'Residentes', icon: 'residents', roles: 'SUPER_ADMIN,ADMINISTRADOR,MESA_DIRECTIVA,SEGURIDAD' },
      { page: 'mapa.html', label: 'Mapa', icon: 'map', roles: 'SUPER_ADMIN,ADMINISTRADOR,SEGURIDAD,CONDOMINO' },
      { page: 'visitas.html', label: 'Visitas', icon: 'visits', roles: 'SUPER_ADMIN,ADMINISTRADOR,SEGURIDAD,CONDOMINO' },
      { page: 'reportes.html', label: 'Reportes', icon: 'reports', roles: 'SUPER_ADMIN,ADMINISTRADOR,MANTENIMIENTO,SEGURIDAD,CONDOMINO' },
      { page: 'calendario.html', label: 'Calendario', icon: 'calendar', roles: 'SUPER_ADMIN,ADMINISTRADOR,MESA_DIRECTIVA,MANTENIMIENTO,CONDOMINO' },
      { page: 'directorio.html', label: 'Directorio', icon: 'directory', roles: 'SUPER_ADMIN,ADMINISTRADOR,MESA_DIRECTIVA,SEGURIDAD,MANTENIMIENTO,CONDOMINO' }
    ]},
    { label: 'Administración', items: [
      { page: 'seguridad.html', label: 'Seguridad', icon: 'shield', roles: 'SUPER_ADMIN,ADMINISTRADOR,SEGURIDAD' }
    ]}
  ];

  const page = () => location.pathname.split('/').pop() || 'index.html';
  function role() {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const raw = storage.getItem('misionJardinesUsuario');
        if (!raw) continue;
        const user = JSON.parse(raw);
        return user?.rol?.nombre || user?.rol || '';
      } catch (_) {}
    }
    return '';
  }

  function markup() {
    const active = page();
    const nav = groups.map(group => {
      const links = group.items.map(item => {
        const roles = item.roles ? ` data-roles="${item.roles}"` : '';
        return `<a class="mj-side-link${item.page === active ? ' active' : ''}" href="${item.page}"${roles}>${icons[item.icon]}<span>${item.label}</span></a>`;
      }).join('');
      return `<div class="mj-side-group">${group.label ? `<div class="mj-side-label">${group.label}</div>` : ''}${links}</div>`;
    }).join('');
    return `<div class="mj-side-inner">
      <div class="mj-side-logo"><img src="assets/images/logo-mision-jardines.png" alt="Misión Jardines"></div>
      <div class="mj-side-community"><strong>Misión Jardines</strong><span>Zapopan, Jalisco</span></div>
      <nav class="mj-side-nav" aria-label="Navegación principal">${nav}</nav>
      <div class="mj-side-support"><div class="mj-side-support-head">${icons.headset}<span>¿Necesitas ayuda?</span></div><p>Soporte disponible<br>Lun - Vie 9:00 - 18:00</p><a href="mailto:soluciones@listoenlinea.com">Contactar soporte</a></div>
      <button class="mj-side-logout" type="button">${icons.logout}<span>Cerrar sesión</span></button>
    </div>`;
  }

  function styles() {
    document.getElementById('mjSharedSidebarStyles')?.remove();
    const style = document.createElement('style');
    style.id = 'mjSharedSidebarStyles';
    style.textContent = `
      :root{--mj-side-width:224px;--mj-side-orange:#f97316;--mj-side-yellow:#facc15;--mj-side-ink:#172033;--mj-side-muted:#69758d;--mj-side-line:#e4e8ef;--mj-side-transition:.24s ease}
      body.mj-shared-sidebar-enabled{box-sizing:border-box!important;width:100%!important;padding-left:var(--mj-side-width)!important;transition:padding-left var(--mj-side-transition)!important}
      body.mj-shared-sidebar-enabled.mj-shared-sidebar-collapsed{padding-left:0!important}
      body.mj-shared-sidebar-enabled:not(.mj-home)>header{display:none!important}
      body.mj-home.mj-shared-sidebar-enabled .mj-shell{display:block!important;grid-template-columns:none!important;min-height:100vh!important}
      body.mj-home.mj-shared-sidebar-enabled #menuButton{display:none!important}
      .mj-shared-sidebar,.mj-shared-sidebar *{box-sizing:border-box!important}
      .mj-shared-sidebar{width:var(--mj-side-width)!important;height:100dvh!important;min-width:var(--mj-side-width)!important;max-width:var(--mj-side-width)!important;position:fixed!important;inset:0 auto 0 0!important;z-index:100!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;border-right:1px solid var(--mj-side-line)!important;border-radius:0!important;color:var(--mj-side-ink)!important;background:#fff!important;box-shadow:8px 0 24px rgba(15,23,42,.05)!important;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;font-size:16px!important;line-height:1.2!important;text-align:left!important;transform:translateX(0);transition:transform var(--mj-side-transition)!important}
      body.mj-shared-sidebar-collapsed .mj-shared-sidebar{transform:translateX(-100%)!important}
      .mj-side-inner{width:var(--mj-side-width)!important;height:100%!important;display:flex!important;flex-direction:column!important;margin:0!important;padding:23px 15px 16px!important;overflow:hidden!important;background:#fff!important}
      .mj-side-logo{width:100%!important;height:67px!important;display:grid!important;place-items:center!important;flex:0 0 67px!important;margin:0!important;padding:0!important}.mj-side-logo img{width:111px!important;height:46px!important;max-width:111px!important;display:block!important;object-fit:contain!important;filter:none!important}
      .mj-side-community{width:100%!important;flex:0 0 auto!important;margin:0!important;padding:15px 13px 14px!important;border-bottom:1px solid var(--mj-side-line)!important}.mj-side-community strong{display:block!important;margin:0!important;color:var(--mj-side-ink)!important;font-size:15px!important;font-weight:700!important}.mj-side-community span{display:block!important;margin-top:2px!important;color:#8b95a7!important;font-size:12px!important}
      .mj-side-nav{width:100%!important;max-width:none!important;min-height:0!important;display:block!important;flex:1 1 auto!important;overflow-y:auto!important;margin:0!important;padding:15px 0 8px!important;background:transparent!important;scrollbar-width:thin}.mj-side-group{width:100%!important;display:block!important;margin:0 0 15px!important}.mj-side-label{display:block!important;margin:0!important;padding:0 13px 7px!important;color:#8994a8!important;font-size:10px!important;font-weight:700!important;letter-spacing:.035em!important;text-transform:uppercase!important}
      .mj-side-link{width:100%!important;height:35px!important;position:relative!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:13px!important;margin:1px 0!important;padding:0 13px!important;border:0!important;border-radius:7px!important;color:#5f6b81!important;background:transparent!important;box-shadow:none!important;font-family:inherit!important;font-size:13px!important;font-weight:500!important;line-height:1.2!important;text-align:left!important;text-decoration:none!important;white-space:nowrap!important;transition:background .16s ease,color .16s ease!important}.mj-side-link:hover{color:var(--mj-side-orange)!important;background:#fff8f2!important}.mj-side-link.active{color:var(--mj-side-orange)!important;background:#fff5ec!important;font-weight:700!important}.mj-side-link.active:before{content:""!important;width:3px!important;position:absolute!important;inset:0 auto 0 -1px!important;border-radius:0 3px 3px 0!important;background:var(--mj-side-orange)!important}.mj-side-link[hidden]{display:none!important}
      .mj-side-icon{width:18px!important;height:18px!important;min-width:18px!important;flex:0 0 18px!important;display:block!important;margin:0!important;padding:0!important;stroke:currentColor!important;stroke-width:1.8!important;fill:none!important;stroke-linecap:round!important;stroke-linejoin:round!important}
      .mj-side-support{width:calc(100% - 2px)!important;flex:0 0 auto!important;margin:3px 1px 0!important;padding:15px 14px 12px!important;border:1px solid #f0e8df!important;border-radius:13px!important;color:var(--mj-side-ink)!important;background:linear-gradient(145deg,#fffaf6,#fff)!important;box-shadow:0 8px 24px rgba(249,115,22,.06)!important;text-align:center!important}.mj-side-support-head{display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;font-size:12px!important;font-weight:800!important}.mj-side-support-head .mj-side-icon{color:var(--mj-side-orange)!important}.mj-side-support p{margin:6px 0 9px!important;color:var(--mj-side-muted)!important;font-size:10px!important;line-height:1.55!important}.mj-side-support>a{width:100%!important;height:29px!important;display:grid!important;place-items:center!important;border-radius:7px!important;color:#fff!important;background:var(--mj-side-orange)!important;font-size:10px!important;font-weight:800!important;text-decoration:none!important}
      .mj-side-logout{width:calc(100% - 2px)!important;min-height:40px!important;flex:0 0 auto!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:9px!important;margin:10px 1px 0!important;padding:9px 14px!important;border:1px solid #f2d5bb!important;border-radius:10px!important;color:#bd5d0b!important;background:#fff8f2!important;font-family:inherit!important;font-size:11px!important;font-weight:800!important;cursor:pointer!important}.mj-side-logout:hover{color:#fff!important;background:var(--mj-side-orange)!important;border-color:var(--mj-side-orange)!important}
      .mj-side-tab{width:34px!important;height:46px!important;position:fixed!important;top:18px!important;left:var(--mj-side-width)!important;z-index:130!important;display:grid!important;place-items:center!important;margin:0!important;padding:0!important;border:1px solid #e4b600!important;border-left:0!important;border-radius:0 12px 12px 0!important;color:#4a3a00!important;background:linear-gradient(180deg,#fde047,var(--mj-side-yellow))!important;box-shadow:7px 4px 20px rgba(250,204,21,.24)!important;cursor:pointer!important;font-family:Inter,sans-serif!important;font-size:25px!important;font-weight:900!important;line-height:1!important;transition:left var(--mj-side-transition),background .2s ease,transform .2s ease!important}.mj-side-tab:hover{background:linear-gradient(180deg,#fef08a,#fde047)!important;transform:translateX(1px)!important}body.mj-shared-sidebar-collapsed .mj-side-tab{left:0!important}
      @media(max-width:1370px){:root{--mj-side-width:212px}}@media(max-width:820px){:root{--mj-side-width:min(280px,calc(100vw - 55px))}body.mj-shared-sidebar-enabled{padding-left:0!important}.mj-shared-sidebar{box-shadow:20px 0 50px rgba(15,23,42,.18)!important}.mj-side-tab{top:14px!important;height:42px!important}}@media(prefers-reduced-motion:reduce){body.mj-shared-sidebar-enabled,.mj-shared-sidebar,.mj-side-tab{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function createSidebar() {
    document.getElementById('sidebar')?.remove();
    const aside = document.createElement('aside');
    aside.id = 'sidebar';
    aside.className = 'mj-shared-sidebar';
    aside.setAttribute('aria-label', 'Navegación principal');
    aside.innerHTML = markup();
    document.body.insertBefore(aside, document.body.firstChild);
    return aside;
  }

  function permissions(aside) {
    const currentRole = role();
    if (!currentRole) return;
    aside.querySelectorAll('[data-roles]').forEach(el => {
      const allowed = el.dataset.roles.split(',').map(x => x.trim());
      el.hidden = !allowed.includes(currentRole);
    });
  }

  function collapse(body, button, collapsed, persist = true) {
    body.classList.toggle('mj-shared-sidebar-collapsed', collapsed);
    button.textContent = collapsed ? '›' : '‹';
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', collapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral');
    if (persist) try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch (_) {}
  }

  function logout() {
    ['misionJardinesToken', 'misionJardinesUsuario', STORAGE_KEY].forEach(key => localStorage.removeItem(key));
    ['misionJardinesToken', 'misionJardinesUsuario'].forEach(key => sessionStorage.removeItem(key));
    location.replace('login.html');
  }

  function init() {
    const body = document.body;
    if (!body || body.dataset.sharedSidebarReady === 'true') return;
    body.dataset.sharedSidebarReady = 'true';
    body.classList.add('mj-shared-sidebar-enabled');
    styles();
    if (!body.classList.contains('mj-home')) document.querySelector('body > header')?.remove();
    const aside = createSidebar();
    permissions(aside);
    aside.querySelector('.mj-side-logout')?.addEventListener('click', logout);

    if (page() === 'visitas.html' && !document.querySelector('script[data-house-fields]')) {
      const script = document.createElement('script');
      script.src = 'assets/js/house-fields.js?v=1';
      script.defer = true;
      script.dataset.houseFields = 'true';
      document.body.appendChild(script);
    }

    document.querySelector('.mj-side-tab')?.remove();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mj-side-tab';
    button.title = 'Ocultar / mostrar menú';
    button.setAttribute('aria-controls', 'sidebar');
    document.body.appendChild(button);

    let stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (_) {}
    let collapsed = stored === '1';
    if (stored !== '1' && stored !== '0' && matchMedia(MOBILE).matches) collapsed = true;
    button.addEventListener('click', () => collapse(body, button, !body.classList.contains('mj-shared-sidebar-collapsed')));
    aside.addEventListener('click', event => {
      if (matchMedia(MOBILE).matches && event.target.closest('a')) collapse(body, button, true);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && matchMedia(MOBILE).matches && !body.classList.contains('mj-shared-sidebar-collapsed')) {
        collapse(body, button, true); button.focus();
      }
    });
    collapse(body, button, collapsed, false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
