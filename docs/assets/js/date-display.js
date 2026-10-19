/* Formato de PRESENTACIÓN de fechas para toda Misión Jardines.
 * No modifica los valores ISO de formularios, atributos de datos, API ni BD.
 */
(function (root) {
  'use strict';

  const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const MONTH_NAMES = {
    enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3,
    abril: 4, abr: 4, mayo: 5, may: 5, junio: 6, jun: 6,
    julio: 7, jul: 7, agosto: 8, ago: 8, septiembre: 9, setiembre: 9,
    sep: 9, set: 9, octubre: 10, oct: 10, noviembre: 11, nov: 11,
    diciembre: 12, dic: 12
  };
  const ZONE = 'America/Mexico_City';
  const partsFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });

  function validDay(year, month, day) {
    if (year < 1900 || year > 2099 || month < 1 || month > 12 || day < 1) return false;
    return new Date(Date.UTC(year, month, 0)).getUTCDate() >= day;
  }

  function dateParts(year, month, day) {
    const y = Number(year), m = Number(month), d = Number(day);
    return validDay(y, m, d) ? `${String(d).padStart(2, '0')}-${MONTHS[m - 1]}-${y}` : null;
  }

  function dateFromInstant(value, withTime) {
    const d = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(d.getTime())) return null;
    const parts = Object.fromEntries(partsFormatter.formatToParts(d).map(p => [p.type, p.value]));
    const date = dateParts(parts.year, parts.month, parts.day);
    return date && (withTime ? `${date}, ${parts.hour}:${parts.minute}` : date);
  }

  function format(value) {
    if (value == null || value === '') return '';
    if (value instanceof Date || typeof value === 'number') return dateFromInstant(value, false) || '';
    const s = String(value).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return dateParts(m[1], m[2], m[3]) || s;
    m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s);
    if (m) {
      const yr = Number(m[3]);
      return dateParts(m[3].length === 2 ? (yr < 70 ? 2000 + yr : 1900 + yr) : yr, m[2], m[1]) || s;
    }
    m = /^(\d{1,2})\s+(?:de\s+)?([a-záéíóúñ]+)\.?\s+(?:de\s+)?(\d{4})$/i.exec(s);
    if (m) {
      const month = MONTH_NAMES[m[2].toLowerCase()];
      return (month && dateParts(m[3], month, m[1])) || s;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /^\w{3},?\s+\d/.test(s)) {
      return dateFromInstant(s, false) || s;
    }
    return s;
  }

  function formatDateTime(value) {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return format(value);
    return dateFromInstant(value, true) || format(value);
  }

  // Cubre texto generado por plantillas dinámicas, incluidas tablas y modales.
  // No convierte identificadores ni valores de inputs (los consume la lógica).
  // El prefijo excluye folios, URLs y referencias del tipo REF-2026-10-19.
  const ISO_INSTANT = /(^|[^\w/-])(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)(?![\w/-])/g;
  const ISO_DAY = /(^|[^\w/-])(\d{4}-\d{2}-\d{2})(?![\w/-])/g;
  const LOCAL_DAY = /(^|[^\w/-])(\d{1,2}[/-]\d{1,2}[/-](?:\d{4}|\d{2}))(?![\w/-])/g;
  const WORD_DAY = /\b(\d{1,2}\s+(?:de\s+)?(?:enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|setiembre|sep|set|octubre|oct|noviembre|nov|diciembre|dic)\.?\s+(?:de\s+)?\d{4})\b/gi;

  function formatText(source) {
    return String(source)
      .replace(ISO_INSTANT, (_match, prefix, date) => prefix + formatDateTime(date))
      .replace(ISO_DAY, (_match, prefix, date) => prefix + format(date))
      .replace(LOCAL_DAY, (_match, prefix, date) => prefix + format(date))
      .replace(WORD_DAY, match => format(match));
  }

  const api = Object.freeze({ format, formatDateTime, formatText });
  root.MJDateDisplay = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document || !root.MutationObserver) return;

  const doc = root.document;
  const ignored = 'script,style,textarea,option,pre,code,svg,math,[contenteditable],.mj-date-native';
  function updateText(node) {
    if (!node || !node.parentElement || node.parentElement.closest(ignored)) return;
    const result = formatText(node.nodeValue);
    if (result !== node.nodeValue) node.nodeValue = result;
  }

  function scanText(element) {
    if (!element || element.nodeType !== 1 || element.matches(ignored)) return;
    const walker = doc.createTreeWalker(element, root.NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) updateText(node);
  }

  // El input conserva type=date y value YYYY-MM-DD. Una etiqueta superpuesta
  // ofrece el formato uniforme, pero el control nativo sigue siendo clicable.
  function decorateInput(input) {
    if (input.dataset.mjDateDecorated || input.closest('.mj-date-control')) return;
    const wrapper = doc.createElement('span');
    wrapper.className = 'mj-date-shell';
    const label = doc.createElement('span');
    label.className = 'mj-date-visible';
    label.setAttribute('aria-hidden', 'true');
    const style = root.getComputedStyle(input);
    wrapper.style.border = style.border;
    wrapper.style.borderRadius = style.borderRadius;
    wrapper.style.background = style.backgroundColor;
    wrapper.style.color = style.color;
    wrapper.style.font = style.font;
    wrapper.style.width = style.width === 'auto' ? '100%' : style.width;
    wrapper.style.minHeight = style.height === 'auto' ? '38px' : style.height;
    wrapper.style.margin = style.margin;
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    input.dataset.mjDateDecorated = 'true';
    input.classList.add('mj-date-native');
    const sync = () => {
      const displayed = format(input.value);
      label.textContent = displayed || 'Seleccionar fecha';
      label.classList.toggle('mj-date-empty', !displayed);
    };
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    input.addEventListener('focus', sync);
    wrapper.addEventListener('click', e => {
      if (e.target === input || input.disabled || input.readOnly) return;
      try { input.showPicker?.(); } catch (_) { input.focus(); }
    });
    sync();
  }

  function syncInputs() {
    doc.querySelectorAll('input[type="date"]').forEach(input => {
      if (!input.dataset.mjDateDecorated) decorateInput(input);
      else {
        const label = input.parentElement?.querySelector('.mj-date-visible');
        if (label) {
          const displayed = format(input.value);
          if (label.textContent !== (displayed || 'Seleccionar fecha')) label.textContent = displayed || 'Seleccionar fecha';
          label.classList.toggle('mj-date-empty', !displayed);
        }
      }
    });
  }

  function start() {
    const css = doc.createElement('style');
    css.textContent = `
      .mj-date-control{position:relative;display:block;box-sizing:border-box;min-width:0;min-height:40px;overflow:hidden;border:1px solid #d8e1ed;border-radius:9px;background:#fff}
      .mj-date-control>.mj-date-display{position:absolute;inset:0;display:flex;align-items:center;padding:0 32px 0 10px;white-space:nowrap;pointer-events:none;font-size:14px;font-weight:500}
      .mj-date-control>input[type="date"]{position:absolute!important;inset:0!important;box-sizing:border-box!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;opacity:0!important;cursor:pointer!important}
      .mj-date-shell{position:relative;display:inline-flex;align-items:center;box-sizing:border-box;max-width:100%;min-width:0;overflow:hidden;vertical-align:middle}
      .mj-date-visible{position:absolute;inset:0;display:flex;align-items:center;box-sizing:border-box;padding:0 28px 0 10px;overflow:hidden;white-space:nowrap;font-size:inherit;font-weight:500;pointer-events:none}
      .mj-date-visible::after{content:"";position:absolute;right:10px;top:50%;width:14px;height:14px;border:1.5px solid #73839b;border-radius:3px;transform:translateY(-50%);background:linear-gradient(#73839b,#73839b) 0 3px/100% 1.5px no-repeat}
      .mj-date-empty{opacity:.6}
      .mj-date-shell>.mj-date-native{position:relative!important;display:block!important;box-sizing:border-box!important;width:100%!important;min-width:0!important;height:100%!important;min-height:36px!important;margin:0!important;border:0!important;opacity:0!important;cursor:pointer!important;z-index:1}
      .mj-date-shell:focus-within{outline:2px solid #729be0;outline-offset:2px}
      .mj-date-shell>.mj-date-native:disabled{cursor:not-allowed}
    `;
    doc.head.appendChild(css);
    scanText(doc.body);
    syncInputs();
    let refreshing = false;
    function refresh() {
      if (refreshing) return;
      refreshing = true;
      root.requestAnimationFrame(() => { refreshing = false; syncInputs(); });
    }
    const observer = new root.MutationObserver(changes => {
      for (const change of changes) {
        if (change.type === 'characterData') updateText(change.target);
        else if (change.type === 'childList') {
          change.addedNodes.forEach(node => {
            if (node.nodeType === 3) updateText(node);
            else if (node.nodeType === 1) scanText(node);
          });
          refresh();
        } else if (change.type === 'attributes') refresh();
      }
    });
    observer.observe(doc.body, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ['value', 'hidden', 'class', 'open', 'style'] });
    doc.addEventListener('focusin', refresh);
    doc.addEventListener('input', refresh);
    doc.addEventListener('change', refresh);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
