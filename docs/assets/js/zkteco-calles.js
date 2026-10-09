(() => {
  'use strict';
  function attachStreetPicker(inputId, listId, hintId, modalId) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  const modal = modalId ? document.getElementById(modalId) : null;
  const hint = document.getElementById(hintId);
  if (!input || !list || !hint || (modalId && !canAdmin)) return;
  // Outside the scrolling modal so the list above the field is never clipped.
  document.body.append(list);
  let streets = [], visible = [], loaded = false, loading = false, opened = false, active = -1, filterText = '';
  const key = value => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-MX');
  function position() {
    if (!opened) return;
    const rect = input.getBoundingClientRect();
    list.style.left = Math.max(8, rect.left) + 'px';
    list.style.width = Math.min(rect.width, window.innerWidth - 16) + 'px';
    list.style.maxHeight = Math.max(44, Math.min(220, rect.top - 16)) + 'px';
    list.style.top = Math.max(8, rect.top - list.offsetHeight - 6) + 'px';
  }
  function close() {
    opened = false;
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }
  function choose(street) {
    input.value = street;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    close();
  }
  function render(filter = '') {
    filterText = filter;
    list.replaceChildren();
    active = -1;
    input.removeAttribute('aria-activedescendant');
    visible = streets.filter(street => !filter || key(street).includes(key(filter)));
    if (!visible.length) {
      const message = document.createElement('p');
      message.className = 'zk-street-message';
      message.textContent = loading ? 'Cargando calles…' : loaded ? 'Sin coincidencias. Puedes escribir la calle.' : 'Puedes escribir la calle manualmente.';
      list.append(message);
    }
    visible.forEach((street, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.tabIndex = -1;
      option.id = listId + '-option-' + index;
      option.className = 'zk-street-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = street;
      option.addEventListener('mousedown', event => event.preventDefault());
      option.addEventListener('click', () => choose(street));
      list.append(option);
    });
    position();
  }
  async function loadStreets() {
    if (loaded || loading) return;
    loading = true;
    if (opened) render(filterText);
    try {
      const response = await api('/zkteco/calles', { headers: headers() });
      streets = (response.calles || []).map(value => String(value).trim()).filter(Boolean);
      loaded = true;
      hint.textContent = 'Escribe o selecciona una calle del padrón.';
    } catch (_) {
      hint.textContent = 'No se pudieron cargar las calles. Puedes escribirla manualmente o tocar el campo para reintentar.';
    } finally {
      loading = false;
      if (opened) render(filterText);
    }
  }
  function open(filter = '') {
    if (modal && modal.hidden) return;
    opened = true;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    render(filter);
    void loadStreets();
  }
  input.addEventListener('focus', () => open());
  input.addEventListener('click', () => open());
  input.addEventListener('input', () => open(input.value));
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape' && opened) { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Enter' && opened && active >= 0) { event.preventDefault(); choose(visible[active]); return; }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    if (!opened) open();
    if (!visible.length) return;
    active = active < 0 ? (event.key === 'ArrowDown' ? 0 : visible.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length;
    const options = list.querySelectorAll('[role="option"]');
    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === active)));
    input.setAttribute('aria-activedescendant', options[active].id);
    options[active].scrollIntoView({ block: 'nearest' });
  });
  document.addEventListener('pointerdown', event => { if (event.target !== input && !list.contains(event.target)) close(); });
  document.addEventListener('focusin', event => { if (event.target !== input && !list.contains(event.target)) close(); });
  window.addEventListener('resize', position);
  document.addEventListener('scroll', position, true);
  if (modal) {
    new MutationObserver(() => { if (modal.hidden) close(); else void loadStreets(); }).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
    if (!modal.hidden) void loadStreets();
  }
  }
  attachStreetPicker('editTagStreet', 'editTagStreetOptions', 'editTagStreetHint', 'editTagModal');
  attachStreetPicker('street', 'streetOptions', 'streetHint', null);
})();
