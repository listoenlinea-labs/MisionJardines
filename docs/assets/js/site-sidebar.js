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
    ads: svg('<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M7 8h10M7 12h6M7 16h4"></path><path d="M17 14v4M15 16h4"></path>'),
    calendar: svg('<rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01"></path>'),
    directory: svg('<path d="M4 4h16v16H4z"></path><path d="M8 2v4M16 2v4M8 11h8M8 15h5"></path>'),
    phone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.8L7.2 10a16 16 0 0 0 6.8 6.8l1.5-1.8a2 2 0 0 1 1.8-.6l3 .5a2 2 0 0 1 1.7 2Z"></path>'),
    shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path><path d="M12 8v4M12 16h.01"></path>'),
    account: svg('<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>'),
    headset: svg('<path d="M4 14a8 8 0 0 1 16 0M18 19h1a2 2 0 0 0 2-2v-3h-3v5ZM6 19H5a2 2 0 0 1-2-2v-3h3v5ZM18 19c0 2-2 3-6 3"></path>'),
    logout: svg('<path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"></path>')
  };

  const groups = [
    { label: '', items: [{ page: 'index.html', label: 'Inicio', icon: 'home' }] },
    { label: 'Comunidad', items: [
      { page: 'cuotas.html', label: 'Cuotas', icon: 'payment', roles: 'SUPER_ADMIN,ADMINISTRADOR,MESA_DIRECTIVA,CONDOMINO' },
      { page: 'pagos.html', label: 'Pagos', icon: 'payment', roles: 'SUPER_ADMIN,ADMINISTRADOR,MESA_DIRECTIVA,CONDOMINO' },
      { page: 'bases_datos.html', label: 'Residentes', icon: 'residents', roles: 'SUPER_ADMIN,ADMINISTRADOR,MESA_DIRECTIVA,SEGURIDAD' },
      { page: 'mapa.html', label: 'Mapa', icon: 'map', roles: 'SUPER_ADMIN,ADMINISTRADOR,SEGURIDAD,CONDOMINO' },
      { page: 'visitas.html', label: 'Visitas', icon: 'visits', roles: 'SUPER_ADMIN,ADMINISTRADOR,SEGURIDAD,CONDOMINO' },
      { page: 'conmutador.html', label: 'Conmutador', icon: 'phone', roles: 'SUPER_ADMIN,ADMINISTRADOR,MESA_DIRECTIVA,SEGURIDAD' },
      { page: 'reportes.html', label: 'Reportes', icon: 'reports', roles: 'SUPER_ADMIN,ADMINISTRADOR,MANTENIMIENTO,SEGURIDAD,CONDOMINO' },
      { page: 'anuncios.html', label: 'Anuncios', icon: 'ads', roles: 'SUPER_ADMIN,ADMINISTRADOR,MESA_DIRECTIVA,MANTENIMIENTO,SEGURIDAD,CONDOMINO' },
      { page: 'calendario.html', label: 'Calendario', icon: 'calendar', roles: 'SUPER_ADMIN,ADMINISTRADOR,MESA_DIRECTIVA,MANTENIMIENTO,CONDOMINO' },
      { page: 'directorio.html', label: 'Directorio', icon: 'directory', roles: 'SUPER_ADMIN,ADMINISTRADOR,MESA_DIRECTIVA,SEGURIDAD,MANTENIMIENTO,CONDOMINO' }
    ]},
    { label: 'Administración', items: [
      { page: 'seguridad.html', label: 'Seguridad', icon: 'shield', roles: 'SUPER_ADMIN,ADMINISTRADOR,SEGURIDAD' }
    ]}
  ];

  const page = () => location.pathname.split('/').pop() || 'index.html';
  const escapeHtml = value => String(value || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  function currentUser() {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const raw = storage.getItem('misionJardinesUsuario');
        if (raw) return JSON.parse(raw);
      } catch (_) {}
    }
    return {};
  }
  function role() {
    const user = currentUser();
    return user?.rol?.nombre || user?.rol || '';
  }

  function accountData() {
    const user = currentUser();
    const name = [user.nombre, user.apellidoPaterno].filter(Boolean).join(' ') || 'Mi cuenta';
    const userRole = user?.rol?.nombre || user?.rol || 'Usuario';
    const labels = { CONDOMINO: 'Residente', SEGURIDAD: 'Seguridad', ADMINISTRADOR: 'Administrativo', SUPER_ADMIN: 'Super Admin', MESA_DIRECTIVA: 'Mesa directiva' };
    const initials = [user.nombre, user.apellidoPaterno].filter(Boolean).map(value => value[0]).join('').toUpperCase() || 'MJ';
    return { name: escapeHtml(name), role: escapeHtml(labels[userRole] || userRole), initials: escapeHtml(initials) };
  }

  function markup() {
    const raw = page();
    const active = raw === 'reporte.html' ? 'reportes.html' : raw;
    const nav = groups.map(group => {
      const links = group.items.map(item => {
        const roles = item.roles ? ` data-roles="${item.roles}"` : '';
        return `<a class="mj-side-link${item.page === active ? ' active' : ''}" href="${item.page}"${roles}>${icons[item.icon]}<span>${item.label}</span></a>`;
      }).join('');
      return `<div class="mj-side-group">${group.label ? `<div class="mj-side-label">${group.label}</div>` : ''}${links}</div>`;
    }).join('');
    const account = accountData();
    return `<div class="mj-side-inner">
      <div class="mj-side-logo"><img src="assets/images/logo-mision-jardines.png" alt="Misión Jardines"></div>
      <div class="mj-side-community"><strong>Misión Jardines</strong><span>Zapopan, Jalisco</span></div>
      <nav class="mj-side-nav" aria-label="Navegación principal">${nav}</nav>
      <a class="mj-side-account${active === 'cuenta.html' ? ' active' : ''}" href="cuenta.html">${icons.account}<span><strong>${account.name}</strong><small>${account.role} · Editar cuenta</small></span></a>
      <div class="mj-side-support"><div class="mj-side-support-head">${icons.headset}<span>¿Necesitas ayuda?</span></div><p>Soporte disponible<br>Lun - Vie 9:00 - 18:00</p><a href="mailto:soluciones@listoenlinea.com">Contactar soporte</a></div>
      <button class="mj-side-logout" type="button">${icons.logout}<span>Cerrar sesión</span></button>
    </div>`;
  }

  function styles() {
    document.getElementById('mjSharedSidebarStyles')?.remove();
    const style = document.createElement('style');
    style.id = 'mjSharedSidebarStyles';
    style.textContent = `
      :root{--mj-side-width:242px;--mj-side-orange:#e9780d;--mj-side-yellow:#facc15;--mj-side-ink:#172033;--mj-side-muted:#69758d;--mj-side-line:#e4e8ef;--mj-side-transition:.24s ease}
      body.mj-shared-sidebar-enabled{box-sizing:border-box!important;width:100%!important;padding-left:var(--mj-side-width)!important;transition:padding-left var(--mj-side-transition)!important}
      body.page-calendario.mj-shared-sidebar-enabled{padding-top:0!important;padding-right:0!important;padding-bottom:0!important}
      body.mj-shared-sidebar-enabled.mj-shared-sidebar-collapsed{padding-left:0!important}
      body.mj-shared-sidebar-enabled:not(.mj-home)>header{display:none!important}
      body.mj-home.mj-shared-sidebar-enabled .mj-shell{display:block!important;grid-template-columns:none!important;min-height:100vh!important}
      body.mj-home.mj-shared-sidebar-enabled #menuButton{display:none!important}
      .mj-shared-sidebar,.mj-shared-sidebar *{box-sizing:border-box!important}
      .mj-shared-sidebar{width:var(--mj-side-width)!important;height:100dvh!important;min-width:var(--mj-side-width)!important;max-width:var(--mj-side-width)!important;position:fixed!important;inset:0 auto 0 0!important;z-index:100!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;border-right:1px solid var(--mj-side-line)!important;border-radius:0!important;color:var(--mj-side-ink)!important;background:#fff!important;box-shadow:8px 0 24px rgba(15,23,42,.05)!important;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;font-size:16px!important;line-height:1.2!important;text-align:left!important;transform:translateX(0);transition:transform var(--mj-side-transition)!important}
      body.mj-shared-sidebar-collapsed .mj-shared-sidebar{transform:translateX(-100%)!important}
      .mj-side-inner{width:var(--mj-side-width)!important;height:100%!important;display:flex!important;flex-direction:column!important;margin:0!important;padding:23px 15px 16px!important;overflow:hidden!important;background:#fff!important}
      .mj-side-logo{width:100%!important;height:82px!important;display:grid!important;place-items:center!important;flex:0 0 82px!important;margin:0!important;padding:0!important;overflow:hidden!important;border-radius:11px!important;background:#f8faf9!important}.mj-side-logo img{width:190px!important;height:95px!important;max-width:190px!important;display:block!important;object-fit:cover!important;object-position:center!important;filter:none!important}
      .mj-side-community{width:100%!important;flex:0 0 auto!important;margin:0!important;padding:15px 13px 14px!important;border-bottom:1px solid var(--mj-side-line)!important}.mj-side-community strong{display:block!important;margin:0!important;color:var(--mj-side-ink)!important;font-size:15px!important;font-weight:700!important}.mj-side-community span{display:block!important;margin-top:2px!important;color:#8b95a7!important;font-size:12px!important}
      .mj-side-nav{width:100%!important;max-width:none!important;min-height:0!important;display:block!important;flex:1 1 auto!important;overflow-y:auto!important;margin:0!important;padding:15px 0 8px!important;background:transparent!important;scrollbar-width:thin}.mj-side-group{width:100%!important;display:block!important;margin:0 0 15px!important}.mj-side-label{display:block!important;margin:0!important;padding:0 13px 7px!important;color:#8994a8!important;font-size:10px!important;font-weight:700!important;letter-spacing:.035em!important;text-transform:uppercase!important}
      .mj-side-link{width:100%!important;height:38px!important;position:relative!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:13px!important;margin:1px 0!important;padding:0 13px!important;border:0!important;border-radius:9px!important;color:#526077!important;background:transparent!important;box-shadow:none!important;font-family:inherit!important;font-size:13px!important;font-weight:600!important;line-height:1.2!important;text-align:left!important;text-decoration:none!important;white-space:nowrap!important;transition:background .16s ease,color .16s ease!important}.mj-side-link:hover{color:var(--mj-side-orange)!important;background:#fff8f2!important}.mj-side-link.active{color:var(--mj-side-orange)!important;background:#fff5ec!important;font-weight:750!important}.mj-side-link.active:before{content:""!important;width:3px!important;position:absolute!important;inset:0 auto 0 -1px!important;border-radius:0 3px 3px 0!important;background:var(--mj-side-orange)!important}.mj-side-link[hidden]{display:none!important}
      .mj-side-icon{width:18px!important;height:18px!important;min-width:18px!important;flex:0 0 18px!important;display:block!important;margin:0!important;padding:0!important;stroke:currentColor!important;stroke-width:1.8!important;fill:none!important;stroke-linecap:round!important;stroke-linejoin:round!important}
      .mj-side-account{width:calc(100% - 2px)!important;min-height:49px!important;display:flex!important;align-items:center!important;gap:10px!important;margin:3px 1px 7px!important;padding:9px 11px!important;border:1px solid #e4e8ef!important;border-radius:11px!important;color:var(--mj-side-ink)!important;background:#fafbfe!important;text-decoration:none!important}.mj-side-account:hover,.mj-side-account.active{border-color:#f1c99f!important;background:#fff7ef!important}.mj-side-account>.mj-side-icon{color:var(--mj-side-orange)!important}.mj-side-account>span{min-width:0!important}.mj-side-account strong,.mj-side-account small{display:block!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}.mj-side-account strong{font-size:10px!important;font-weight:800!important}.mj-side-account small{margin-top:3px!important;color:#7c879a!important;font-size:8px!important}
      .mj-side-support{width:calc(100% - 2px)!important;flex:0 0 auto!important;margin:3px 1px 0!important;padding:15px 14px 12px!important;border:1px solid #f0e8df!important;border-radius:13px!important;color:var(--mj-side-ink)!important;background:linear-gradient(145deg,#fffaf6,#fff)!important;box-shadow:0 8px 24px rgba(249,115,22,.06)!important;text-align:center!important}.mj-side-support-head{display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;font-size:12px!important;font-weight:800!important}.mj-side-support-head .mj-side-icon{color:var(--mj-side-orange)!important}.mj-side-support p{margin:6px 0 9px!important;color:var(--mj-side-muted)!important;font-size:10px!important;line-height:1.55!important}.mj-side-support>a{width:100%!important;height:29px!important;display:grid!important;place-items:center!important;border-radius:7px!important;color:#fff!important;background:var(--mj-side-orange)!important;font-size:10px!important;font-weight:800!important;text-decoration:none!important}
      .mj-side-logout{width:calc(100% - 2px)!important;min-height:40px!important;flex:0 0 auto!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:9px!important;margin:10px 1px 0!important;padding:9px 14px!important;border:1px solid #f2d5bb!important;border-radius:10px!important;color:#bd5d0b!important;background:#fff8f2!important;font-family:inherit!important;font-size:11px!important;font-weight:800!important;cursor:pointer!important}.mj-side-logout:hover{color:#fff!important;background:var(--mj-side-orange)!important;border-color:var(--mj-side-orange)!important}
      .mj-side-tab{width:34px!important;height:46px!important;position:fixed!important;top:18px!important;left:var(--mj-side-width)!important;z-index:130!important;display:grid!important;place-items:center!important;margin:0!important;padding:0!important;border:1px solid #e4b600!important;border-left:0!important;border-radius:0 12px 12px 0!important;color:#4a3a00!important;background:linear-gradient(180deg,#fde047,var(--mj-side-yellow))!important;box-shadow:7px 4px 20px rgba(250,204,21,.24)!important;cursor:pointer!important;font-family:Inter,sans-serif!important;font-size:25px!important;font-weight:900!important;line-height:1!important;transition:left var(--mj-side-transition),background .2s ease,transform .2s ease!important}.mj-side-tab:hover{background:linear-gradient(180deg,#fef08a,#fde047)!important;transform:translateX(1px)!important}body.mj-shared-sidebar-collapsed .mj-side-tab{left:0!important}
      .mj-account-top{position:fixed!important;top:14px!important;right:22px!important;z-index:90!important;display:flex!important;align-items:center!important;gap:10px!important;padding:7px 10px 7px 8px!important;border:1px solid #e3e7ee!important;border-radius:14px!important;color:var(--mj-side-ink)!important;background:rgba(255,255,255,.94)!important;box-shadow:0 9px 28px rgba(35,42,61,.08)!important;backdrop-filter:blur(10px)!important;text-decoration:none!important;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}.mj-account-top-avatar{display:grid!important;place-items:center!important;width:35px!important;height:35px!important;border-radius:11px!important;color:#fff!important;background:linear-gradient(135deg,#f58b1c,#e87100)!important;font-size:10px!important;font-weight:900!important}.mj-account-top-copy{min-width:0!important}.mj-account-top-copy strong,.mj-account-top-copy small{display:block!important;max-width:160px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}.mj-account-top-copy strong{font-size:10px!important}.mj-account-top-copy small{margin-top:3px!important;color:#7c879a!important;font-size:8px!important}.mj-account-top-arrow{color:#a0a8b7!important;font-size:15px!important}.mj-account-top:hover{border-color:#efb579!important;background:#fffaf6!important}
      .mj-account-menu-link{width:100%!important;height:38px!important;display:grid!important;place-items:center!important;margin-bottom:6px!important;border:1px solid #f0d3b5!important;border-radius:8px!important;color:#ad5709!important;background:#fffaf5!important;font-size:11px!important;font-weight:800!important;text-decoration:none!important}
      @media(max-width:1370px){:root{--mj-side-width:224px}}@media(max-width:820px){:root{--mj-side-width:min(280px,calc(100vw - 55px))}body.mj-shared-sidebar-enabled{padding-left:0!important}body.page-calendario.mj-shared-sidebar-enabled{width:100vw!important;max-width:100vw!important;padding-left:0!important;padding-right:0!important}.mj-shared-sidebar{box-shadow:20px 0 50px rgba(15,23,42,.18)!important}.mj-side-tab{top:14px!important;height:42px!important}.mj-account-top,body.mj-home .profile-wrap{display:none!important}}@media(prefers-reduced-motion:reduce){body.mj-shared-sidebar-enabled,.mj-shared-sidebar,.mj-side-tab{transition:none!important}}
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

  function createTopAccount() {
    document.querySelector('.mj-account-top')?.remove();
    if (page() === 'index.html') {
      const menu = document.getElementById('profileMenu');
      if (menu && !menu.querySelector('.mj-account-menu-link')) {
        const link = document.createElement('a');
        link.className = 'mj-account-menu-link';
        link.href = 'cuenta.html';
        link.textContent = 'Editar mi cuenta';
        menu.prepend(link);
      }
      return;
    }
    const account = accountData();
    const link = document.createElement('a');
    link.className = 'mj-account-top';
    link.href = 'cuenta.html';
    link.setAttribute('aria-label', 'Abrir configuración de mi cuenta');
    link.innerHTML = `<span class="mj-account-top-avatar">${account.initials}</span><span class="mj-account-top-copy"><strong>${account.name}</strong><small>${account.role} · Mi cuenta</small></span><span class="mj-account-top-arrow">›</span>`;
    document.body.appendChild(link);
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

  function loadHomeDashboard() {
    if (page() !== 'index.html' || document.querySelector('script[data-mj-home-dashboard]')) return;
    const script = document.createElement('script');
    script.src = 'assets/js/home-dashboard.js?v=20260908';
    script.defer = true;
    script.dataset.mjHomeDashboard = 'true';
    document.body.appendChild(script);
  }

  function init() {
    const body = document.body;
    if (!body || body.dataset.sharedSidebarReady === 'true') return;
    body.dataset.sharedSidebarReady = 'true';
    body.classList.add('mj-shared-sidebar-enabled');
    styles();
    if (!body.classList.contains('mj-home')) document.querySelector('body > header')?.remove();
    const aside = createSidebar();
    createTopAccount();
    permissions(aside);
    aside.querySelector('.mj-side-logout')?.addEventListener('click', logout);

    if (page() === 'visitas.html' && !document.querySelector('script[data-house-fields]')) {
      const script = document.createElement('script');
      script.src = 'assets/js/house-fields.js?v=1';
      script.defer = true;
      script.dataset.houseFields = 'true';
      document.body.appendChild(script);
    }

    loadHomeDashboard();
    if (page() !== 'login.html' && !document.querySelector('script[data-mj-global-search]')) {
      const search = document.createElement('script');
      search.src = 'assets/js/global-search.js?v=20260925';
      search.dataset.mjGlobalSearch = 'true';
      document.body.appendChild(search);
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
