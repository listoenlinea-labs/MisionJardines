(() => {
  if (document.getElementById('mjGlobalSearchDialog')) return;
  const api = window.MJ_API_URL || 'https://api-misionjardines.listoenlinea.host/api';
  const token = () => localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const allowedLinks = () => [...document.querySelectorAll('.mj-side-link:not([hidden])')].map(link => ({ name: link.textContent.trim(), href: link.getAttribute('href') }));
  const style = document.createElement('style');
  style.textContent = `
    body.mj-home.mj-shared-sidebar-enabled .topbar{padding-left:27px}body.mj-home.mj-shared-sidebar-enabled #searchForm{width:clamp(310px,34vw,600px);margin-left:0;background:#fff;border-color:#dce4ec;box-shadow:0 7px 22px rgba(23,32,51,.06);cursor:text}
    #searchForm:focus-within{border-color:#f4a75e;box-shadow:0 0 0 3px rgba(249,115,22,.12)}
    .mj-search-launch{position:fixed;z-index:91;top:14px;left:calc(var(--mj-side-width) + 61px);height:46px;width:clamp(240px,30vw,470px);padding:0 17px;border:1px solid #dce4ec;border-radius:12px;background:#fff;box-shadow:0 8px 28px rgba(23,32,51,.075);color:#68778e;font:500 13px Inter,system-ui,sans-serif;text-align:left;cursor:pointer}
    body.mj-shared-sidebar-collapsed .mj-search-launch{left:61px}.mj-search-launch:hover{border-color:#efa667;color:#172033}
    .mj-search-backdrop{position:fixed;inset:0;z-index:300;background:rgba(12,24,40,.4);display:grid;place-items:start center;padding:11vh 14px 24px;backdrop-filter:blur(3px)}
    .mj-search-panel{width:min(680px,100%);max-height:75vh;display:flex;flex-direction:column;overflow:hidden;border:1px solid #e3e8ee;border-radius:19px;background:#fff;box-shadow:0 28px 80px rgba(18,31,50,.25);font:14px Inter,system-ui,sans-serif;color:#172033}
    .mj-search-head{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #e9edf2}.mj-search-head input{flex:1;min-width:0;padding:8px 0;border:0;outline:0;color:#172033;background:#fff;font-size:16px}.mj-search-head button{padding:6px 9px;border:1px solid #e3e8ee;border-radius:8px;background:#fff;color:#68778e;cursor:pointer}
    .mj-search-results{min-height:110px;overflow:auto;padding:13px 15px 20px}.mj-search-section{margin:9px 0 5px;padding:0 10px;color:#9b5c20;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.mj-search-result{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border-radius:10px;color:#172033;text-decoration:none}.mj-search-result:hover,.mj-search-result:focus,.mj-search-result.mj-active{outline:0;background:#fff3e7}.mj-search-result strong,.mj-search-result small{display:block}.mj-search-result strong{font-size:13px}.mj-search-result small{margin-top:4px;color:#748199;font-size:11px}.mj-search-result>span:last-child{color:#c87121}.mj-search-empty{padding:20px 12px;color:#748199;line-height:1.5}.mj-search-foot{border-top:1px solid #e9edf2;padding:11px 22px;color:#8a95a5;font-size:11px}
    @media(max-width:1100px){body.mj-home.mj-shared-sidebar-enabled .operation-status{display:none}body.mj-home.mj-shared-sidebar-enabled #searchForm{width:min(36vw,450px)}}
    @media(max-width:820px){.mj-search-launch,body.mj-shared-sidebar-collapsed .mj-search-launch{left:58px;top:13px;width:min(43vw,310px);height:43px}.mj-search-backdrop{padding-top:5vh}body.mj-home.mj-shared-sidebar-enabled #searchForm{width:min(45vw,350px);margin-left:34px}}
  `;
  document.head.appendChild(style);
  const backdrop = document.createElement('div');
  backdrop.id = 'mjGlobalSearchDialog';
  backdrop.className = 'mj-search-backdrop';
  backdrop.hidden = true;
  backdrop.innerHTML = `<section class="mj-search-panel" role="dialog" aria-modal="true" aria-label="Búsqueda global"><div class="mj-search-head"><span aria-hidden="true">⌕</span><input type="search" aria-label="Buscar en Misión Jardines" placeholder="Busca una página, residente, domicilio, cuota o visita…" autocomplete="off"><button type="button" aria-label="Cerrar búsqueda">Esc</button></div><div class="mj-search-results" role="listbox"></div><div class="mj-search-foot">Escribe para buscar · ↑ ↓ para elegir · Enter para abrir</div></section>`;
  document.body.appendChild(backdrop);
  const input = backdrop.querySelector('input');
  const results = backdrop.querySelector('.mj-search-results');
  const headerInput = document.getElementById('globalSearch');
  if (!headerInput) {
    const launcher = document.createElement('button');
    launcher.type = 'button'; launcher.className = 'mj-search-launch';
    launcher.textContent = '⌕  Buscar en Misión Jardines…    ⌘ K';
    launcher.addEventListener('click', () => open());
    document.body.appendChild(launcher);
  }
  let timeout, controller, serial = 0, selected = 0, previous = null;
  const rows = () => [...results.querySelectorAll('.mj-search-result')];
  const choose = index => { const links = rows(); if (!links.length) return; selected = (index + links.length) % links.length; links.forEach((x, n) => x.classList.toggle('mj-active', n === selected)); links[selected].scrollIntoView({ block: 'nearest' }); };
  const entry = (href, name, detail) => `<a class="mj-search-result" href="${escape(href)}" role="option"><span><strong>${escape(name)}</strong><small>${escape(detail)}</small></span><span aria-hidden="true">↗</span></a>`;
  const section = (label, entries) => entries.length ? `<div class="mj-search-section">${escape(label)}</div>${entries.join('')}` : '';
  const address = row => `${row.calle || row.casa?.calle || ''} ${row.numero || row.casa?.numero || ''}`.trim();
  function render(q, data) {
    const links = allowedLinks().filter(link => !q || norm(link.name).includes(norm(q)) || (norm(q).includes('cita') && link.name === 'Visitas') || (norm(q).includes('domicilio') && link.name === 'Conmutador'));
    const nav = links.map(link => entry(link.href, link.name, 'Ir a la sección'));
    const houses = (data.casas || []).map(x => entry(`conmutador.html?calle=${encodeURIComponent(x.calle)}&numero=${encodeURIComponent(x.numero)}`, `Casa ${address(x)}`, 'Abrir domicilio en el conmutador'));
    const residents = (data.residentes || []).map(x => entry(`bases_datos.html?buscar=${encodeURIComponent(x.nombreCompleto)}`, x.nombreCompleto, `Residente · ${address(x)}`));
    const fees = (data.cuotas || []).map(x => entry(`cuotas.html?calle=${encodeURIComponent(x.casa?.calle || '')}&numero=${encodeURIComponent(x.casa?.numero || '')}`, `Cuota ${x.mes} ${x.anio}`, `${address(x)} · ${x.estatusPago}`));
    const visits = (data.visitas || []).map(x => entry(`visitas.html?buscar=${encodeURIComponent(x.codigo)}`, x.nombreVisitante, `Visita ${x.codigo} · ${address(x)}`));
    results.innerHTML = section('Páginas', nav) + section('Domicilios', houses) + section('Residentes', residents) + section('Cuotas', fees) + section('Visitas', visits) || `<p class="mj-search-empty">No hay resultados para «${escape(q)}». Prueba con un nombre, calle, número o folio.</p>`;
    selected = 0; rows()[0]?.classList.add('mj-active');
  }
  async function search() {
    const q = input.value.trim();
    const request = ++serial;
    controller?.abort();
    render(q, {});
    if (q.length < 2) return;
    results.insertAdjacentHTML('beforeend', '<p class="mj-search-empty" id="mjSearching">Buscando registros…</p>');
    controller = new AbortController();
    try {
      const response = await fetch(`${api}/busqueda?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token()}` }, signal: controller.signal });
      const data = await response.json();
      if (request !== serial || backdrop.hidden) return;
      if (response.status === 401) { location.replace('login.html'); return; }
      if (!response.ok || data.ok === false) throw Error(data.message || 'Error de conexión');
      render(q, data);
    } catch (error) {
      if (error.name !== 'AbortError' && request === serial) { render(q, {}); results.insertAdjacentHTML('beforeend', `<p class="mj-search-empty">${escape(error.message)}. Puedes abrir una sección desde la lista.</p>`); }
    }
  }
  function open(value = '') { previous = document.activeElement; backdrop.hidden = false; input.value = value; render(value, {}); input.focus(); if (value.trim().length >= 2) search(); }
  function close() { backdrop.hidden = true; ++serial; controller?.abort(); clearTimeout(timeout); previous?.focus?.(); }
  input.addEventListener('input', () => { clearTimeout(timeout); render(input.value.trim(), {}); timeout = setTimeout(search, 250); });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); choose(selected + (event.key === 'ArrowDown' ? 1 : -1)); }
    if (event.key === 'Enter') { event.preventDefault(); rows()[selected]?.click(); }
  });
  backdrop.querySelector('button').addEventListener('click', close);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (backdrop.hidden) open(); else input.focus(); }
    if (event.key === 'Escape' && !backdrop.hidden) { event.stopPropagation(); close(); }
  });
  document.getElementById('searchForm')?.addEventListener('submit', event => { event.preventDefault(); open(headerInput?.value || ''); });
  headerInput?.addEventListener('focus', () => open(headerInput.value));
})();
