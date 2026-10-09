(() => {
  'use strict';
  const select = document.getElementById('editTagStreetSelect');
  const input = document.getElementById('editTagStreet');
  const modal = document.getElementById('editTagModal');
  const hint = document.getElementById('editTagStreetHint');
  if (!select || !input || !modal || !canAdmin) return;
  let loaded = false, loading = false;
  const key = value => value.trim().toLocaleLowerCase('es-MX');
  function syncSelection() {
    const option = Array.from(select.options).find(item => item.value && key(item.value) === key(input.value));
    select.value = option ? option.value : '';
  }
  select.addEventListener('change', () => {
    if (!select.value) return;
    input.value = select.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  input.addEventListener('input', syncSelection);
  async function loadStreets() {
    if (loaded || loading) return;
    loading = true;
    select.disabled = true;
    try {
      // Use calle, the value accepted by TAG reassignment, rather than a visual alias.
      const response = await api('/zkteco/calles', { headers: headers() });
      const streets = new Map();
      for (const value of response.calles || []) {
        const street = String(value || '').trim();
        if (street && !streets.has(key(street))) streets.set(key(street), street);
      }
      select.replaceChildren(new Option('— Selecciona o escribe una calle —', ''));
      const collator = new Intl.Collator('es-MX', { numeric: true, sensitivity: 'base' });
      for (const street of [...streets.values()].sort(collator.compare)) select.add(new Option(street, street));
      loaded = true;
      hint.textContent = 'Selecciona una calle o escríbela manualmente.';
      syncSelection();
    } catch (_) {
      select.replaceChildren(new Option('Calles no disponibles', ''));
      hint.textContent = 'No se pudieron cargar las calles. Puedes escribirla manualmente; al volver a abrir se intentará de nuevo.';
    } finally {
      loading = false;
      select.disabled = !loaded;
    }
  }
  new MutationObserver(() => {
    if (!modal.hidden) { syncSelection(); void loadStreets(); }
  }).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
  if (!modal.hidden) void loadStreets();
})();
