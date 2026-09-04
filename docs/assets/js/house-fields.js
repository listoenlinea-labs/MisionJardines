(function () {
  'use strict';

  const STREETS = [
    'Misión Jardines',
    'Misión Gardenias',
    'Misión Magnolias',
    'Misión Rosas',
    'Misión de los Lirios',
    'Av. Valle de México',
    'Avenida Guadalajara',
    'Atotonilco'
  ];

  const PREFIXES = {
    MJ: 'Misión Jardines',
    MG: 'Misión Gardenias',
    MM: 'Misión Magnolias',
    MR: 'Misión Rosas',
    ML: 'Misión de los Lirios'
  };

  const normalize = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  function injectStyles() {
    if (document.getElementById('mj-house-fields-styles')) return;
    const style = document.createElement('style');
    style.id = 'mj-house-fields-styles';
    style.textContent = `
      .page-bases-datos .database-toolbar { grid-template-columns: minmax(190px,1.25fr) minmax(155px,.8fr) minmax(115px,.55fr) auto; }
      .page-reportes .filters, .page-visitas .filters { grid-template-columns: repeat(5,minmax(120px,1fr)) auto; }
      #userHouseBox { gap: 10px; }
      @media (max-width: 980px) {
        .page-bases-datos .database-toolbar,
        .page-reportes .filters,
        .page-visitas .filters { grid-template-columns: repeat(2,minmax(0,1fr)); }
      }
      @media (max-width: 620px) {
        .page-bases-datos .database-toolbar,
        .page-reportes .filters,
        .page-visitas .filters { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function field(label, control) {
    const wrapper = document.createElement('div');
    const caption = document.createElement('label');
    caption.htmlFor = control.id;
    caption.textContent = label;
    wrapper.append(caption, control);
    return wrapper;
  }

  function streetSelect(id, allLabel = 'Selecciona una calle') {
    const select = document.createElement('select');
    select.id = id;
    select.innerHTML = `<option value="">${allLabel}</option>` +
      STREETS.map((street) => `<option value="${street}">${street}</option>`).join('');
    return select;
  }

  function numberInput(id) {
    const input = document.createElement('input');
    input.id = id;
    input.inputMode = 'numeric';
    input.placeholder = 'Ej. 101';
    input.autocomplete = 'off';
    return input;
  }

  function splitAddress(value) {
    const text = String(value || '').trim();
    if (text.includes('·')) {
      const [street, ...rest] = text.split('·');
      return { street: street.trim(), number: rest.join('·').trim() };
    }
    const match = text.match(/^([A-Z]{2})[-\s]?(.*)$/i);
    if (match && PREFIXES[match[1].toUpperCase()]) {
      return { street: PREFIXES[match[1].toUpperCase()], number: match[2] };
    }
    return { street: '', number: text };
  }

  function combine(street, number) {
    return street && number ? `${street} · ${number}` : number;
  }

  function observeRows(tbody, callback) {
    if (!tbody) return;
    new MutationObserver(callback).observe(tbody, { childList: true });
  }

  function enhanceDatabaseToolbar(config) {
    const search = document.getElementById(config.search);
    const street = document.getElementById(config.street);
    const table = document.getElementById(config.table);
    if (!search || !street || !table || document.getElementById(config.number)) return;

    search.placeholder = config.placeholder;
    search.previousElementSibling.textContent = config.label;
    search.removeAttribute('oninput');
    street.removeAttribute('onchange');
    const number = numberInput(config.number);
    street.parentElement.after(field('Número de casa', number));

    const status = config.status ? document.getElementById(config.status) : null;
    if (status) status.removeAttribute('onchange');

    const apply = () => {
      const query = normalize(search.value);
      const selectedStreet = normalize(street.value);
      const selectedNumber = normalize(number.value);
      const selectedStatus = normalize(status?.value);
      table.querySelectorAll('tbody tr').forEach((row) => {
        const searchable = Array.from(row.cells).slice(3).map((cell) => normalize(cell.textContent)).join(' ');
        const matches = (!query || searchable.includes(query)) &&
          (!selectedStreet || normalize(row.cells[1]?.textContent) === selectedStreet) &&
          (!selectedNumber || normalize(row.cells[2]?.textContent).includes(selectedNumber)) &&
          (!selectedStatus || normalize(row.textContent).includes(selectedStatus));
        row.hidden = !matches;
      });
    };
    [search, number].forEach((control) => control.addEventListener('input', apply));
    [street, status].filter(Boolean).forEach((control) => control.addEventListener('change', apply));
  }

  function enhanceDatabases() {
    [
      { search: 'searchAddresses', street: 'addressStreet', number: 'addressNumber', table: 'addressesTable', label: 'Buscar propietario o contacto', placeholder: 'Nombre, teléfono o correo' },
      { search: 'searchVehicles', street: 'vehicleStreet', number: 'vehicleNumber', table: 'vehiclesTable', label: 'Buscar propietario, placas o contacto', placeholder: 'Nombre, placas, teléfono o correo' }
    ].forEach(enhanceDatabaseToolbar);

    const clubSearch = document.getElementById('searchClubhouse');
    const clubTable = document.getElementById('clubhouseTable');
    if (clubSearch && clubTable && !document.getElementById('clubhouseStreet')) {
      const street = streetSelect('clubhouseStreet', 'Todas las calles');
      const number = numberInput('clubhouseNumber');
      const status = document.getElementById('clubhouseStatus');
      clubSearch.previousElementSibling.textContent = 'Buscar propietario, fecha o contacto';
      clubSearch.placeholder = 'Nombre, fecha, teléfono o correo';
      clubSearch.removeAttribute('oninput');
      status?.removeAttribute('onchange');
      clubSearch.parentElement.after(field('Calle', street), field('Número de casa', number));
      const apply = () => {
        const query = normalize(clubSearch.value), selectedStreet = normalize(street.value);
        const selectedNumber = normalize(number.value), selectedStatus = normalize(status?.value);
        clubTable.querySelectorAll('tbody tr').forEach((row) => {
          const searchable = Array.from(row.cells).slice(3).map((cell) => normalize(cell.textContent)).join(' ');
          row.hidden = !((!query || searchable.includes(query)) && (!selectedStreet || normalize(row.cells[1]?.textContent) === selectedStreet) && (!selectedNumber || normalize(row.cells[2]?.textContent).includes(selectedNumber)) && (!selectedStatus || normalize(row.textContent).includes(selectedStatus)));
        });
      };
      [clubSearch, number].forEach((el) => el.addEventListener('input', apply));
      [street, status].filter(Boolean).forEach((el) => el.addEventListener('change', apply));
    }
  }

  function enhanceReportForm() {
    const original = document.getElementById('reportHouse');
    if (!original || document.getElementById('reportStreetSplit')) return;
    const street = streetSelect('reportStreetSplit');
    const number = numberInput('reportNumberSplit');
    const wrapper = original.parentElement;
    original.type = 'hidden';
    wrapper.querySelector('label')?.remove();
    wrapper.before(field('Calle', street));
    wrapper.prepend(document.createElement('label'));
    wrapper.querySelector('label').textContent = 'Número de casa';
    wrapper.appendChild(number);
    const sync = () => { original.value = combine(street.value, number.value.trim()); };
    document.querySelectorAll('[onclick*="addReport"]').forEach((button) => button.addEventListener('click', sync, true));
  }

  function enhanceReportFilters() {
    const text = document.getElementById('filterText');
    const tbody = document.getElementById('reportsTable');
    if (!text || !tbody || document.getElementById('reportFilterStreet')) return;
    text.previousElementSibling.textContent = 'Buscar reporte, ubicación o persona';
    text.placeholder = 'Ej. fuga, luminaria, Laura';
    const street = streetSelect('reportFilterStreet', 'Todas las calles');
    const number = numberInput('reportFilterNumber');
    text.parentElement.after(field('Calle', street), field('Número de casa', number));
    const apply = () => tbody.querySelectorAll('tr').forEach((row) => {
      const address = splitAddress(row.cells[3]?.textContent);
      const matches = (!street.value || normalize(address.street) === normalize(street.value)) && (!number.value || normalize(address.number).includes(normalize(number.value)));
      row.hidden = row.hidden || !matches;
    });
    [street, number].forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { if (typeof window.renderReports === 'function') window.renderReports(); apply(); }));
    observeRows(tbody, apply);
  }

  function enhanceVisitForm() {
    const original = document.getElementById('visitorHouse');
    if (!original || document.getElementById('visitorStreetSplit')) return;
    const street = streetSelect('visitorStreetSplit');
    const number = numberInput('visitorNumberSplit');
    const wrapper = original.parentElement;
    original.type = 'hidden'; wrapper.querySelector('label')?.remove();
    wrapper.before(field('Calle destino', street));
    wrapper.prepend(document.createElement('label')); wrapper.querySelector('label').textContent = 'Número de casa'; wrapper.appendChild(number);
    const sync = () => { original.value = combine(street.value, number.value.trim()); };
    document.querySelectorAll('[onclick*="addVisit"]').forEach((button) => button.addEventListener('click', sync, true));
  }

  function enhanceResidentHouse() {
    const box = document.getElementById('userHouseBox');
    const original = document.getElementById('currentUserHouse');
    if (!box || !original || document.getElementById('currentUserStreetSplit')) return;
    const initial = splitAddress(original.value);
    const street = streetSelect('currentUserStreetSplit');
    const number = numberInput('currentUserNumberSplit');
    street.value = initial.street;
    number.value = initial.number;
    original.type = 'hidden';
    original.previousElementSibling?.remove();
    box.prepend(field('Mi calle', street), field('Mi número', number));
    const sync = () => {
      const prefix = Object.entries(PREFIXES).find(([, value]) => value === street.value)?.[0];
      original.value = prefix && number.value.trim()
        ? `${prefix}-${number.value.trim().padStart(3, '0')}`
        : combine(street.value, number.value.trim());
      if (typeof window.applyRole === 'function') window.applyRole();
    };
    street.addEventListener('change', sync);
    number.addEventListener('input', sync);
    sync();
  }

  function enhanceResidentVisitModal() {
    const original = document.getElementById('modalVisitorHouse');
    if (!original || document.getElementById('modalVisitorStreetSplit')) return;
    const street = document.createElement('input');
    street.id = 'modalVisitorStreetSplit';
    street.readOnly = true;
    const number = document.createElement('input');
    number.id = 'modalVisitorNumberSplit';
    number.readOnly = true;
    const wrapper = original.parentElement;
    original.type = 'hidden';
    wrapper.querySelector('label')?.remove();
    wrapper.before(field('Calle destino', street));
    wrapper.prepend(document.createElement('label'));
    wrapper.querySelector('label').textContent = 'Número de casa';
    wrapper.appendChild(number);
    document.querySelectorAll('[onclick*="openVisitModal"]').forEach((button) => button.addEventListener('click', () => {
      const value = combine(document.getElementById('currentUserStreetSplit')?.value, document.getElementById('currentUserNumberSplit')?.value);
      original.value = value;
      const address = splitAddress(value);
      street.value = address.street;
      number.value = address.number;
    }, true));
  }

  function enhanceVisitFilters() {
    const text = document.getElementById('filterText');
    const tbody = document.getElementById('visitsTable');
    if (!text || !tbody || document.getElementById('visitFilterStreet')) return;
    text.previousElementSibling.textContent = 'Buscar visitante, código o placas';
    text.placeholder = 'Ej. Juan, MJ-VIS, JLS';
    const street = streetSelect('visitFilterStreet', 'Todas las calles');
    const number = numberInput('visitFilterNumber');
    text.parentElement.after(field('Calle', street), field('Número de casa', number));
    const apply = () => tbody.querySelectorAll('tr').forEach((row) => {
      const address = splitAddress(row.cells[4]?.textContent);
      row.hidden = row.hidden || !((!street.value || normalize(address.street) === normalize(street.value)) && (!number.value || normalize(address.number).includes(normalize(number.value))));
    });
    [street, number].forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { if (typeof window.renderVisits === 'function') window.renderVisits(); apply(); }));
    observeRows(tbody, apply);
  }

  function init() {
    injectStyles();
    const page = location.pathname.split('/').pop();
    if (page === 'bases_datos.html') enhanceDatabases();
    if (page === 'reportes.html') { enhanceReportForm(); enhanceReportFilters(); }
    if (page === 'visitas.html') {
      enhanceResidentHouse();
      enhanceVisitForm();
      enhanceResidentVisitModal();
      enhanceVisitFilters();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
