(() => {
  'use strict';
  const installed = new WeakSet();
  const modalSelector = '.finance-pay-overlay,.modal-overlay,.modal-backdrop,.modal-shell,.edit-modal,dialog,[role="dialog"][aria-modal="true"]';
  function modalOpen(doc) {
    return [...doc.querySelectorAll(modalSelector)].some(node => {
      if (node.tagName === 'DIALOG' && !node.open) return false;
      if (node.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
      const style = doc.defaultView.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
    });
  }

  window.MJInstallPullRefresh = ({ doc, hint, enabled, reload, revision = () => 0, scrollRoots = () => [] }) => {
    if (installed.has(doc)) return;
    installed.add(doc);
    let gesture = null;
    const cancel = () => { gesture = null; hint.hidden = true; };
    const atTop = scrollers => scrollers.every(node => (node.scrollTop || 0) <= 1);
    const available = () => window.matchMedia('(max-width: 820px)').matches && enabled();
    doc.addEventListener('touchstart', event => {
      cancel();
      const target = event.target;
      if (!available() || event.touches.length !== 1 || !target?.closest
          || target.closest('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),dialog,[role="dialog"],canvas,video,iframe,.leaflet-container,.gm-style,[data-no-pull-refresh]')) return;
      // El scroll real puede vivir en body, main o un panel, no solo en html.
      // Una tabla horizontal no impide un gesto vertical; el eje se decide al mover.
      const scrollers = [doc.scrollingElement, ...scrollRoots()].filter(Boolean);
      for (let node = target; node; node = node.parentElement) {
        if (!(node.scrollHeight > node.clientHeight + 1)) continue;
        if (/auto|scroll|overlay/.test(doc.defaultView.getComputedStyle(node).overflowY)) scrollers.push(node);
      }
      if (!atTop(scrollers)) return;
      const touch = event.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, distance: 0, revision: revision(), scrollers };
    }, { passive: true, capture: true });
    doc.addEventListener('touchmove', event => {
      if (!gesture) return;
      if (!available() || event.touches.length !== 1 || gesture.revision !== revision()
          || !atTop(gesture.scrollers) || event.defaultPrevented) { cancel(); return; }
      const touch = event.touches[0], dy = touch.clientY - gesture.y, dx = Math.abs(touch.clientX - gesture.x);
      if (dy < 0 || dx > Math.max(4, dy)) { cancel(); return; }
      gesture.distance = dy;
      if (dy === 0) return;
      if (!event.cancelable) { cancel(); return; }
      event.preventDefault();
      hint.hidden = dy < 12;
      hint.textContent = dy >= 90 ? 'Suelta para actualizar' : 'Desliza hacia abajo para actualizar';
    }, { passive: false, capture: true });
    doc.addEventListener('touchend', () => {
      const refresh = gesture && gesture.distance >= 90 && gesture.revision === revision()
        && available() && atTop(gesture.scrollers);
      cancel();
      if (refresh) reload();
    }, { passive: true, capture: true });
    doc.addEventListener('touchcancel', cancel, { passive: true, capture: true });
  };

  // El shell instala el mismo gesto sobre el documento de la sección activa.
  // En páginas HTML directas también debe existir, aunque no haya iframes.
  if (window.MJ_SHELL_MODE || window.parent !== window) return;
  const start = async () => {
    if (window.MJAccessReady && !await window.MJAccessReady) return;
    if (!document.body) return;
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'assets/css/mobile-refresh.css?v=20261021-refresco-scroll';
    document.head.appendChild(style);
    const hint = document.createElement('div');
    hint.className = 'mj-mobile-refresh';
    hint.setAttribute('role', 'status');
    hint.setAttribute('aria-live', 'polite');
    hint.hidden = true;
    document.body.appendChild(hint);
    window.MJInstallPullRefresh({ doc: document, hint,
      enabled: () => !modalOpen(document) && !document.querySelector('.mj-mobile-scrim:not([hidden])'),
      reload: () => location.reload()
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else void start();
})();
