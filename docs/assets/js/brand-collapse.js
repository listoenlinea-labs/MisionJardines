(() => {
  const initSidebarCollapse = () => {
    const body = document.body;
    const sidebar = document.querySelector('body > header');
    const nav = sidebar?.querySelector('nav');
    const menu = nav?.querySelector('.menu');

    if (!body || !sidebar || !nav || !menu || body.dataset.sidebarCollapseReady === 'true') {
      return;
    }

    body.dataset.sidebarCollapseReady = 'true';
    body.classList.add('portal-shell-enabled');
    sidebar.classList.add('portal-sidebar');
    nav.classList.add('portal-sidebar-nav');

    const style = document.createElement('style');
    style.id = 'sidebarCollapseStyles';
    style.textContent = `
      :root {
        --portal-sidebar-width: 320px;
        --portal-sidebar-transition: .28s cubic-bezier(.2,.8,.2,1);
      }

      body.portal-shell-enabled {
        padding-left: var(--portal-sidebar-width);
        transition: padding-left var(--portal-sidebar-transition);
      }

      body.portal-shell-enabled.portal-sidebar-collapsed {
        padding-left: 0;
      }

      body.portal-shell-enabled > header.portal-sidebar {
        width: var(--portal-sidebar-width);
        height: 100dvh;
        position: fixed;
        inset: 0 auto 0 0;
        z-index: 100;
        overflow: visible;
        border-right: 1px solid rgba(255,255,255,.09);
        border-bottom: 0;
        background: rgba(7,17,31,.92);
        backdrop-filter: blur(18px);
        box-shadow: 14px 0 44px rgba(0,0,0,.18);
        transform: translateX(0);
        transition: transform var(--portal-sidebar-transition);
      }

      body.portal-shell-enabled.portal-sidebar-collapsed > header.portal-sidebar {
        transform: translateX(-100%);
      }

      body.portal-shell-enabled > header.portal-sidebar > nav.portal-sidebar-nav {
        width: 100%;
        height: 100%;
        max-width: none;
        margin: 0;
        padding: 22px 18px 28px;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-start;
        gap: 22px;
        overflow-y: auto;
        overflow-x: hidden;
      }

      body.portal-shell-enabled > header.portal-sidebar .brand {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 14px;
        flex: 0 0 auto;
      }

      body.portal-shell-enabled > header.portal-sidebar .logo {
        width: 104px;
        height: 64px;
        flex: 0 0 104px;
      }

      body.portal-shell-enabled > header.portal-sidebar .brand-title,
      body.portal-shell-enabled > header.portal-sidebar .brand > div:last-child > div {
        font-size: 1.35rem !important;
        line-height: 1.05;
      }

      body.portal-shell-enabled > header.portal-sidebar .brand small {
        display: block;
        margin-top: 5px;
        font-size: .82rem !important;
        white-space: normal;
        line-height: 1.25;
      }

      body.portal-shell-enabled > header.portal-sidebar .menu {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: flex-start;
        flex-wrap: nowrap;
        gap: 7px;
      }

      body.portal-shell-enabled > header.portal-sidebar .menu a {
        width: 100%;
        min-height: 42px;
        display: flex;
        align-items: center;
        padding: 10px 13px;
        border-radius: 12px;
        text-align: left;
        font-size: 13px;
      }

      body.portal-shell-enabled > header.portal-sidebar .menu a:hover,
      body.portal-shell-enabled > header.portal-sidebar .menu a.active {
        background: rgba(255,255,255,.10);
        color: #fff;
      }

      body.portal-shell-enabled > header.portal-sidebar .menu a[hidden] {
        display: none !important;
      }

      .portal-sidebar-tab {
        width: 34px;
        height: 46px;
        position: fixed;
        top: 18px;
        left: var(--portal-sidebar-width);
        z-index: 120;
        display: grid;
        place-items: center;
        padding: 0;
        border: 1px solid rgba(250,204,21,.48);
        border-left: 0;
        border-radius: 0 12px 12px 0;
        color: var(--warning, #facc15);
        background: rgba(250,204,21,.12);
        backdrop-filter: blur(18px);
        box-shadow: 7px 4px 20px rgba(0,0,0,.20), 0 0 18px rgba(250,204,21,.10);
        cursor: pointer;
        font-size: 25px;
        font-weight: 800;
        line-height: 1;
        transition:
          left var(--portal-sidebar-transition),
          background .2s ease,
          border-color .2s ease,
          color .2s ease,
          transform .2s ease;
      }

      .portal-sidebar-tab:hover {
        color: #fde68a;
        background: rgba(250,204,21,.20);
        border-color: rgba(250,204,21,.72);
        transform: translateX(1px);
      }

      .portal-sidebar-tab:focus-visible {
        outline: 3px solid rgba(250,204,21,.38);
        outline-offset: 2px;
      }

      body.portal-shell-enabled.portal-sidebar-collapsed .portal-sidebar-tab {
        left: 0;
      }

      body.portal-shell-enabled > .hero,
      body.portal-shell-enabled > .section {
        width: 100%;
        max-width: none;
        transition: width var(--portal-sidebar-transition);
      }

      body.portal-shell-enabled > footer {
        max-width: none;
      }

      @media (max-width: 900px) {
        :root {
          --portal-sidebar-width: min(300px, calc(100vw - 46px));
        }

        body.portal-shell-enabled {
          padding-left: 0;
        }

        body.portal-shell-enabled > header.portal-sidebar {
          box-shadow: 20px 0 55px rgba(0,0,0,.38);
        }

        body.portal-shell-enabled:not(.portal-sidebar-collapsed)::after {
          content: '';
          position: fixed;
          inset: 0;
          z-index: 90;
          background: rgba(2,7,15,.46);
          backdrop-filter: blur(2px);
        }

        .portal-sidebar-tab {
          top: 14px;
          height: 42px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        body.portal-shell-enabled,
        body.portal-shell-enabled > header.portal-sidebar,
        .portal-sidebar-tab {
          transition: none !important;
        }
      }
    `;

    document.head.appendChild(style);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'portal-sidebar-tab';
    button.title = 'Ocultar / mostrar menú';
    button.setAttribute('aria-controls', 'portalSidebarMenu');
    button.setAttribute('aria-expanded', 'true');
    menu.id = menu.id || 'portalSidebarMenu';

    const storageKey = 'misionJardinesSidebarCollapsed';

    const setCollapsed = (collapsed, persist = true) => {
      body.classList.toggle('portal-sidebar-collapsed', collapsed);
      button.textContent = collapsed ? '›' : '‹';
      button.setAttribute('aria-expanded', String(!collapsed));
      button.setAttribute(
        'aria-label',
        collapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'
      );

      if (persist) {
        try {
          localStorage.setItem(storageKey, collapsed ? '1' : '0');
        } catch (_) {}
      }
    };

    let initialCollapsed = false;
    let storedState = null;

    try {
      storedState = localStorage.getItem(storageKey);
    } catch (_) {}

    if (storedState === '1' || storedState === '0') {
      initialCollapsed = storedState === '1';
    } else if (window.matchMedia('(max-width: 900px)').matches) {
      initialCollapsed = true;
    }

    document.body.appendChild(button);

    button.addEventListener('click', () => {
      setCollapsed(!body.classList.contains('portal-sidebar-collapsed'));
    });

    menu.addEventListener('click', (event) => {
      if (
        window.matchMedia('(max-width: 900px)').matches &&
        event.target.closest('a')
      ) {
        setCollapsed(true);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (
        event.key === 'Escape' &&
        !body.classList.contains('portal-sidebar-collapsed') &&
        window.matchMedia('(max-width: 900px)').matches
      ) {
        setCollapsed(true);
        button.focus();
      }
    });

    setCollapsed(initialCollapsed, false);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarCollapse, { once: true });
  } else {
    initSidebarCollapse();
  }
})();
