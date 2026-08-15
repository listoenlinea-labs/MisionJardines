(() => {
  const init = () => {
    const nav = document.querySelector('header nav');
    const menu = nav?.querySelector('.menu');
    if (!nav || !menu || menu.dataset.drawerReady === 'true') return;

    menu.dataset.drawerReady = 'true';
    nav.classList.add('drawer-nav');
    menu.classList.add('nav-drawer');
    menu.id ||= 'mainNavigationDrawer';

    const style = document.createElement('style');
    style.id = 'navigationDrawerStyles';
    style.textContent = `
      .drawer-nav{justify-content:flex-start!important;position:relative}
      .nav-drawer-toggle{width:48px;height:48px;flex:0 0 48px;display:inline-grid;place-items:center;position:relative;z-index:1201;padding:0;border:1px solid rgba(255,255,255,.14);border-radius:14px;color:var(--text,#f4f7fb);background:rgba(255,255,255,.08);box-shadow:0 10px 28px rgba(0,0,0,.18);cursor:pointer;transition:.2s}
      .nav-drawer-toggle:hover{transform:translateY(-1px);background:rgba(255,255,255,.14);border-color:rgba(94,234,212,.35)}
      .nav-drawer-toggle:focus-visible{outline:3px solid rgba(94,234,212,.35);outline-offset:3px}
      .nav-drawer-toggle-icon,.nav-drawer-toggle-icon:before,.nav-drawer-toggle-icon:after{width:22px;height:2px;display:block;border-radius:999px;background:currentColor;transition:transform .22s ease,opacity .22s ease}
      .nav-drawer-toggle-icon{position:relative}
      .nav-drawer-toggle-icon:before,.nav-drawer-toggle-icon:after{content:'';position:absolute;left:0}
      .nav-drawer-toggle-icon:before{top:-7px}.nav-drawer-toggle-icon:after{top:7px}
      .nav-drawer-toggle.is-open{position:fixed;top:20px;left:20px}
      .nav-drawer-toggle.is-open .nav-drawer-toggle-icon{background:transparent}
      .nav-drawer-toggle.is-open .nav-drawer-toggle-icon:before{top:0;transform:rotate(45deg)}
      .nav-drawer-toggle.is-open .nav-drawer-toggle-icon:after{top:0;transform:rotate(-45deg)}
      .nav-drawer{width:min(340px,86vw)!important;height:100dvh;display:flex!important;flex-direction:column;flex-wrap:nowrap!important;justify-content:flex-start!important;align-items:stretch;gap:8px!important;position:fixed;top:0;left:0;z-index:1100;margin:0!important;padding:88px 18px 24px!important;overflow-y:auto;overscroll-behavior:contain;background:radial-gradient(circle at 15% 8%,rgba(94,234,212,.13),transparent 28%),linear-gradient(180deg,rgba(7,17,31,.995),rgba(10,23,40,.995));border-right:1px solid rgba(255,255,255,.12);box-shadow:26px 0 70px rgba(0,0,0,.42);backdrop-filter:blur(22px);transform:translateX(-105%);visibility:hidden;pointer-events:none;transition:transform .28s cubic-bezier(.2,.8,.2,1),visibility .28s ease}
      .nav-drawer.is-open{transform:translateX(0);visibility:visible;pointer-events:auto}
      .nav-drawer-heading{padding:4px 10px 14px;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,.09)}
      .nav-drawer-heading small{display:block;margin-bottom:4px;color:var(--accent,#5eead4);font-size:10px;font-weight:900;letter-spacing:.8px;text-transform:uppercase}
      .nav-drawer-heading strong{color:var(--text,#f4f7fb);font-size:18px}
      .nav-drawer a{width:100%;display:flex!important;align-items:center;min-height:46px;padding:11px 13px!important;border:1px solid transparent;border-radius:13px!important;color:var(--muted,#aebbd0)!important;background:transparent;text-align:left;font-size:14px!important;font-weight:700;transition:.18s}
      .nav-drawer a:hover{transform:translateX(3px);color:#fff!important;background:rgba(255,255,255,.08)!important;border-color:rgba(255,255,255,.08)}
      .nav-drawer a.active{color:#fff!important;background:linear-gradient(90deg,rgba(94,234,212,.16),rgba(96,165,250,.12))!important;border-color:rgba(94,234,212,.24);box-shadow:inset 3px 0 0 var(--accent,#5eead4)}
      .nav-drawer a[hidden]{display:none!important}
      .nav-drawer-backdrop{position:fixed;inset:0;z-index:1050;border:0;padding:0;background:rgba(2,7,15,.58);backdrop-filter:blur(3px);opacity:0;visibility:hidden;pointer-events:none;cursor:default;transition:opacity .24s ease,visibility .24s ease}
      .nav-drawer-backdrop.is-open{opacity:1;visibility:visible;pointer-events:auto}
      body.nav-drawer-open{overflow:hidden}
      @media(max-width:700px){.drawer-nav{padding-left:14px!important;padding-right:14px!important;gap:12px!important}.nav-drawer-toggle{width:44px;height:44px;flex-basis:44px;border-radius:12px}.nav-drawer-toggle.is-open{top:14px;left:14px}.nav-drawer{width:min(320px,90vw)!important;padding-top:76px!important}}
    `;
    document.head.appendChild(style);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'nav-drawer-toggle';
    toggle.setAttribute('aria-controls', menu.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menú de navegación');
    toggle.title = 'Menú';
    toggle.innerHTML = '<span class="nav-drawer-toggle-icon" aria-hidden="true"></span>';

    const brand = nav.querySelector('.brand');
    nav.insertBefore(toggle, brand || menu);

    const heading = document.createElement('div');
    heading.className = 'nav-drawer-heading';
    heading.innerHTML = '<small>Navegación</small><strong>Misión Jardines</strong>';
    menu.prepend(heading);

    const backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'nav-drawer-backdrop';
    backdrop.setAttribute('aria-label', 'Cerrar menú');
    document.body.appendChild(backdrop);

    const setOpen = (open) => {
      menu.classList.toggle('is-open', open);
      backdrop.classList.toggle('is-open', open);
      toggle.classList.toggle('is-open', open);
      document.body.classList.toggle('nav-drawer-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
    };

    toggle.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
    backdrop.addEventListener('click', () => setOpen(false));
    menu.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
  };

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init, { once: true })
    : init();
})();
