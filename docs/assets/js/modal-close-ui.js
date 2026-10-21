/* Misión Jardines · controles de cierre unificados (2026-10-21).
 * Reutiliza el botón de cierre y su listener original, sin alterar los flujos
 * de guardado/confirmación. Soporta diálogos HTML y overlays heredados.
 */
(() => {
  'use strict';
  if (window.__mjModalCloseUIReady) return;
  window.__mjModalCloseUIReady = true;

  const panelSelector = [
    '.finance-pay-dialog', '.edit-modal-dialog', '.modal-box',
    '.modal-content', '.modal-dialog', '.modal-card', '.modal-panel',
    '.choice-modal', '.resident-dialog', '.review-dialog',
    '.pending-detail-dialog', '.mj-debt-modal', '.club-dialog',
    '.receipt-large-modal', '.history-tariff-panel',
    'dialog', '[role="dialog"][aria-modal="true"]'
  ].join(',');
  const modalSelector = [
    'dialog', '.finance-pay-overlay', '.modal-shell',
    '.edit-modal', '.modal-backdrop', '.modal-overlay',
    '.modal[role="dialog"]', '[role="dialog"][aria-modal="true"]',
    '.history-tariff-panel'
  ].join(',');
  const headerSelector = [
    '.finance-pay-heading', '.modal-head', '.modal-header',
    '.dialog-head', '.dialog-heading', '.feature-modal-header',
    '.receipt-modal-top', '.resident-dialog-head', '.pending-detail-top',
    '.mj-debt-heading', '.modal-top', '.edit-modal-header'
  ].join(',');
  const closeGlyph = /^(?:×|✕|✖|✗|x|cerrar\s*(?:×|✕|✖|✗)?)$/i;

  function isCloseButton(button) {
    const label = (button.getAttribute('aria-label') || '').trim();
    const text = button.textContent.trim();
    if (/^cerrar(?:\s|$)/i.test(label)) return true;
    return closeGlyph.test(text);
  }

  function candidatePanel(button) {
    const panel = button.closest(panelSelector);
    return panel && panel.closest(modalSelector) ? panel : null;
  }

  function applyCloseControl(panel, button) {
    if (button.dataset.mjUnifiedModalClose === '1') return;
    panel.classList.add('mj-modal-close-panel');
    const currentPosition = getComputedStyle(panel).position;
    if (currentPosition === 'static') panel.style.position = 'relative';
    button.dataset.mjUnifiedModalClose = '1';
    button.classList.add('mj-modal-close-control');
    const existing = (button.getAttribute('aria-label') || '').trim();
    if (!/^cerrar(?:\s|$)/i.test(existing)) button.setAttribute('aria-label', 'Cerrar ventana');
    button.setAttribute('title', button.getAttribute('aria-label'));
    button.textContent = '×';
    const heading = panel.querySelector(headerSelector);
    if (heading) heading.classList.add('mj-modal-close-heading');
  }

  function enhancePanel(panel) {
    // Si una sección vuelve a renderizar el contenido, decorar el nuevo botón.
    if (panel.querySelector('[data-mj-unified-modal-close="1"]')) return;
    if (!panel.closest(modalSelector)) return;
    // No procesar una superficie exterior cuando ya existe un panel interior.
    if (panel.querySelector(panelSelector)) return;
    const buttons = [...panel.querySelectorAll('button')]
      .filter(button => candidatePanel(button) === panel);
    const closeButtons = buttons.filter(isCloseButton);
    // Preferir la X del encabezado y conservar botones "Cerrar" del pie.
    const headerClose = closeButtons.find(button => button.closest(headerSelector));
    const close = headerClose || closeButtons[0];
    if (close) {
      panel.dataset.mjUnifiedModalPanel = '1';
      applyCloseControl(panel, close);
      return;
    }

    // Algunas ventanas antiguas no tienen X; conservamos "Cancelar" y
    // creamos un acceso al MISMO controlador, sin imitar el guardado.
    const cancel = buttons.find(button =>
      /^cancelar$/i.test(button.textContent.trim()) ||
      /^seguir editando$/i.test(button.textContent.trim())
    );
    const root = panel.closest('.edit-modal, .modal-shell, .modal-backdrop, .modal-overlay');
    const backdrop = root?.querySelector('.edit-modal-backdrop[onclick], .modal-backdrop[onclick]');
    if (!cancel && !backdrop) return;
    panel.dataset.mjUnifiedModalPanel = '1';
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', 'Cerrar ventana');
    button.addEventListener('click', () => (cancel || backdrop).click());
    panel.prepend(button);
    applyCloseControl(panel, button);
  }

  function scan() {
    document.querySelectorAll(panelSelector).forEach(enhancePanel);
  }

  function init() {
    scan();
    let queued = false;
    const observer = new MutationObserver(records => {
      const relevant = records.some(record => [...record.addedNodes].some(node => {
        if (node.nodeType !== 1) return false;
        return Boolean(node.matches?.(panelSelector + ', button') ||
          node.closest?.(modalSelector) ||
          node.querySelector?.(panelSelector));
      }));
      if (!relevant || queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; scan(); });
    });
    observer.observe(document.body, {childList: true, subtree: true});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once: true});
  } else init();
})();
