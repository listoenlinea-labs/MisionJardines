(() => {
  const API_URL = window.MJ_API_URL || 'https://api-misionjardines.listoenlinea.host/api';
  const token = window.MJ_TOKEN || localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
  const GOOGLE_SHARE_URL = 'https://share.google/XOJvMvlvdeocnd6mQ';
  const GOOGLE_EMBED_URL = 'https://www.google.com/maps?q=Misi%C3%B3n+Jardines+Fraccionamiento,+C.+Atotonilco+700,+45138+Zapopan,+Jalisco,+M%C3%A9xico&output=embed';
  let homeNewsLoaded = false;

  const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
  const integer = new Intl.NumberFormat('es-MX');
  const shortDate = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' });
  const dateTime = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function cachedUser() {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const raw = storage.getItem('misionJardinesUsuario');
        if (raw) return JSON.parse(raw);
      } catch (_) {}
    }
    return {};
  }

  function currentRole() {
    const user = cachedUser();
    return user?.rol?.nombre || user?.rol || '';
  }

  function clearSession() {
    ['misionJardinesToken', 'misionJardinesUsuario'].forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  }

  function sourceBadge(name, ok) {
    return `<span class="hl-source ${ok ? 'ok' : 'off'}">${ok ? '●' : '○'} ${escapeHtml(name)}</span>`;
  }

  function deltaLabel(value, suffix = '%') {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) {
      return '<span class="hl-delta neutral">Sin base comparativa</span>';
    }
    const number = Number(value);
    const sign = number > 0 ? '+' : '';
    const cls = number > 0 ? 'up' : number < 0 ? 'down' : 'neutral';
    return `<span class="hl-delta ${cls}">${sign}${number.toLocaleString('es-MX')} ${suffix}</span>`;
  }

  function formatWhen(value) {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : dateTime.format(date);
  }

  function chartSvg(series) {
    const clean = Array.isArray(series) ? series.map(item => ({
      label: item.etiqueta || '',
      value: Number(item.total) || 0
    })) : [];

    if (!clean.length || clean.every(item => item.value === 0)) {
      return '<div class="hl-chart-empty"><strong>Sin recaudación registrada</strong><span>La gráfica aparecerá en cuanto existan pagos en la tabla de cuotas.</span></div>';
    }

    const width = 680;
    const height = 250;
    const left = 66;
    const right = 20;
    const top = 20;
    const bottom = 46;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxValue = Math.max(...clean.map(item => item.value));
    const ceiling = maxValue <= 0 ? 1 : maxValue * 1.12;
    const step = clean.length > 1 ? plotWidth / (clean.length - 1) : plotWidth;
    const points = clean.map((item, index) => {
      const x = left + (index * step);
      const y = top + plotHeight - ((item.value / ceiling) * plotHeight);
      return { ...item, x, y };
    });
    const line = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const area = `${left},${top + plotHeight} ${line} ${left + plotWidth},${top + plotHeight}`;
    const ticks = [0, ceiling / 2, ceiling];

    return `<svg class="hl-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Recaudación real de los últimos seis meses">
      <defs><linearGradient id="hlArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f97316" stop-opacity=".20"/><stop offset="1" stop-color="#f97316" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map((tick, index) => {
        const y = top + plotHeight - ((tick / ceiling) * plotHeight);
        return `<line x1="${left}" y1="${y}" x2="${left + plotWidth}" y2="${y}" stroke="#e8ebef" stroke-width="1"/><text x="${left - 10}" y="${y + 4}" text-anchor="end" fill="#7d8798" font-size="10">${escapeHtml(compactMoney(tick))}</text>`;
      }).join('')}
      <polygon points="${area}" fill="url(#hlArea)"/>
      <polyline points="${line}" fill="none" stroke="#f97316" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.map(point => `<circle cx="${point.x}" cy="${point.y}" r="4" fill="#fff" stroke="#f97316" stroke-width="3"><title>${escapeHtml(point.label)}: ${escapeHtml(money.format(point.value))}</title></circle>`).join('')}
      ${points.map(point => `<text x="${point.x}" y="${height - 15}" text-anchor="middle" fill="#7d8798" font-size="10">${escapeHtml(point.label)}</text>`).join('')}
    </svg>`;
  }

  function compactMoney(value) {
    const number = Number(value) || 0;
    if (Math.abs(number) >= 1000000) return `$${(number / 1000000).toFixed(1)}M`;
    if (Math.abs(number) >= 1000) return `$${Math.round(number / 1000)}k`;
    return `$${Math.round(number)}`;
  }

  function roleActions() {
    const role = currentRole();
    const actions = [
      { href: 'visitas.html', label: 'Registrar visita', icon: '＋', roles: ['SUPER_ADMIN','ADMINISTRADOR','SEGURIDAD','CONDOMINO'] },
      { href: 'cuotas.html', label: 'Ver cuotas', icon: '$', roles: ['SUPER_ADMIN','ADMINISTRADOR','MESA_DIRECTIVA','CONDOMINO'] },
      { href: 'reportes.html', label: 'Nuevo reporte', icon: '!', roles: ['SUPER_ADMIN','ADMINISTRADOR','MANTENIMIENTO','SEGURIDAD','CONDOMINO'] }
    ];
    return actions.filter(action => !role || action.roles.includes(role)).slice(0, 2);
  }

  function eventTypeLabel(type) {
    const labels = {
      mantenimiento: 'Mantenimiento',
      asamblea: 'Asamblea',
      basura: 'Recolección',
      seguridad: 'Seguridad',
      evento: 'Evento'
    };
    return labels[type] || type || 'Evento';
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
    } catch (_) {
      return '#';
    }
  }

  async function environmentApi(path) {
    const response = await fetch(API_URL + path, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });

    const payload = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
      clearSession();
      location.replace('login.html');
      throw new Error('Sesión no disponible');
    }

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message || 'No fue posible consultar el entorno.');
    }

    return payload;
  }

  function incidentIcon(category) {
    return ({
      1: '!',
      6: '↔',
      7: '!',
      8: '×',
      9: '⚒',
      11: '≈',
      14: '⚙'
    })[Number(category)] || '!';
  }

  function loadGoogleMapsScript(apiKey) {
    if (window.google?.maps) return Promise.resolve();
    if (window.__mjGoogleMapsPromise) return window.__mjGoogleMapsPromise;

    window.__mjGoogleMapsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(apiKey) + '&v=weekly';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('No fue posible cargar Google Maps.'));
      document.head.appendChild(script);
    });

    return window.__mjGoogleMapsPromise;
  }

  async function renderTrafficMap(config) {
    const mapElement = document.getElementById('hlLiveTrafficMap');
    const status = document.getElementById('hlTrafficStatus');
    if (!mapElement || !status) return;

    const key = config?.googleMapsKey || '';
    const address = config?.address || 'Misión Jardines Fraccionamiento, Zapopan, Jalisco';

    if (!key) {
      mapElement.innerHTML = `<iframe title="Ubicación real de Misión Jardines" src="${GOOGLE_EMBED_URL}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`;
      status.innerHTML = '<b>Mapa disponible</b><span>Agrega GOOGLE_MAPS_BROWSER_API_KEY para activar el tráfico en tiempo real.</span>';
      return;
    }

    try {
      await loadGoogleMapsScript(key);
      const geocoder = new google.maps.Geocoder();
      const result = await geocoder.geocode({ address });
      const location = result.results?.[0]?.geometry?.location;

      if (!location) throw new Error('No fue posible ubicar Misión Jardines.');

      mapElement.innerHTML = '';
      const map = new google.maps.Map(mapElement, {
        center: location,
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        gestureHandling: 'cooperative'
      });

      new google.maps.TrafficLayer({ autoRefresh: true }).setMap(map);

      new google.maps.Marker({
        map,
        position: location,
        title: 'Misión Jardines Fraccionamiento'
      });

      status.innerHTML = '<b>Tráfico actual</b><span>Google Maps · actualización automática</span>';
    } catch (error) {
      mapElement.innerHTML = `<iframe title="Ubicación real de Misión Jardines" src="${GOOGLE_EMBED_URL}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`;
      status.innerHTML = '<b>Mapa disponible</b><span>' + escapeHtml(error.message) + '</span>';
    }
  }

  async function loadIncidents() {
    const list = document.getElementById('hlIncidentList');
    const updated = document.getElementById('hlIncidentUpdated');
    if (!list || !updated) return;

    try {
      const result = await environmentApi('/entorno/incidencias');

      if (!result.configured) {
        list.innerHTML = '<div class="hl-live-empty">' + escapeHtml(result.message || 'Fuente de incidencias no configurada.') + '</div>';
        return;
      }

      updated.textContent = 'Radio aproximado de ' + (result.radiusKm || 5) + ' km · ' + formatWhen(result.updatedAt);

      const items = Array.isArray(result.data) ? result.data : [];
      list.innerHTML = items.length
        ? items.map(item => {
            const minutes = Number(item.delaySeconds) > 0 ? Math.max(1, Math.round(Number(item.delaySeconds) / 60)) : 0;
            const area = [item.from, item.to].filter(Boolean).join(' → ') || 'Zona cercana al fraccionamiento';
            return `
              <div class="hl-incident-item">
                <span class="hl-incident-icon">${incidentIcon(item.category)}</span>
                <div>
                  <strong>${escapeHtml(item.description || item.type || 'Incidente vial')}</strong>
                  <p>${escapeHtml(area)}</p>
                  <div class="hl-incident-meta">
                    <span>${escapeHtml(item.type || 'Incidente')}</span>
                    ${minutes ? `<span>+${minutes} min</span>` : ''}
                  </div>
                </div>
              </div>`;
          }).join('')
        : '<div class="hl-live-empty">No se reportan accidentes, obras o cierres relevantes en el área consultada.</div>';
    } catch (error) {
      list.innerHTML = '<div class="hl-live-empty">' + escapeHtml(error.message) + '</div>';
    }
  }

  async function loadLocalNews() {
    const grid = document.getElementById('hlNewsGrid');
    const updated = document.getElementById('hlNewsUpdated');
    if (!grid || !updated) return;

    try {
      const result = await environmentApi('/entorno/noticias');
      updated.textContent = 'Guadalajara · Zapopan · últimas 24 h · ' + formatWhen(result.updatedAt);

      const items = Array.isArray(result.data) ? result.data : [];
      grid.innerHTML = items.length
        ? items.slice(0, 9).map(item => `
            <a class="hl-news-item" href="${escapeHtml(safeExternalUrl(item.url))}" target="_blank" rel="noopener noreferrer">
              <small>${escapeHtml(item.domain || 'Medio local')}</small>
              <strong>${escapeHtml(item.title || 'Noticia local')}</strong>
              <span>${escapeHtml(formatWhen(item.seenDate))} · Leer noticia ↗</span>
            </a>`).join('')
        : '<div class="hl-live-empty">No se encontraron noticias locales recientes en este momento.</div>';
    } catch (error) {
      grid.innerHTML = '<div class="hl-live-empty">' + escapeHtml(error.message) + '</div>';
    }
  }

  async function initEnvironmentCard() {
    const card = document.querySelector('.hl-environment-card');
    if (!card) return;

    const tabs = card.querySelectorAll('[data-hl-environment]');
    const flipper = card.querySelector('.hl-environment-flipper');

    tabs.forEach(button => {
      button.addEventListener('click', () => {
        const news = button.dataset.hlEnvironment === 'news';
        tabs.forEach(tab => tab.classList.toggle('active', tab === button));
        flipper?.classList.toggle('is-flipped', news);

        if (news && !homeNewsLoaded) {
          homeNewsLoaded = true;
          loadLocalNews();
        }
      });
    });

    try {
      const config = await environmentApi('/entorno/config');
      await renderTrafficMap(config.data || {});
    } catch (error) {
      const status = document.getElementById('hlTrafficStatus');
      if (status) status.innerHTML = '<b>No fue posible cargar tráfico</b><span>' + escapeHtml(error.message) + '</span>';
    }

    loadIncidents();
  }

  function renderDashboard(data) {
    const container = document.querySelector('.dashboard');
    if (!container) return;

    const user = cachedUser();
    const firstName = user?.nombre || 'vecino';
    const k = data.kpis || {};
    const fuentes = data.fuentes || {};
    const q = k.cuotas || {};
    const v = k.visitas || {};
    const a = k.accesos || {};
    const r = k.residentes || {};
    const actions = roleActions();
    const pct = q.porcentajeAlCorriente;

    container.innerHTML = `
      <section class="hl-welcome">
        <div><span class="hl-eyebrow">INICIO · DATOS EN VIVO</span><h1>Hola, ${escapeHtml(firstName)}.</h1><p>Este tablero se alimenta directamente de MySQL. No muestra cifras de demostración.</p></div>
        <div class="hl-actions">
          ${actions.map((action, index) => `<a class="hl-action ${index === 0 ? 'primary' : ''}" href="${action.href}"><b>${action.icon}</b>${action.label}</a>`).join('')}
          <button class="hl-refresh" type="button" id="hlRefresh">↻ Actualizar</button>
        </div>
      </section>

      <section class="hl-kpis" aria-label="Indicadores conectados a la base de datos">
        <article class="hl-card hl-kpi">
          <div class="hl-kpi-icon green">$</div>
          <div><span>Cuotas al corriente</span><strong>${pct === null || pct === undefined ? '—' : `${Number(pct).toLocaleString('es-MX')}%`}</strong><small>${fuentes.cuotas ? `${integer.format(q.alCorriente || 0)} de ${integer.format(q.total || 0)} cuotas del periodo` : 'Fuente no disponible'}</small></div>
          <div class="hl-kpi-foot">${sourceBadge('cuotas', fuentes.cuotas)}${deltaLabel(q.variacionPuntos, 'pts')}</div>
        </article>
        <article class="hl-card hl-kpi">
          <div class="hl-kpi-icon orange">↳</div>
          <div><span>Visitas hoy</span><strong>${fuentes.visitas ? integer.format(v.hoy || 0) : '—'}</strong><small>${fuentes.visitas ? `${integer.format(v.programadas || 0)} programadas · ${integer.format(v.enCurso || 0)} en curso` : 'Fuente no disponible'}</small></div>
          <div class="hl-kpi-foot">${sourceBadge('visitas_programadas', fuentes.visitas)}</div>
        </article>
        <article class="hl-card hl-kpi">
          <div class="hl-kpi-icon red">⇄</div>
          <div><span>Accesos activos</span><strong>${fuentes.accesos ? integer.format(a.activos || 0) : '—'}</strong><small>${fuentes.accesos ? `${integer.format(a.entradasHoy || 0)} entradas registradas hoy` : 'Fuente no disponible'}</small></div>
          <div class="hl-kpi-foot">${sourceBadge('accesos_seguridad', fuentes.accesos)}</div>
        </article>
        <article class="hl-card hl-kpi">
          <div class="hl-kpi-icon blue">⌂</div>
          <div><span>Residentes activos</span><strong>${fuentes.residentes ? integer.format(r.activos || 0) : '—'}</strong><small>${fuentes.residentes ? `${integer.format(r.viviendasOcupadas || 0)} de ${integer.format(r.viviendasTotales || 0)} viviendas con residente activo` : 'Fuente no disponible'}</small></div>
          <div class="hl-kpi-foot">${sourceBadge('condominos + direcciones', fuentes.residentes)}</div>
        </article>
      </section>

      <section class="hl-main-grid">
        <article class="hl-card hl-collection">
          <div class="hl-card-head"><div><span class="hl-eyebrow">FINANZAS</span><h2>Recaudación de cuotas</h2></div><span class="hl-period">Últimos 6 meses</span></div>
          <div class="hl-money-row"><div><small>Total recaudado · ${escapeHtml(data.periodo?.actual?.etiqueta || 'periodo actual')}</small><strong>${fuentes.cuotas ? money.format(data.recaudacion?.totalMes || 0) : '—'}</strong></div>${fuentes.cuotas ? deltaLabel(data.recaudacion?.variacionPorcentaje) : ''}</div>
          <div class="hl-chart-wrap">${fuentes.cuotas ? chartSvg(data.recaudacion?.serie || []) : '<div class="hl-chart-empty"><strong>Cuotas no disponible</strong><span>No fue posible consultar la tabla.</span></div>'}</div>
          <div class="hl-data-note">${sourceBadge('cuotas.monto_pagado', fuentes.cuotas)}<span>Cada punto se calcula con la suma real del periodo.</span></div>
        </article>

        <article class="hl-card hl-events">
          <div class="hl-card-head"><div><span class="hl-eyebrow">AGENDA</span><h2>Próximos eventos</h2></div><a href="calendario.html">Ver calendario</a></div>
          <div class="hl-event-list">
            ${renderEvents(data.eventos, fuentes.eventos)}
          </div>
          <div class="hl-data-note">${sourceBadge('eventos', fuentes.eventos)}<span>${fuentes.eventos ? `${integer.format(data.eventosProximos7Dias || 0)} en los próximos 7 días` : 'Sin conexión con la tabla'}</span></div>
        </article>
      </section>

      <section class="hl-bottom-grid">
        <article class="hl-card hl-map-card hl-environment-card">
          <div class="hl-card-head hl-environment-head">
            <div>
              <span class="hl-eyebrow">ENTORNO EN VIVO</span>
              <h2>Misión Jardines Fraccionamiento</h2>
              <p>C. Atotonilco 700, C.P. 45138, Zapopan, Jalisco.</p>
            </div>
            <div class="hl-environment-actions">
              <div class="hl-environment-tabs" role="tablist" aria-label="Entorno del fraccionamiento">
                <button class="active" type="button" data-hl-environment="traffic">Tráfico e incidencias</button>
                <button type="button" data-hl-environment="news">Noticias</button>
              </div>
              <a class="hl-map-link" href="${GOOGLE_SHARE_URL}" target="_blank" rel="noopener">Google Maps ↗</a>
            </div>
          </div>

          <div class="hl-environment-scene">
            <div class="hl-environment-flipper">
              <section class="hl-environment-face hl-traffic-face" aria-label="Tráfico e incidencias cercanas">
                <div class="hl-live-map-wrap">
                  <div id="hlLiveTrafficMap" class="hl-live-map"></div>
                  <div id="hlTrafficStatus" class="hl-traffic-status">
                    <b>Preparando tráfico</b><span>Consultando el entorno del fraccionamiento…</span>
                  </div>
                </div>
                <aside class="hl-incidents">
                  <div class="hl-incidents-head">
                    <strong>Incidencias cercanas</strong>
                    <span id="hlIncidentUpdated">Accidentes, obras, cierres y congestión cercanos.</span>
                  </div>
                  <div id="hlIncidentList" class="hl-incident-list">
                    <div class="hl-live-empty">Consultando incidencias viales…</div>
                  </div>
                </aside>
              </section>

              <section class="hl-environment-face hl-news-face" aria-label="Noticias cercanas">
                <div class="hl-news-head">
                  <div>
                    <span class="hl-eyebrow">NOTICIAS CERCANAS</span>
                    <strong>Guadalajara y Zapopan en tiempo real</strong>
                    <small id="hlNewsUpdated">Cobertura reciente de medios locales y regionales.</small>
                  </div>
                  <span class="hl-news-live">● EN VIVO</span>
                </div>
                <div id="hlNewsGrid" class="hl-news-grid">
                  <div class="hl-live-empty">Selecciona Noticias para consultar la cobertura reciente.</div>
                </div>
              </section>
            </div>
          </div>

          <div class="hl-data-note">
            <span class="hl-source ok">● Entorno en vivo</span>
            <span>Tráfico, incidencias y noticias públicas alrededor de Misión Jardines.</span>
            <a href="mapa.html">Ver plano interno</a>
          </div>
        </article>

        <article class="hl-card hl-activity">
          <div class="hl-card-head"><div><span class="hl-eyebrow">MOVIMIENTOS</span><h2>Actividad reciente</h2></div></div>
          <div class="hl-activity-list">${renderActivity(data.actividad)}</div>
          <div class="hl-data-note"><span class="hl-source ok">● Base de datos</span><span>Pagos, visitas, accesos y altas recientes.</span></div>
        </article>
      </section>

      <footer class="hl-footer"><span>Actualizado: ${formatWhen(data.generadoEn)}</span><span>Fuentes: cuotas · visitas_programadas · accesos_seguridad · condominos · direcciones · eventos</span></footer>
    `;

    if (currentRole() === 'SEGURIDAD') {
      container.querySelector('.hl-kpis > article')?.remove();
      container.querySelectorAll('.hl-collection,.hl-events').forEach(el => el.remove());
      const note = container.querySelector('.hl-activity .hl-data-note span:last-child');
      if (note) note.textContent = 'Visitas, accesos y altas recientes.';
      const footer = container.querySelector('.hl-footer span:last-child');
      if (footer) footer.textContent = 'Información operativa de seguridad';
    }
    document.getElementById('hlRefresh')?.addEventListener('click', load);
    initEnvironmentCard();
  }

  function renderEvents(events, sourceOk) {
    if (!sourceOk) return '<div class="hl-empty">No fue posible consultar los eventos.</div>';
    if (!Array.isArray(events) || !events.length) return '<div class="hl-empty">No hay eventos futuros registrados.</div>';
    return events.map(event => {
      const parsed = new Date(`${event.fecha}T12:00:00`);
      return `<a class="hl-event" href="calendario.html"><div class="hl-event-date"><b>${Number.isNaN(parsed.getTime()) ? '—' : parsed.getDate()}</b><span>${Number.isNaN(parsed.getTime()) ? '' : shortDate.format(parsed).replace(/\d+/g, '').replace(/[.\s]/g, '')}</span></div><div><strong>${escapeHtml(event.titulo)}</strong><span>${escapeHtml(eventTypeLabel(event.tipo))} · ${escapeHtml(event.ubicacion || 'Sin ubicación')}</span></div></a>`;
    }).join('');
  }

  function renderActivity(items) {
    if (!Array.isArray(items) || !items.length) return '<div class="hl-empty">Todavía no hay actividad reciente registrada.</div>';
    const icons = { PAGO: '$', VISITA: '↳', ACCESO: '⇄', RESIDENTE: '⌂' };
    return items.map(item => {
      const house = [item.calle, item.numero].filter(Boolean).join(' ');
      const extra = item.tipo === 'PAGO' && Number(item.monto) > 0 ? ` · ${money.format(item.monto)}` : '';
      return `<div class="hl-activity-row"><span class="hl-activity-icon ${String(item.tipo || '').toLowerCase()}">${icons[item.tipo] || '•'}</span><div><strong>${escapeHtml(item.titulo)}</strong><span>${house ? `Casa ${escapeHtml(house)}` : 'Registro comunitario'}${escapeHtml(extra)}</span></div><time>${formatWhen(item.fecha)}</time></div>`;
    }).join('');
  }

  function renderLoading() {
    const container = document.querySelector('.dashboard');
    if (!container) return;
    container.innerHTML = `<div class="hl-loading"><span></span><strong>Consultando la base de datos…</strong><small>Cuotas, visitas, accesos, residentes y eventos</small></div>`;
  }

  function renderError(message) {
    const container = document.querySelector('.dashboard');
    if (!container) return;
    container.innerHTML = `<div class="hl-error"><strong>No fue posible cargar el Inicio</strong><p>${escapeHtml(message || 'La API no respondió correctamente.')}</p><button type="button" id="hlRetry">Reintentar</button></div>`;
    document.getElementById('hlRetry')?.addEventListener('click', load);
  }

  function updateTopbar(data, healthy = true) {
    const status = document.querySelector('.operation-status');
    if (status) {
      status.innerHTML = `<i></i>${healthy ? 'Datos actualizados' : 'Sin conexión con datos'}`;
      status.style.color = healthy ? '#14763f' : '#b42318';
      status.style.background = healthy ? '#f1faf5' : '#fff4f3';
      status.style.borderColor = healthy ? '#dfeee5' : '#fecdca';
    }

    const badge = document.querySelector('.notification-badge');
    if (badge) {
      const count = Number(data?.eventosProximos7Dias || 0);
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = !count;
      badge.setAttribute('aria-label', `${count} eventos en los próximos 7 días`);
    }

    const dropdown = document.querySelector('.notification-dropdown');
    if (dropdown && data) {
      dropdown.innerHTML = `<div class="dropdown-title">Próximos eventos</div>${Array.isArray(data.eventos) && data.eventos.length ? data.eventos.slice(0, 4).map(event => `<a class="notice-mini" href="calendario.html"><i></i><span><strong>${escapeHtml(event.titulo)}</strong><span>${escapeHtml(event.fecha)} · ${escapeHtml(event.ubicacion || 'Sin ubicación')}</span></span></a>`).join('') : '<div class="notice-mini"><span><strong>Sin eventos próximos</strong><span>No hay registros futuros en la agenda.</span></span></div>'}`;
    }
  }

  async function load() {
    if (!token) {
      location.replace('login.html');
      return;
    }
    renderLoading();
    try {
      const response = await fetch(`${API_URL}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        clearSession();
        location.replace('login.html');
        return;
      }
      if (!response.ok || !data.ok) throw new Error(data.message || `Error HTTP ${response.status}`);
      renderDashboard(data);
      updateTopbar(data, true);
    } catch (error) {
      console.error('Inicio: no se pudo cargar el dashboard:', error);
      updateTopbar(null, false);
      renderError(error.message);
    }
  }

  function injectStyles() {
    if (document.getElementById('homeLiveStyles')) return;
    const style = document.createElement('style');
    style.id = 'homeLiveStyles';
    style.textContent = `
      .dashboard{max-width:1510px!important;padding:28px 36px 40px!important;background:radial-gradient(circle at 96% 0,#f5efff 0,transparent 28%),#fff}
      .hl-card{border:1px solid #e1e6ed;border-radius:16px;background:#fff;box-shadow:0 10px 28px rgba(31,42,62,.055)}
      .hl-welcome{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-bottom:20px}.hl-welcome h1{margin:5px 0 6px;font-size:clamp(27px,3vw,38px);letter-spacing:-.045em}.hl-welcome p{margin:0;color:#748097;font-size:12px}.hl-eyebrow{color:#d76500;font-size:9px;font-weight:900;letter-spacing:.12em}.hl-actions{display:flex;gap:9px;flex-wrap:wrap}.hl-action,.hl-refresh{min-height:42px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:9px 14px;border:1px solid #dfe4ec;border-radius:10px;color:#4e5b71;background:#fff;font-size:10px;font-weight:850;text-decoration:none;cursor:pointer}.hl-action.primary{color:#fff;border-color:#ef7d0b;background:linear-gradient(135deg,#f58b1c,#e87100)}.hl-action b{font-size:15px}.hl-refresh:hover,.hl-action:not(.primary):hover{border-color:#efb579;background:#fffaf6}
      .hl-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px;margin-bottom:16px}.hl-kpi{min-width:0;padding:17px;display:grid;grid-template-columns:46px minmax(0,1fr);gap:13px}.hl-kpi-icon{width:46px;height:46px;display:grid;place-items:center;border-radius:13px;font-size:18px;font-weight:900}.hl-kpi-icon.green{color:#087a47;background:#ecf9f2}.hl-kpi-icon.orange{color:#c86509;background:#fff4e8}.hl-kpi-icon.red{color:#b42318;background:#fff0ef}.hl-kpi-icon.blue{color:#2b67ba;background:#edf4ff}.hl-kpi>div:nth-child(2)>span{display:block;color:#77839a;font-size:10px;font-weight:700}.hl-kpi strong{display:block;margin:4px 0 3px;font-size:27px;letter-spacing:-.035em}.hl-kpi small{display:block;color:#7f8a9d;font-size:9px;line-height:1.45}.hl-kpi-foot{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:10px;border-top:1px solid #edf0f4;flex-wrap:wrap}
      .hl-source{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border-radius:999px;font-size:7.5px;font-weight:850}.hl-source.ok{color:#14763f;background:#eef9f3}.hl-source.off{color:#b42318;background:#fff1f0}.hl-delta{font-size:8.5px;font-weight:850}.hl-delta.up{color:#087a47}.hl-delta.down{color:#b42318}.hl-delta.neutral{color:#8691a3}
      .hl-main-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,.75fr);gap:16px;margin-bottom:16px}.hl-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:17px 18px;border-bottom:1px solid #edf0f4}.hl-card-head h2{margin:4px 0 0;font-size:15px}.hl-card-head p{margin:5px 0 0;color:#8390a4;font-size:9px}.hl-card-head>a{color:#d76500;font-size:9px;font-weight:850;text-decoration:none}.hl-period{padding:6px 8px;border-radius:8px;color:#69758d;background:#f6f7f9;font-size:8px;font-weight:800}.hl-money-row{display:flex;align-items:end;justify-content:space-between;gap:14px;padding:18px 20px 4px}.hl-money-row small{display:block;color:#7f8b9f;font-size:9px}.hl-money-row strong{display:block;margin-top:4px;font-size:24px;letter-spacing:-.035em}.hl-chart-wrap{padding:4px 14px 0}.hl-chart{width:100%;height:250px;display:block}.hl-chart-empty{height:250px;display:grid;place-content:center;gap:5px;color:#69758d;text-align:center}.hl-chart-empty strong{color:#354054;font-size:13px}.hl-chart-empty span{font-size:9px}.hl-data-note{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:11px 17px;border-top:1px solid #edf0f4;color:#8a94a6;background:#fbfcfd;font-size:8px}.hl-data-note>a{margin-left:auto;color:#d76500;font-weight:850;text-decoration:none}
      .hl-event-list{padding:5px 14px 9px}.hl-event{display:grid;grid-template-columns:45px minmax(0,1fr);gap:11px;align-items:center;padding:11px 3px;border-bottom:1px solid #eef1f4;text-decoration:none}.hl-event:last-child{border-bottom:0}.hl-event-date{height:45px;display:grid;place-content:center;border:1px solid #f2dac2;border-radius:10px;color:#bf5f08;background:#fff7ef;text-align:center}.hl-event-date b{font-size:16px;line-height:1}.hl-event-date span{margin-top:3px;font-size:7px;font-weight:850;text-transform:uppercase}.hl-event>div:last-child strong{display:block;color:#344054;font-size:10px}.hl-event>div:last-child span{display:block;margin-top:4px;color:#8590a2;font-size:8px}.hl-empty{min-height:150px;display:grid;place-items:center;padding:18px;color:#8a94a6;font-size:9px;text-align:center}
      .hl-bottom-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(320px,.7fr);gap:16px}.hl-map-frame{height:360px;background:#f4f6f8}.hl-map-frame iframe{width:100%;height:100%;border:0;display:block}.hl-map-link{padding:7px 9px;border:1px solid #e9d4bd;border-radius:9px;background:#fff8f1}.hl-environment-head{align-items:center}.hl-environment-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.hl-environment-tabs{display:inline-flex;gap:3px;padding:3px;border:1px solid #e1e6ed;border-radius:10px;background:#f7f8fa}.hl-environment-tabs button{min-height:30px;padding:6px 9px;border:0;border-radius:7px;color:#6c778b;background:transparent;font-size:8px;font-weight:850;cursor:pointer}.hl-environment-tabs button.active{color:#a9580c;background:#fff;box-shadow:0 3px 9px rgba(31,42,62,.08)}.hl-environment-scene{height:360px;perspective:1300px;overflow:hidden;background:#f6f8fa}.hl-environment-flipper{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .68s cubic-bezier(.2,.7,.2,1)}.hl-environment-flipper.is-flipped{transform:rotateY(180deg)}.hl-environment-face{position:absolute;inset:0;backface-visibility:hidden;background:#fff}.hl-traffic-face{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(250px,.65fr)}.hl-news-face{transform:rotateY(180deg);padding:15px;background:radial-gradient(circle at 93% 0,#f5edff 0,transparent 30%),linear-gradient(180deg,#fff,#fbfcff)}.hl-live-map-wrap{position:relative;min-width:0;background:#eef2f5}.hl-live-map{position:absolute;inset:0}.hl-live-map iframe{width:100%;height:100%;border:0;display:block}.hl-traffic-status{position:absolute;left:12px;bottom:12px;z-index:3;max-width:265px;padding:8px 10px;border:1px solid rgba(221,228,235,.95);border-radius:10px;background:rgba(255,255,255,.94);box-shadow:0 6px 16px rgba(34,45,62,.10);backdrop-filter:blur(8px)}.hl-traffic-status b,.hl-traffic-status span{display:block}.hl-traffic-status b{color:#217149;font-size:8px}.hl-traffic-status span{margin-top:2px;color:#778399;font-size:7px;line-height:1.35}.hl-incidents{min-width:0;border-left:1px solid #e7ebf0;background:#fff}.hl-incidents-head{padding:12px;border-bottom:1px solid #edf0f4}.hl-incidents-head strong{display:block;color:#344054;font-size:10px}.hl-incidents-head span{display:block;margin-top:3px;color:#8b95a7;font-size:7.5px;line-height:1.4}.hl-incident-list{height:302px;padding:8px;overflow:auto;display:grid;gap:6px;align-content:start}.hl-incident-item{display:grid;grid-template-columns:30px minmax(0,1fr);gap:8px;padding:8px;border:1px solid #e7ebf0;border-radius:10px;background:#fbfcfd}.hl-incident-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;color:#b45d0c;background:#fff1e4;font-size:11px;font-weight:900}.hl-incident-item strong{display:block;color:#344054;font-size:8.5px;line-height:1.3}.hl-incident-item p{margin:3px 0 0;color:#8490a2;font-size:7px;line-height:1.35}.hl-incident-meta{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}.hl-incident-meta span{padding:3px 5px;border-radius:999px;color:#677388;background:#eef2f6;font-size:6.5px;font-weight:800}.hl-live-empty{min-height:90px;display:grid;place-items:center;padding:14px;color:#8792a4;text-align:center;font-size:8px;line-height:1.45}.hl-news-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:11px;border-bottom:1px solid #e8ecf1}.hl-news-head strong{display:block;margin-top:4px;color:#2f3b50;font-size:13px}.hl-news-head small{display:block;margin-top:3px;color:#8490a2;font-size:8px}.hl-news-live{padding:6px 8px;border-radius:999px;color:#7a4c98;background:#f5eefb;font-size:7px;font-weight:900}.hl-news-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:11px;max-height:285px;overflow:auto}.hl-news-item{min-width:0;min-height:105px;display:flex;flex-direction:column;padding:10px;border:1px solid #e5e9ef;border-radius:11px;background:rgba(255,255,255,.94);text-decoration:none;box-shadow:0 5px 13px rgba(40,50,70,.04);transition:.17s ease}.hl-news-item:hover{border-color:#dfc9eb;transform:translateY(-1px);box-shadow:0 8px 16px rgba(40,50,70,.07)}.hl-news-item small{color:#9362b0;font-size:6.5px;font-weight:900;text-transform:uppercase}.hl-news-item strong{display:-webkit-box;margin-top:5px;overflow:hidden;color:#344054;font-size:8.5px;line-height:1.35;-webkit-line-clamp:3;-webkit-box-orient:vertical}.hl-news-item span{margin-top:auto;padding-top:7px;color:#8792a4;font-size:6.5px}.hl-activity-list{padding:7px 16px}.hl-activity-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #eef1f4}.hl-activity-row:last-child{border-bottom:0}.hl-activity-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;font-size:12px;font-weight:900}.hl-activity-icon.pago{color:#087a47;background:#ecf9f2}.hl-activity-icon.visita{color:#c86509;background:#fff4e8}.hl-activity-icon.acceso{color:#b42318;background:#fff0ef}.hl-activity-icon.residente{color:#2b67ba;background:#edf4ff}.hl-activity-row strong{display:block;color:#344054;font-size:9.5px}.hl-activity-row div span{display:block;margin-top:3px;color:#8792a4;font-size:8px}.hl-activity-row time{color:#8a94a6;font-size:7.5px;white-space:nowrap}.hl-footer{display:flex;justify-content:space-between;gap:18px;padding:20px 2px 0;color:#9099a8;font-size:8px}.hl-loading,.hl-error{min-height:560px;display:grid;place-content:center;justify-items:center;gap:8px;text-align:center}.hl-loading span{width:34px;height:34px;border:3px solid #f2d3b6;border-top-color:#ef7d0b;border-radius:50%;animation:hlspin .75s linear infinite}.hl-loading strong,.hl-error strong{font-size:14px}.hl-loading small,.hl-error p{margin:0;color:#7d899d;font-size:9px}.hl-error button{margin-top:4px;padding:9px 13px;border:0;border-radius:9px;color:#fff;background:#ef7d0b;cursor:pointer;font-size:9px;font-weight:850}@keyframes hlspin{to{transform:rotate(360deg)}}
      @media(max-width:1180px){.hl-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.hl-main-grid,.hl-bottom-grid{grid-template-columns:1fr}.hl-traffic-face{grid-template-columns:minmax(0,1.4fr) minmax(240px,.7fr)}}
      @media(max-width:720px){.dashboard{padding:20px 15px 34px!important}.hl-welcome{align-items:flex-start;flex-direction:column}.hl-kpis{grid-template-columns:1fr}.hl-actions{width:100%}.hl-action,.hl-refresh{flex:1}.hl-money-row,.hl-card-head,.hl-footer{align-items:flex-start;flex-direction:column}.hl-chart-wrap{overflow-x:auto}.hl-chart{min-width:600px}.hl-map-frame{height:300px}.hl-environment-actions{width:100%;justify-content:flex-start}.hl-environment-tabs{width:100%;display:grid;grid-template-columns:1fr 1fr}.hl-environment-scene{height:600px}.hl-traffic-face{grid-template-columns:1fr;grid-template-rows:340px 260px}.hl-incidents{border-left:0;border-top:1px solid #e7ebf0}.hl-incident-list{height:205px}.hl-news-grid{grid-template-columns:1fr 1fr;max-height:515px}.hl-activity-row{grid-template-columns:34px minmax(0,1fr)}.hl-activity-row time{grid-column:2}.hl-data-note>a{margin-left:0}}
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
