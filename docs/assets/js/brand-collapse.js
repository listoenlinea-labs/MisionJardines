(() => {
  const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const body = document.body;
  if (!body || page === 'login.html') return;

  const addPremiumStyles = () => {
    if (document.querySelector('link[data-mj-premium]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'assets/css/premium.css?v=20260828-2';
    link.dataset.mjPremium = 'true';
    document.head.appendChild(link);
  };

  const safeUser = () => {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const raw = storage.getItem('misionJardinesUsuario');
        if (raw) return JSON.parse(raw);
      } catch (_) {}
    }
    return {};
  };

  const currentUser = safeUser();
  const fullName = [currentUser.nombre, currentUser.apellidoPaterno].filter(Boolean).join(' ') || 'Administrador';
  const firstName = currentUser.nombre || 'Administrador';
  const initials = `${currentUser.nombre?.[0] || 'A'}${currentUser.apellidoPaterno?.[0] || 'D'}`.toUpperCase();
  const role = currentUser.rol?.nombre || 'Administrador';

  const iconFor = (href) => ({
    'index.html': 'home', 'cuotas.html': 'card', 'bases_datos.html': 'database',
    'mapa.html': 'map', 'visitas.html': 'users', 'seguridad.html': 'shield',
    'calendario.html': 'calendar', 'reportes.html': 'report', 'directorio.html': 'directory'
  }[href] || 'dot');

  const iconSvg = (name) => {
    const paths = {
      home: '<path d="M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
      card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
      database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
      map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',
      users: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20c.3-4 2.2-6 6-6s5.7 2 6 6M15 15c3 0 4.7 1.5 5 4"/>',
      shield: '<path d="M12 3 5 6v5c0 4.7 2.8 8.2 7 10 4.2-1.8 7-5.3 7-10V6Z"/><path d="m9 12 2 2 4-5"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M17 14h1M7 18h2M12 18h2"/>',
      report: '<path d="M6 3h9l4 4v14H6Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
      directory: '<path d="M5 4h14v17H5Z"/><path d="M9 4V2M15 4V2M9 9h6M9 13h6M9 17h4"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
      menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
      vehicle: '<path d="M5 16h14l-1.2-6.5A2 2 0 0 0 15.8 8H8.2a2 2 0 0 0-2 1.5Z"/><path d="M3 13h18v5H3ZM7 18v2M17 18v2"/>',
      megaphone: '<path d="m4 13 12-5v10L4 13Z"/><path d="M7 14v5h4l-1-4"/>',
      dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      dot: '<circle cx="12" cy="12" r="2"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.dot}</svg>`;
  };

  const setupSidebar = () => {
    const sidebar = document.querySelector('body > header');
    const nav = sidebar?.querySelector('nav');
    const menu = nav?.querySelector('.menu');
    if (!sidebar || !nav || !menu) return;
    body.classList.add('mj-shell');
    sidebar.classList.add('mj-sidebar');
    nav.classList.add('mj-sidebar-nav');

    const links = [...menu.querySelectorAll(':scope > a')];
    links.forEach((link) => {
      const href = (link.getAttribute('href') || '').split('#')[0].toLowerCase();
      const icon = document.createElement('span');
      icon.className = 'mj-menu-icon';
      icon.innerHTML = iconSvg(iconFor(href));
      link.prepend(icon);
    });

    const linkByHref = new Map(links.map(link => [(link.getAttribute('href') || '').split('#')[0].toLowerCase(), link]));
    const ordered = [
      ['INICIO', ['index.html']],
      ['COMUNIDAD', ['cuotas.html', 'visitas.html', 'reportes.html', 'directorio.html', 'calendario.html']],
      ['ADMINISTRACIÓN', ['bases_datos.html', 'mapa.html', 'seguridad.html']]
    ];
    menu.innerHTML = '';
    ordered.forEach(([label, hrefs], index) => {
      if (index > 0) {
        const heading = document.createElement('span');
        heading.className = 'mj-menu-heading';
        heading.textContent = label;
        menu.appendChild(heading);
      }
      hrefs.forEach(href => { if (linkByHref.has(href)) menu.appendChild(linkByHref.get(href)); });
    });
    links.forEach(link => { if (!menu.contains(link)) menu.appendChild(link); });

    const support = document.createElement('aside');
    support.className = 'mj-support-card';
    support.innerHTML = `<span class="mj-support-icon">${iconSvg('report')}</span><div><strong>¿Necesitas ayuda?</strong><small>Soporte disponible<br>Lun–Vie · 9:00–18:00</small></div><a href="mailto:soluciones@listoenlinea.com">Contactar soporte</a>`;
    nav.appendChild(support);
  };

  const setupTopbar = () => {
    const topbar = document.createElement('div');
    topbar.className = 'mj-appbar';
    topbar.innerHTML = `
      <button class="mj-menu-toggle" type="button" aria-label="Abrir menú">${iconSvg('menu')}</button>
      <label class="mj-global-search">${iconSvg('search')}<input type="search" placeholder="Buscar residentes, casas, visitas, reportes..." aria-label="Buscar en el portal"><kbd>⌘ K</kbd></label>
      <div class="mj-appbar-space"></div>
      <span class="mj-live-status"><i></i>Operación normal</span>
      <button class="mj-bell" type="button" aria-label="Notificaciones">${iconSvg('bell')}<b>3</b></button>
      <button class="mj-user-menu" type="button"><span class="mj-avatar">${initials}</span><span><strong>${fullName}</strong><small>${role}</small></span><i>⌄</i></button>`;
    body.prepend(topbar);

    const backdrop = document.createElement('button');
    backdrop.className = 'mj-sidebar-backdrop';
    backdrop.type = 'button';
    backdrop.setAttribute('aria-label', 'Cerrar menú');
    body.appendChild(backdrop);
    const toggle = (open) => body.classList.toggle('mj-menu-open', open);
    topbar.querySelector('.mj-menu-toggle').addEventListener('click', () => toggle(!body.classList.contains('mj-menu-open')));
    backdrop.addEventListener('click', () => toggle(false));
    document.querySelector('.mj-sidebar .menu')?.addEventListener('click', (event) => {
      if (event.target.closest('a') && matchMedia('(max-width: 920px)').matches) toggle(false);
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') toggle(false); });
  };

  const setupMobileNav = () => {
    const nav = document.createElement('nav');
    nav.className = 'mj-mobile-nav';
    nav.setAttribute('aria-label', 'Navegación móvil');
    nav.innerHTML = `
      <a href="index.html" class="${page === 'index.html' ? 'active' : ''}">${iconSvg('home')}<span>Inicio</span></a>
      <a href="cuotas.html" class="${page === 'cuotas.html' ? 'active' : ''}">${iconSvg('card')}<span>Cuotas</span></a>
      <a href="reportes.html" class="${page === 'reportes.html' ? 'active' : ''}">${iconSvg('report')}<span>Reportes</span></a>
      <a href="visitas.html" class="${page === 'visitas.html' ? 'active' : ''}">${iconSvg('users')}<span>Visitas</span></a>
      <button type="button" data-more>${iconSvg('dots')}<span>Más</span></button>`;
    body.appendChild(nav);
    nav.querySelector('[data-more]').addEventListener('click', () => body.classList.add('mj-menu-open'));
  };

  const setupDashboard = () => {
    if (!body.classList.contains('page-index')) return;
    const hero = document.querySelector('.hero-dashboard');
    const dashboard = hero?.querySelector('.community-dashboard');
    if (!hero || !dashboard) return;

    const heading = document.createElement('div');
    heading.className = 'mj-dashboard-heading';
    heading.innerHTML = `
      <div><span>RESUMEN DE LA COMUNIDAD</span><h1>Buenos días, ${firstName} <em>👋</em></h1><p>Esto es lo que ocurre hoy en Misión Jardines.</p></div>
      <div class="mj-quick-actions"><a class="primary" href="visitas.html">${iconSvg('vehicle')}Registrar visita</a><a href="cuotas.html">${iconSvg('card')}Agregar pago</a><a href="reportes.html">${iconSvg('megaphone')}Crear aviso</a></div>`;
    hero.insertBefore(heading, dashboard);

    const metrics = dashboard.querySelector('.dashboard-metrics');
    if (metrics) {
      const card = document.createElement('article');
      card.className = 'dashboard-metric mj-residents-metric';
      card.innerHTML = `<div class="metric-icon mj-blue-icon">${iconSvg('users')}</div><div><small>Residentes</small><strong>235</strong><span class="metric-change">Casas registradas</span></div><span class="mj-sparkline blue"></span>`;
      metrics.appendChild(card);
      metrics.querySelectorAll('.dashboard-metric').forEach((metric, index) => {
        if (!metric.querySelector('.mj-sparkline')) {
          const spark = document.createElement('span');
          spark.className = `mj-sparkline ${['green', 'orange', 'red'][index] || 'blue'}`;
          metric.appendChild(spark);
        }
      });
    }

    const dashboardBody = dashboard.querySelector('.dashboard-body');
    if (dashboardBody) {
      const chart = document.createElement('section');
      chart.className = 'mj-revenue-card';
      chart.innerHTML = `
        <div class="mj-card-head"><div><small>RECAUDACIÓN DE CUOTAS</small><strong>$60,750.00</strong><span>↑ 12% vs. mayo</span></div><button>Este mes⌄</button></div>
        <svg class="mj-line-chart" viewBox="0 0 520 250" role="img" aria-label="Gráfica de recaudación mensual">
          <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ee7d0b" stop-opacity=".22"/><stop offset="1" stop-color="#ee7d0b" stop-opacity="0"/></linearGradient></defs>
          <g class="grid"><path d="M45 30H505M45 80H505M45 130H505M45 180H505M45 230H505"/></g>
          <path class="comparison" d="M48 200 C110 180 135 174 185 155 S270 135 320 112 S420 105 500 80"/>
          <path class="area" d="M48 185 C95 165 125 150 175 145 S250 105 305 102 S390 82 435 82 S475 62 500 45 L500 230H48Z"/>
          <path class="line" d="M48 185 C95 165 125 150 175 145 S250 105 305 102 S390 82 435 82 S475 62 500 45"/>
          <g class="points"><circle cx="48" cy="185" r="4"/><circle cx="175" cy="145" r="4"/><circle cx="305" cy="102" r="4"/><circle cx="435" cy="82" r="4"/><circle cx="500" cy="45" r="5"/></g>
          <g class="labels"><text x="45" y="248">01 May</text><text x="155" y="248">08 May</text><text x="275" y="248">15 May</text><text x="390" y="248">22 May</text><text x="470" y="248">31 May</text></g>
        </svg>
        <div class="mj-chart-legend"><span><i></i>Mayo 2025</span><span><i></i>Mayo 2026</span></div>`;
      dashboardBody.insertBefore(chart, dashboard.querySelector('.dashboard-side'));
    }

    const footer = document.createElement('div');
    footer.className = 'mj-dashboard-footer';
    footer.innerHTML = `<div class="mj-important"><span>${iconSvg('bell')}</span><div><strong>Aviso importante</strong><p>Mantenimiento programado en el acceso principal el sábado de 8:00 a 12:00 h.</p></div><a href="#avisos">Ver aviso completo</a></div><div class="mj-mini-stats"><span><i>⌂</i><small>Casas registradas</small><strong>235</strong></span><span><i>$</i><small>Pendientes de pago</small><strong>34</strong></span><span><i>▤</i><small>Monto pendiente</small><strong>$9,840</strong></span></div>`;
    dashboard.appendChild(footer);
  };

  const init = () => {
    addPremiumStyles();
    setupSidebar();
    setupTopbar();
    setupMobileNav();
    setupDashboard();
    if (!body.classList.contains('page-index')) document.querySelector('body > .hero')?.classList.add('mj-module-heading');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
