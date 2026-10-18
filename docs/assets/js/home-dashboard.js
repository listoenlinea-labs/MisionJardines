(() => {
  const API_URL = window.MJ_API_URL || 'https://api-misionjardines.listoenlinea.host/api';
  const token = window.MJ_TOKEN || localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
  const GOOGLE_SHARE_URL = 'https://share.google/XOJvMvlvdeocnd6mQ';
  const GOOGLE_EMBED_URL = 'https://www.google.com/maps?q=Misi%C3%B3n+Jardines+Fraccionamiento,+C.+Atotonilco+700,+45138+Zapopan,+Jalisco,+M%C3%A9xico&output=embed';
  let homeNewsLoaded = false;
  let removeFinanceMediaListener = () => {};

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

  function chartSvg(series, activeFilter = 'todas', availableWidth = 0, selectedIndex = -1) {
      const clean = (Array.isArray(series) ? series : []).map(item => ({
        label: String(item.etiqueta || ''),
        ingresos: Number(item.ingresos ?? item.total) || 0,
        egresos: Number(item.egresos) || 0,
        disponible: Number(item.disponible) || 0
      }));
      if (!clean.length) return '<div class="hl-chart-empty">Sin periodos disponibles desde enero de 2026.</div>';
  
      const tracks = [
        { key: 'ingresos', name: 'Ingresos', color: '#f97316' },
        { key: 'egresos', name: 'Egresos', color: '#a78bfa' },
        { key: 'disponible', name: 'Disponible al cierre', color: '#16a085' }
      ];
      const enabled = tracks.filter(track => activeFilter === 'todas' || activeFilter === track.key);
      // En teléfonos se dibuja con geometría expandible y ejes HTML que no se estiran.
      const compact = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 720px)').matches;
      // Medir el ancho de la tarjeta también en escritorio: el SVG nunca debe conservar 850px fijos.
      const width = Math.max(compact ? 220 : 420, Math.floor(Number(availableWidth) || (compact ? 310 : 850)));
      // En móvil el SVG dibuja SOLO la geometría; textos y botones son HTML superpuesto,
      // con tipografía y puntos circulares de tamaño constante y sin distorsión.
      const height = compact ? 270 : 310;
      const left = compact ? 43 : 58;
      const right = compact ? 16 : 16;
      const top = compact ? 20 : 20;
      const bottom = compact ? 31 : 46;
      const plotWidth = width - left - right, plotHeight = height - top - bottom;
      const values = clean.flatMap(row => enabled.map(track => row[track.key]));
      const min = Math.min(0, ...values), max = Math.max(0, ...values);
      const margin = Math.max(1, (max - min) * 0.1);
      const low = min < 0 ? min - margin : 0, high = max + margin;
      const span = Math.max(1, high - low);
      const x = index => left + (clean.length === 1 ? plotWidth / 2 : index * plotWidth / (clean.length - 1));
      const y = amount => top + (high - amount) / span * plotHeight;
      const tickCount = compact ? 4 : 5;
      const grid = Array.from({ length: tickCount }, (_, index) => {
        const amount = low + (span * index / (tickCount - 1)), cy = y(amount);
        const line = `<line x1="${left}" y1="${cy}" x2="${width - right}" y2="${cy}" stroke="${compact ? '#e9eef5' : '#e8ebef'}" stroke-dasharray="${compact ? '3 4' : 'none'}" pointer-events="none"/>`;
        if (compact) return line;
        return line + `<text x="${left - 10}" y="${cy + 4}" text-anchor="end" fill="#64748b" font-weight="400" font-size="11">${escapeHtml(compactMoney(amount).replace(/^\$-/, '-$'))}</text>`;
      }).join('');
      const fills = enabled.filter(() => !compact || activeFilter !== 'todas').map(track => {
        const points = clean.map((row, i) => `${x(i).toFixed(1)},${y(row[track.key]).toFixed(1)}`).join(' ');
        const fillPoints = `${x(0)},${y(0)} ${points} ${x(clean.length - 1)},${y(0)}`;
        return `<polygon points="${fillPoints}" fill="url(#hl-finance-${track.key})" stroke="none" pointer-events="none"/>`;
      }).join('');
      const lines = enabled.map(track => {
        const points = clean.map((row, i) => `${x(i).toFixed(1)},${y(row[track.key]).toFixed(1)}`).join(' ');
        return `<polyline points="${points}" fill="none" stroke="${track.color}" stroke-width="${compact ? 2.5 : 3}" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>`;
      }).join('');
      // All hit areas are rendered LAST: no chart fill or crossing line can intercept them.
      const dots = compact ? '' : enabled.map(track => clean.map((row, i) =>
        `<circle class="hl-chart-dot" cx="${x(i)}" cy="${y(row[track.key])}" r="${compact ? 5 : 4.8}" fill="#fff" stroke="${track.color}" stroke-width="${compact ? 2.3 : 2.5}" pointer-events="none"/>`
      ).join('')).join('');
      const hits = compact ? '' : enabled.map(track => clean.map((row, i) =>
        `<circle class="hl-chart-hit" data-index="${i}" data-series="${track.key}" cx="${x(i)}" cy="${y(row[track.key])}" r="${compact ? 19 : 14}" fill="transparent" stroke="none" role="button" tabindex="0" aria-label="${escapeHtml(row.label)} · ${track.name}: ${money.format(row[track.key])}. Ver detalle financiero" aria-pressed="false"/>`
      ).join('')).join('');
      const labels = compact ? '' : clean.map((row, i) =>
        `<text x="${x(i)}" y="${height - 14}" text-anchor="middle" fill="#52647e" font-size="11">${escapeHtml(row.label)}</text>`
      ).join('');
      // Los ejes HTML conservan letras nítidas. Los controles HTML permanecen redondos
      // incluso al expandir la geometría SVG por todo el ancho del teléfono.
      const overlay = compact ? `<div class="hl-chart-mobile-overlay">
        ${Array.from({ length: tickCount }, (_, index) => {
          const amount = low + (span * index / (tickCount - 1));
          return `<span class="hl-chart-axis-y" style="top:${(y(amount) / height * 100).toFixed(4)}%">${escapeHtml(compactMoney(amount).replace(/^\$-/, '-$'))}</span>`;
        }).join('')}
        ${clean.map((row, i) => `<span class="hl-chart-axis-x" style="left:${(x(i) / width * 100).toFixed(4)}%;top:${((height - 14) / height * 100).toFixed(4)}%">${escapeHtml(row.label.replace(/\s+\d{4}$/, ''))}</span>`).join('')}
        ${enabled.map(track => clean.map((row, i) =>
          `<button type="button" class="hl-chart-hit hl-chart-mobile-point" data-index="${i}" data-series="${track.key}" style="left:${(x(i) / width * 100).toFixed(4)}%;top:${(y(row[track.key]) / height * 100).toFixed(4)}%;--point-color:${track.color}" aria-label="${escapeHtml(row.label)} · ${track.name}: ${money.format(row[track.key])}. Ver detalle financiero" aria-pressed="false"></button>`
        ).join('')).join('')}
      </div>` : '';
      const buttons = [
        { key: 'todas', name: 'Todas', color: '#8794a7' },
        ...tracks
      ].map(track =>
        `<button class="hl-finance-filter${activeFilter === track.key ? ' active' : ''}" type="button" data-hl-finance-filter="${track.key}" aria-pressed="${activeFilter === track.key}" style="--series-color:${track.color}">${escapeHtml(track.name)}</button>`
      ).join('');
      const monthOptions = clean.map((row, index) =>
        `<option value="${index}"${index === selectedIndex ? ' selected' : ''}>${escapeHtml(row.label)}</option>`
      ).join('');
      return `<div class="hl-finance-filters" role="group" aria-label="Filtrar series de la gráfica">${buttons}</div><div class="hl-chart-mobile-heading"><strong>Evolución mensual</strong><span>2026</span></div><div class="hl-finance-plot"><svg class="hl-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="${compact ? 'none' : 'xMidYMid meet'}" role="group" aria-label="Ingresos, egresos y disponible al cierre, por mes. Pasa el cursor o selecciona un punto para consultar su importe."><defs>${enabled.map(track => `<linearGradient id="hl-finance-${track.key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${track.color}" stop-opacity=".20"/><stop offset="1" stop-color="${track.color}" stop-opacity=".025"/></linearGradient>`).join('')}</defs>${grid}${fills}${lines}${dots}${hits}${labels}</svg>${overlay}<div class="hl-finance-tooltip" role="status" aria-live="polite" hidden></div></div><div class="hl-mobile-month-control"><label for="hlFinanceMonth">Consultar mes</label><select id="hlFinanceMonth" data-hl-finance-month aria-label="Mes del resumen financiero">${monthOptions}</select></div><p class="hl-mobile-chart-hint">Toca un punto o elige un mes para consultar su detalle</p>`;
  }

  function financeSummary(series, selectedIndex) {
      const item = (Array.isArray(series) ? series : [])[selectedIndex];
      if (!item) return '<p class="hl-finance-no-data">Sin datos financieros disponibles.</p>';
      const cuotas = Number(item.cuotas) || 0;
      const adicionales = Number(item.ingresosAdicionales) || 0;
      const inicial = Number(item.saldoInicial) || 0;
      const ingresos = Number(item.ingresos ?? item.total) || 0;
      const egresos = Number(item.egresos) || 0;
      const disponible = Number(item.disponible) || 0;
      const variacion = ingresos - egresos;
      const anterior = disponible - variacion;
      return `<div class="hl-finance-detail" aria-live="polite">
        <div class="hl-detail-period">${escapeHtml(item.etiqueta || '')}<span>Detalle del período</span></div>
        <div class="hl-detail-amounts">
          <div class="hl-detail-pill ingreso"><small>Ingresos</small><strong>${money.format(ingresos)}</strong></div>
          <div class="hl-detail-pill egreso"><small>Egresos</small><strong>${money.format(egresos)}</strong></div>
        </div>
        <div class="hl-detail-breakdown">
          <div><span>Cuotas de mantenimiento</span><b>${money.format(cuotas)}</b></div>
          <div><span>Otros ingresos</span><b>${money.format(adicionales)}</b></div>
          ${inicial ? `<div><span>Saldo inicial registrado</span><b>${money.format(inicial)}</b></div>` : ''}
          <div class="hl-detail-separator"><span>Ingresos − egresos del mes</span><b class="${variacion < 0 ? 'hl-negative' : 'hl-positive'}">${money.format(variacion)}</b></div>
          <div><span>Disponible anterior</span><b>${money.format(anterior)}</b></div>
        </div>
        <div class="hl-detail-closing"><small>Disponible al cierre</small><strong class="${disponible < 0 ? 'hl-negative' : 'hl-positive'}">${money.format(disponible)}</strong></div>
        <p>Selecciona otro punto de la gráfica para cambiar de mes. Los importes provienen del dashboard conectado a MySQL.</p>
      </div>`;
  }

  function setupFinancePanel(data) {
      const chartWrap = document.querySelector('.hl-chart-wrap');
      const card = document.querySelector('.hl-events');
      if (!chartWrap || !card || !data.fuentes?.cuotas) return;
      const series = Array.isArray(data.recaudacion?.serie) ? data.recaudacion.serie : [];
      let filter = 'todas';
      let selectedIndex = Math.max(0, series.length - 1);
      let selectedKey = 'ingresos';
      const front = card.querySelector('.hl-finance-face');
      const back = card.querySelector('.hl-agenda-face');
      const details = card.querySelector('#hlFinanceDetails');
      if (details) details.innerHTML = financeSummary(series, selectedIndex);
  
      function showFace(agenda) {
        const scene = card.querySelector('.hl-card-flipper');
        scene?.classList.toggle('is-flipped', agenda);
        front?.setAttribute('aria-hidden', String(agenda));
        back?.setAttribute('aria-hidden', String(!agenda));
        if (front) front.inert = agenda;
        if (back) back.inert = !agenda;
      }
      showFace(false);
      card.addEventListener('click', event => {
        const toggle = event.target.closest('[data-hl-show-face]');
        if (toggle) showFace(toggle.dataset.hlShowFace === 'agenda');
      });
  
      function showTooltip(hit) {
        const plot = chartWrap.querySelector('.hl-finance-plot');
        const tooltip = plot?.querySelector('.hl-finance-tooltip');
        if (!hit || !plot || !tooltip) return;
        const index = Number(hit.dataset.index);
        const row = series[index];
        const key = hit.dataset.series;
        const labels = { ingresos: 'Ingresos', egresos: 'Egresos', disponible: 'Disponible al cierre' };
        if (!row || !Object.hasOwn(labels, key)) return;
        tooltip.innerHTML = `<b>${escapeHtml(row.etiqueta || '')} · ${labels[key]}</b><strong>${money.format(Number(row[key] ?? row.total) || 0)}</strong><small>Haz clic para ver el desglose</small>`;
        tooltip.hidden = false;
        const dot = hit.getBoundingClientRect();
        const bounds = plot.getBoundingClientRect();
        const left = Math.max(6, Math.min(bounds.width - tooltip.offsetWidth - 6, dot.left + dot.width / 2 - bounds.left - tooltip.offsetWidth / 2));
        const top = Math.max(4, dot.top - bounds.top - tooltip.offsetHeight - 12);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      }
  
      function hideTooltip() {
        const tooltip = chartWrap.querySelector('.hl-finance-tooltip');
        if (tooltip) tooltip.hidden = true;
      }
  
      function closestPoint(event) {
        const plot = event.target.closest('.hl-finance-plot');
        if (!plot) return null;
        const touchLayout = window.matchMedia?.('(max-width: 720px)').matches;
        let closest = null, minimum = (touchLayout ? 29 : 21) ** 2;
        plot.querySelectorAll('.hl-chart-hit').forEach(hit => {
          const box = hit.getBoundingClientRect();
          const dx = box.left + box.width / 2 - event.clientX;
          const dy = box.top + box.height / 2 - event.clientY;
          const distance = dx * dx + dy * dy;
          if (distance < minimum) { minimum = distance; closest = hit; }
        });
        return closest;
      }
  
      function selectPoint(hit) {
        const index = Number(hit?.dataset.index);
        if (!Number.isInteger(index) || !series[index]) return;
        selectedIndex = index;
        selectedKey = hit.dataset.series;
        if (details) details.innerHTML = financeSummary(series, selectedIndex);
        chartWrap.querySelectorAll('.hl-chart-hit').forEach(point => {
          const pressed = Number(point.dataset.index) === selectedIndex && point.dataset.series === selectedKey;
          point.setAttribute('aria-pressed', String(pressed));
          point.classList.toggle('is-selected', pressed);
        });
        showFace(false);
        const monthSelector = chartWrap.querySelector('[data-hl-finance-month]');
        if (monthSelector) monthSelector.value = String(index);
        showTooltip(hit);
      }
  
      function redrawChart() {
        // Restar exactamente los paddings del contenedor y el borde del panel gráfico.
        // Así coincide el viewBox con el ancho CSS de <svg>, sin bandas laterales.
        const styles = window.getComputedStyle(chartWrap);
        const padLeft = Number.parseFloat(styles.paddingLeft) || 0;
        const padRight = Number.parseFloat(styles.paddingRight) || 0;
        // Fallback de la medición inicial: el SVG se puede montar antes de que el
        // contenedor termine de adoptar el ancho móvil. Medimos su caja real después
        // del primer render y recalculamos las coordenadas si son distintas.
        const existingPlot = chartWrap.querySelector('.hl-finance-plot');
        const chartWidth = Math.max(220, Math.floor(existingPlot?.clientWidth ||
          chartWrap.clientWidth - padLeft - padRight - 2));
        chartWrap.innerHTML = chartSvg(series, filter, chartWidth, selectedIndex);
        // clientWidth mide el ancho real UTILIZABLE por el SVG (sin bordes).
        // Un segundo render ajusta las coordenadas si el diseño terminó de asentarse.
        const renderedWidth = Math.round(chartWrap.querySelector('.hl-finance-plot')?.clientWidth || 0);
        if (renderedWidth >= 220 && Math.abs(renderedWidth - chartWidth) > 1) {
          chartWrap.innerHTML = chartSvg(series, filter, renderedWidth, selectedIndex);
        }
        chartWrap.querySelectorAll('.hl-chart-hit').forEach(point => {
          const pressed = Number(point.dataset.index) === selectedIndex && point.dataset.series === selectedKey;
          point.setAttribute('aria-pressed', String(pressed));
          point.classList.toggle('is-selected', pressed);
        });
      }
      redrawChart();
      // En la primera carga algunos navegadores móviles aún no han medido el layout;
      // un segundo render tras el primer frame evita conservar el ancho provisional.
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => { if (chartWrap.isConnected) redrawChart(); });
      }
      // Al rotar el teléfono (o pasar de móvil a escritorio), recalcular el SVG.
      const mobileMedia = window.matchMedia?.('(max-width: 720px)');
      if (mobileMedia?.addEventListener) {
        mobileMedia.addEventListener('change', redrawChart);
        removeFinanceMediaListener = () => mobileMedia.removeEventListener('change', redrawChart);
      }

      let lastChartWidth = Math.round(chartWrap.getBoundingClientRect().width);
      const onChartResize = () => {
        const nextWidth = Math.round(chartWrap.getBoundingClientRect().width);
        if (nextWidth > 0 && Math.abs(nextWidth - lastChartWidth) >= 2) {
          lastChartWidth = nextWidth;
          redrawChart();
        }
      };
      const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(onChartResize) : null;
      resizeObserver?.observe(chartWrap);
      window.addEventListener('resize', onChartResize, { passive: true });
      const previousCleanup = removeFinanceMediaListener;
      removeFinanceMediaListener = () => {
        previousCleanup();
        resizeObserver?.disconnect();
        window.removeEventListener('resize', onChartResize);
      };
      chartWrap.addEventListener('click', event => {
        const button = event.target.closest('[data-hl-finance-filter]');
        if (button) {
          filter = button.dataset.hlFinanceFilter;
          redrawChart();
          hideTooltip();
          return;
        }
        const hit = closestPoint(event) || event.target.closest('.hl-chart-hit');
        if (hit) selectPoint(hit);
      });
      chartWrap.addEventListener('change', event => {
        if (!event.target.matches('[data-hl-finance-month]')) return;
        const month = Number(event.target.value);
        if (!Number.isInteger(month) || !series[month]) return;
        selectedIndex = month;
        if (details) details.innerHTML = financeSummary(series, selectedIndex);
        showFace(false);
        redrawChart();
      });
      chartWrap.addEventListener('pointermove', event => {
        const hit = closestPoint(event);
        if (hit) showTooltip(hit);
        else hideTooltip();
      });
      chartWrap.addEventListener('pointerleave', hideTooltip);
      chartWrap.addEventListener('focusin', event => {
        const hit = event.target.closest('.hl-chart-hit');
        if (hit) showTooltip(hit);
      });
      chartWrap.addEventListener('focusout', event => {
        if (event.target.closest('.hl-chart-hit')) hideTooltip();
      });
      chartWrap.addEventListener('keydown', event => {
        const hit = event.target.closest('.hl-chart-hit');
        if (hit && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          selectPoint(hit);
        }
      });
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
      { href: 'analisis-cuotas.html', label: 'Ver cuotas', icon: '$', roles: ['SUPER_ADMIN','ADMINISTRADOR'] },
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

    grid.innerHTML = '<div class="hl-live-empty">Buscando noticias de Zapopan, Guadalajara y choques recientes…</div>';

    try {
      const result = await environmentApi('/entorno/noticias');
      updated.textContent = 'Guadalajara · Zapopan · últimos 7 días · ' + formatWhen(result.updatedAt);

      const items = Array.isArray(result.data) ? result.data : [];
      grid.innerHTML = items.length
        ? items.slice(0, 9).map(item => `
            <a class="hl-news-item" href="${escapeHtml(safeExternalUrl(item.url))}" target="_blank" rel="noopener noreferrer">
              <small>${escapeHtml(item.category || 'Noticias')} · ${escapeHtml(item.domain || 'Medio local')}</small>
              <strong>${escapeHtml(item.title || 'Noticia local')}</strong>
              <span>Detectada ${escapeHtml(formatWhen(item.seenDate))} · Leer noticia ↗</span>
            </a>`).join('')
        : '<div class="hl-live-empty">No se encontraron noticias sobre Guadalajara, Zapopan o choques en los últimos 7 días.</div>';
    } catch (error) {
      homeNewsLoaded = false; // Permitir reintento al abrir de nuevo Noticias.
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

  // Se reutiliza literalmente el mapa existente, sin modificar el Inicio
  // financiero de administradores.
  function renderEnvironmentMarkup() {
    return `
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
    `;
  }

  function operationalHour(value) {
    if (!value) return 'Sin hora';
    const plain = String(value);
    if (/^\d{2}:\d{2}/.test(plain)) return plain.slice(0, 5);
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Sin hora';
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  function operationalEntry(item, kind, showHouse) {
    const estado = kind === 'VISITA' ? String(item.estado || 'PROGRAMADA') : 'DENTRO';
    const tone = kind === 'VISITA' && estado === 'PROGRAMADA' ? 'scheduled' : 'inside';
    const time = kind === 'VISITA' ? operationalHour(item.entrada || item.hora) : operationalHour(item.entrada);
    const address = showHouse && item.vivienda ? '<span class="hl-op-house">' + escapeHtml(item.vivienda) + '</span>' : '';
    return '<li class="hl-op-entry"><div class="hl-op-person"><strong>' +
      escapeHtml(item.nombre || 'Sin nombre') + '</strong><span>' +
      (kind === 'VISITA' ? 'Visita · ' : 'Acceso · ') + escapeHtml(time) +
      '</span>' + address + '</div><span class="hl-op-status ' + tone + '">' +
      escapeHtml(estado.replaceAll('_', ' ')) + '</span></li>';
  }

  function renderOperationalDashboard(data) {
    const container = document.querySelector('.dashboard');
    if (!container) return;
    const role = currentRole();
    const isSecurity = data.alcance === 'FRACCIONAMIENTO';
    const visitor = data.kpis?.visitas || {};
    const access = data.kpis?.accesos || {};
    const visits = Array.isArray(data.operativo?.visitas) ? data.operativo.visitas : [];
    const inside = Array.isArray(data.operativo?.accesos) ? data.operativo.accesos : [];
    const available = data.fuentes || {};
    const firstName = cachedUser()?.nombre || (isSecurity ? 'Seguridad' : 'vecino');
    const scope = isSecurity ? 'Todo el fraccionamiento' : 'Mis viviendas';
    const count = value => integer.format(Math.max(0, Number(value) || 0));
    const empty = message => '<li class="hl-op-empty">' + escapeHtml(message) + '</li>';
    removeFinanceMediaListener();
    removeFinanceMediaListener = () => {};
    container.innerHTML = `
      <section class="hl-welcome">
        <div><span class="hl-eyebrow">INICIO · ACCESOS EN VIVO</span>
          <h1>Hola, ${escapeHtml(firstName)}.</h1>
          <p>${isSecurity ? 'Consulta de visitas y personas que permanecen dentro del fraccionamiento.' :
            'Consulta tus visitas programadas y las personas que han ingresado a tus viviendas.'}</p>
        </div>
        <div class="hl-actions">
          ${isSecurity ? '<a class="hl-action primary" href="visitas.html">＋ Ver visitas</a>' : ''}
          <button class="hl-refresh" type="button" id="hlRefresh">↻ Actualizar</button>
        </div>
      </section>
      <section class="hl-op-scope" aria-label="Alcance de los datos">
        <strong>${escapeHtml(scope)}</strong>
        <span>${isSecurity ? 'Registros de las viviendas del fraccionamiento' : 'Registros de viviendas vinculadas a tu cuenta'}</span>
      </section>
      <section class="hl-kpis hl-op-kpis" aria-label="Indicadores de visitas y accesos">
        <article class="hl-card hl-kpi hl-report-kpi hl-kpi-tone-mint">
          <div class="hl-kpi-content"><span>Visitas hoy</span>
          <strong>${available.visitas ? count(visitor.hoy) : '—'}</strong>
          <small>${available.visitas ? count(visitor.programadas) + ' programadas · ' + count(visitor.enCurso) + ' en curso' : 'Datos no disponibles'}</small></div>
        </article>
        <article class="hl-card hl-kpi hl-report-kpi hl-kpi-tone-peach">
          <div class="hl-kpi-content"><span>Accesos activos</span>
          <strong>${available.accesos ? count(access.activos) : '—'}</strong>
          <small>Personas dentro, sin salida registrada</small></div>
        </article>
      </section>
      <section class="hl-op-grid" aria-label="Detalle operativo de visitas y accesos">
        <article class="hl-card hl-op-panel">
          <div class="hl-card-head"><div><span class="hl-eyebrow">VISITAS DE HOY</span>
            <h2>${isSecurity ? 'Visitas registradas en el fraccionamiento' : 'Mis visitas programadas'}</h2></div>
            <span class="hl-op-total">${count(visitor.hoy)} en total</span></div>
          <ul class="hl-op-list">${visits.length ?
            visits.map(item => operationalEntry(item, 'VISITA', isSecurity)).join('') :
            empty('No hay visitas programadas para hoy.')}</ul>
          ${Number(visitor.hoy) > visits.length ? '<p class="hl-op-more">Mostrando las primeras ' +
            count(visits.length) + ' visitas.</p>' : ''}
        </article>
        <article class="hl-card hl-op-panel">
          <div class="hl-card-head"><div><span class="hl-eyebrow">DENTRO AHORA</span>
            <h2>${isSecurity ? 'Personas dentro del fraccionamiento' : 'Personas que ingresaron a mi vivienda'}</h2></div>
            <span class="hl-op-total">${count(access.activos)} activos</span></div>
          <ul class="hl-op-list">${inside.length ?
            inside.map(item => operationalEntry(item, 'ACCESO', isSecurity)).join('') :
            empty('No hay accesos activos registrados.')}</ul>
          ${Number(access.activos) > inside.length ? '<p class="hl-op-more">Mostrando los últimos ' +
            count(inside.length) + ' accesos activos.</p>' : ''}
        </article>
      </section>
      <section class="hl-op-map">${renderEnvironmentMarkup()}</section>
      <footer class="hl-footer"><span>Actualizado: ${formatWhen(data.generadoEn)}</span>
        <span>${escapeHtml(scope)} · Visitas y accesos registrados en MySQL</span></footer>
    `;
    document.getElementById('hlRefresh')?.addEventListener('click', load);
    initEnvironmentCard();
  }

  function renderDashboard(data) {
    if (data?.vista === 'OPERATIVA') return renderOperationalDashboard(data);
    const container = document.querySelector('.dashboard');
    if (!container) return;
    removeFinanceMediaListener();
    removeFinanceMediaListener = () => {};

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
        <article class="hl-card hl-kpi hl-report-kpi hl-kpi-tone-blue">
          <div class="hl-kpi-content"><span>Cuotas al corriente</span><strong>${pct === null || pct === undefined ? '—' : `${Number(pct).toLocaleString('es-MX')}%`}</strong><small>${fuentes.cuotas ? `${integer.format(q.alCorriente || 0)} de ${integer.format(q.total || 0)} cuotas del periodo` : 'Fuente no disponible'}</small></div>
          
        </article>
        <article class="hl-card hl-kpi hl-report-kpi hl-kpi-tone-mint">
          <div class="hl-kpi-content"><span>Visitas hoy</span><strong>${fuentes.visitas ? integer.format(v.hoy || 0) : '—'}</strong><small>${fuentes.visitas ? `${integer.format(v.programadas || 0)} programadas · ${integer.format(v.enCurso || 0)} en curso` : 'Fuente no disponible'}</small></div>
          
        </article>
        <article class="hl-card hl-kpi hl-report-kpi hl-kpi-tone-peach">
          <div class="hl-kpi-content"><span>Accesos activos</span><strong>${fuentes.accesos ? integer.format(a.activos || 0) : '—'}</strong><small>${fuentes.accesos ? `${integer.format(a.entradasHoy || 0)} entradas registradas hoy` : 'Fuente no disponible'}</small></div>
          
        </article>
        <article class="hl-card hl-kpi hl-report-kpi hl-kpi-tone-lilac">
          <div class="hl-kpi-content"><span>Residentes activos</span><strong>${fuentes.residentes ? integer.format(r.activos || 0) : '—'}</strong><small>${fuentes.residentes ? `${integer.format(r.viviendasOcupadas || 0)} de ${integer.format(r.viviendasTotales || 0)} viviendas con residente activo` : 'Fuente no disponible'}</small></div>
          
        </article>
      </section>

      <section class="hl-main-grid">
        <article class="hl-card hl-collection">
          <div class="hl-card-head"><div><span class="hl-eyebrow">FINANZAS</span><h2>Ingresos, egresos y disponible</h2></div><span class="hl-period">Desde enero de 2026</span></div>
          <div class="hl-money-row"><div><small>Cuotas recaudadas · ${escapeHtml(data.periodo?.actual?.etiqueta || 'periodo actual')}</small><strong>${fuentes.cuotas ? money.format(data.recaudacion?.totalMes || 0) : '—'}</strong></div>${fuentes.cuotas ? deltaLabel(data.recaudacion?.variacionPorcentaje) : ''}</div>
          <div class="hl-chart-wrap">${fuentes.cuotas ? chartSvg(data.recaudacion?.serie || []) : '<div class="hl-chart-empty"><strong>Cuotas no disponible</strong><span>No fue posible consultar la tabla.</span></div>'}</div>
          <div class="hl-data-note">${sourceBadge('cuotas.monto_pagado', fuentes.cuotas)}<span>Ingresos (cuotas, ingresos adicionales y saldo inicial registrado), egresos y disponible acumulado desde enero de 2026.</span></div>
        </article>

        <article class="hl-card hl-events" aria-label="Resumen financiero y agenda">
          <div class="hl-finance-flip-scene">
            <div class="hl-card-flipper">
              <section class="hl-flip-face hl-finance-face" aria-label="Resumen financiero">
                <div class="hl-card-head"><div><span class="hl-eyebrow">FINANZAS</span><h2>Resumen del mes</h2></div><button type="button" class="hl-face-switch" data-hl-show-face="agenda" aria-label="Girar tarjeta para ver próximos eventos">Ver agenda ↻</button></div>
                <div id="hlFinanceDetails" class="hl-finance-details">${fuentes.cuotas ? financeSummary(data.recaudacion?.serie || [], Math.max(0, (data.recaudacion?.serie || []).length - 1)) : '<p class="hl-finance-no-data">Información financiera no disponible.</p>'}</div>
                <div class="hl-data-note"><span class="hl-source ok">● Resumen mensual</span><span>Datos de cuotas y finanzas de MySQL.</span></div>
              </section>
              <section class="hl-flip-face hl-agenda-face" aria-label="Próximos eventos" aria-hidden="true" inert>
                <div class="hl-card-head"><div><span class="hl-eyebrow">AGENDA</span><h2>Próximos eventos</h2></div><div class="hl-agenda-actions"><a href="calendario.html">Ver calendario</a><button type="button" class="hl-face-switch" data-hl-show-face="finanzas" aria-label="Girar tarjeta para ver el resumen financiero">Ver resumen ↻</button></div></div>
                <div class="hl-event-list">${renderEvents(data.eventos, fuentes.eventos)}</div>
                <div class="hl-data-note">${sourceBadge('eventos', fuentes.eventos)}<span>${fuentes.eventos ? `${integer.format(data.eventosProximos7Dias || 0)} en los próximos 7 días` : 'Sin conexión con la tabla'}</span></div>
              </section>
            </div>
          </div>
        </article>
      </section>

      <section class="hl-bottom-grid">
        ${renderEnvironmentMarkup()}

        <article class="hl-card hl-activity">
          <div class="hl-card-head"><div><span class="hl-eyebrow">MOVIMIENTOS</span><h2>Actividad reciente</h2></div></div>
          <div class="hl-activity-list">${renderActivity(data.actividad)}</div>
          <div class="hl-data-note"><span class="hl-source ok">● Base de datos</span><span>Pagos, visitas, accesos y altas recientes.</span></div>
        </article>
      </section>

      <footer class="hl-footer"><span>Actualizado: ${formatWhen(data.generadoEn)}</span><span>Fuentes: cuotas · visitas_programadas · accesos_seguridad · condominos · direcciones · eventos</span></footer>
    `;

    document.getElementById('hlRefresh')?.addEventListener('click', load);
    setupFinancePanel(data);
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
    container.innerHTML = `<div class="hl-loading"><span></span><strong>Consultando la base de datos…</strong><small>${['SUPER_ADMIN','ADMINISTRADOR'].includes(currentRole()) ? 'Cuotas, visitas, accesos, residentes y eventos' : 'Visitas y accesos de tus viviendas o del fraccionamiento'}</small></div>`;
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
      showHouseDebtAlert(window.MJAdeudos);
      updateTopbar(data, true);
    } catch (error) {
      console.error('Inicio: no se pudo cargar el dashboard:', error);
      updateTopbar(null, false);
      renderError(error.message);
    }
  }

  function showHouseDebtAlert(data){
    const container=document.querySelector('.dashboard');
    if(!container)return;
    container.querySelector('#mjHouseDebtAlert')?.remove();
    if(!data||!data.cantidad||!data.total)return;
    const alert=document.createElement('a');
    alert.id='mjHouseDebtAlert';alert.href='pagos.html?tab='+
      (data.tipos?.MANTENIMIENTO?.length?'MANTENIMIENTO':data.tipos?.EXTRAORDINARIO?.length?'EXTRAORDINARIO':'CASA_CLUB');
    alert.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 20px;margin:12px 0 18px;border:1px solid #f3cfac;border-radius:14px;background:#fff5eb;color:#854412;text-decoration:none;box-shadow:0 6px 18px #bd784b12';
    const message=document.createElement('span');message.textContent='Tienes '+data.cantidad+' pago(s) pendiente(s) de tu vivienda · $'+Number(data.total).toLocaleString('es-MX',{minimumFractionDigits:2})+' MXN';
    const action=document.createElement('strong');action.textContent='Ver adeudos ›';alert.append(message,action);
    container.querySelector('.hl-welcome')?.after(alert);
  }
  document.addEventListener('mj:adeudos',event=>showHouseDebtAlert(event.detail));

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
      .hl-main-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,.75fr);gap:16px;margin-bottom:16px}.hl-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:17px 18px;border-bottom:1px solid #edf0f4}.hl-card-head h2{margin:4px 0 0;font-size:15px}.hl-card-head p{margin:5px 0 0;color:#8390a4;font-size:9px}.hl-card-head>a{color:#d76500;font-size:9px;font-weight:850;text-decoration:none}.hl-period{padding:6px 8px;border-radius:8px;color:#69758d;background:#f6f7f9;font-size:8px;font-weight:800}.hl-money-row{display:flex;align-items:end;justify-content:space-between;gap:14px;padding:18px 20px 4px}.hl-money-row small{display:block;color:#7f8b9f;font-size:9px}.hl-money-row strong{display:block;margin-top:4px;font-size:24px;letter-spacing:-.035em}.hl-chart-wrap{padding:4px 8px 0;min-width:0}.hl-chart{width:100%;height:310px;max-width:100%;display:block}.hl-chart-empty{height:250px;display:grid;place-content:center;gap:5px;color:#69758d;text-align:center}.hl-chart-empty strong{color:#354054;font-size:13px}.hl-chart-empty span{font-size:9px}.hl-data-note{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:11px 17px;border-top:1px solid #edf0f4;color:#8a94a6;background:#fbfcfd;font-size:8px}.hl-data-note>a{margin-left:auto;color:#d76500;font-weight:850;text-decoration:none}

      .hl-finance-filters{display:flex;flex-wrap:wrap;gap:6px;margin:7px 0 12px}.hl-finance-filter{--series-color:#8794a7;display:inline-flex;align-items:center;gap:7px;padding:6px 10px;border:1px solid #e4e9f0;border-radius:9px;background:#fff;color:#68778d;font-size:10px;font-weight:750;cursor:pointer;transition:.18s}.hl-finance-filter:before{content:"";width:12px;border-top:3px solid var(--series-color)}.hl-finance-filter:hover,.hl-finance-filter.active{border-color:#d5dfe9;background:#f7f9fc;color:#263d56}.hl-finance-filter.active{box-shadow:inset 0 0 0 1px #e5eaf1}.hl-finance-plot{position:relative;min-width:0;width:100%;max-width:100%}.hl-chart-mobile-overlay{display:none}.hl-chart-mobile-heading,.hl-mobile-chart-hint,.hl-mobile-month-control{display:none}.hl-chart-hit{cursor:pointer;pointer-events:all}.hl-chart-hit:focus-visible{stroke:#2d4262;stroke-width:2;outline:none}.hl-chart-hit.is-selected{stroke:#aeb9c8;stroke-width:1.5;stroke-dasharray:3 4}.hl-finance-tooltip{position:absolute;z-index:5;width:max-content;max-width:185px;padding:8px 11px;border:1px solid #e1e6ed;border-radius:11px;color:#344054;background:rgba(255,255,255,.98);box-shadow:0 8px 23px rgba(36,48,73,.12);pointer-events:none;text-align:left}.hl-finance-tooltip b,.hl-finance-tooltip strong,.hl-finance-tooltip small{display:block}.hl-finance-tooltip b{font-size:9px;color:#67758b}.hl-finance-tooltip strong{font-size:15px;margin:3px 0}.hl-finance-tooltip small{font-size:8px;color:#98a2b3}
      .hl-events{display:flex;flex-direction:column;min-width:0;overflow:hidden}.hl-finance-flip-scene{position:relative;flex:1;min-height:450px;perspective:1400px;overflow:hidden}.hl-card-flipper{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .65s cubic-bezier(.2,.7,.2,1)}.hl-card-flipper.is-flipped{transform:rotateY(180deg)}.hl-flip-face{position:absolute;inset:0;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:#fff;backface-visibility:hidden;-webkit-backface-visibility:hidden}.hl-agenda-face{transform:rotateY(180deg)}.hl-flip-face .hl-data-note{margin-top:auto}.hl-face-switch{flex-shrink:0;padding:6px 9px;border:1px solid #f2d8c6;border-radius:8px;background:#fff8f2;color:#bc640d;font-size:9px;font-weight:800;white-space:nowrap;cursor:pointer}.hl-face-switch:hover{background:#ffefe0}.hl-agenda-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.hl-agenda-actions a{font-size:9px;font-weight:850;color:#d76500}.hl-finance-details{flex:1;min-height:0;overflow:auto;padding:13px 16px}.hl-detail-period{display:flex;justify-content:space-between;align-items:center;gap:7px;color:#344054;font-weight:850;font-size:13px}.hl-detail-period span{color:#919aa9;font-size:9px;font-weight:650}.hl-detail-amounts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}.hl-detail-pill{min-width:0;border:1px solid #e6edf0;border-radius:11px;padding:11px 9px;background:#f7fbfc}.hl-detail-pill.ingreso{background:#fff8f2;border-color:#f8e7d8}.hl-detail-pill.egreso{background:#f9f5ff;border-color:#ece4fa}.hl-detail-pill small{display:block;color:#66758b;font-size:9px}.hl-detail-pill strong{display:block;overflow-wrap:anywhere;margin-top:5px;font-size:clamp(12px,1vw,17px);color:#344054}.hl-detail-breakdown{display:grid;gap:9px;padding:10px 2px}.hl-detail-breakdown>div{display:flex;justify-content:space-between;align-items:baseline;gap:10px;font-size:9px;color:#708098}.hl-detail-breakdown b{font-size:10px;color:#3b485d;text-align:right;white-space:nowrap}.hl-detail-breakdown .hl-detail-separator{padding-top:10px;border-top:1px solid #edf0f5;font-weight:800}.hl-detail-closing{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:8px;padding:12px 10px;border-radius:11px;background:#edf8f4}.hl-detail-closing small{font-size:9px;color:#3e7163;font-weight:800}.hl-detail-closing strong{font-size:clamp(14px,1.1vw,20px)}.hl-detail-breakdown .hl-positive,.hl-detail-closing .hl-positive{color:#0f916b}.hl-detail-breakdown .hl-negative,.hl-detail-closing .hl-negative{color:#bc463d}.hl-finance-detail p,.hl-finance-no-data{margin:10px 2px 0;color:#929baa;font-size:8px;line-height:1.5}.hl-agenda-face .hl-event-list{flex:1;min-height:0;overflow:auto}.hl-agenda-face .hl-empty{min-height:190px}
      @media(prefers-reduced-motion:reduce){.hl-card-flipper{transition:none}}@media(max-width:720px){.hl-finance-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:8px 0 14px}.hl-finance-filter{width:100%;justify-content:center;min-width:0;min-height:36px;font-size:10.5px;line-height:1.15;padding:8px 5px;border-radius:10px}.hl-finance-filter.active{background:#f2f6fa;border-color:#cbd6e5}.hl-finance-plot{width:100%;max-width:100%;overflow:hidden;border:1px solid #e9eef5;border-radius:14px;background:linear-gradient(180deg,#f9fbfe 0%,#fff 100%)}.hl-chart{width:100%!important;height:270px!important;max-width:100%;display:block;min-width:0}.hl-chart-mobile-overlay{position:absolute;inset:0;display:block;pointer-events:none}.hl-chart-axis-y,.hl-chart-axis-x{position:absolute;z-index:1;color:#6c7d93;white-space:nowrap;font-family:inherit;font-size:10px;font-weight:600;line-height:1.15;pointer-events:none}.hl-chart-axis-y{left:5px;transform:translateY(-50%);font-size:9px}.hl-chart-axis-x{transform:translate(-50%,-50%);font-size:10px}.hl-chart-mobile-point{position:absolute;z-index:2;box-sizing:border-box;width:32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;transform:translate(-50%,-50%);cursor:pointer;pointer-events:auto;touch-action:manipulation}.hl-chart-mobile-point::before{content:'';position:absolute;left:50%;top:50%;width:10px;height:10px;border:2px solid var(--point-color);border-radius:50%;background:#fff;transform:translate(-50%,-50%);box-sizing:border-box}.hl-chart-mobile-point.is-selected::after,.hl-chart-mobile-point:focus-visible::after{content:'';position:absolute;inset:6px;border:2px dashed #8c9eb8;border-radius:50%}.hl-chart-mobile-point:focus-visible{outline:2px solid #7399c8;outline-offset:0}.hl-chart-mobile-heading{display:flex;align-items:center;justify-content:space-between;margin:0 2px 8px;color:#3b4d65;font-size:11px;font-weight:750}.hl-chart-mobile-heading span{color:#8895a8;font-size:10px}.hl-mobile-chart-hint{display:block;margin:6px 2px 13px;font-size:10px;text-align:center;color:#8291a6}.hl-mobile-month-control{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 2px 0;padding:9px 12px;border:1px solid #e6edf5;border-radius:12px;background:#f8fafc}.hl-mobile-month-control label{font-size:11px;font-weight:800;color:#56647b}.hl-mobile-month-control select{max-width:60%;min-height:36px;padding:6px 28px 6px 10px;border:1px solid #dfe6ef;border-radius:9px;background:#fff;color:#33445b;font-size:12px;font-weight:750}.hl-chart-hit{touch-action:manipulation}.hl-collection .hl-money-row{padding:15px 16px 6px}.hl-collection .hl-money-row strong{font-size:27px}.hl-collection .hl-data-note{font-size:9px;line-height:1.5}}@media(max-width:360px){.hl-finance-filter{font-size:10px;padding:7px 4px}}@media(max-width:720px){.hl-finance-plot{min-width:0;width:100%;max-width:100%}.hl-finance-flip-scene{min-height:425px}.hl-detail-pill strong{font-size:15px}}
      .hl-event-list{padding:5px 14px 9px}.hl-event{display:grid;grid-template-columns:45px minmax(0,1fr);gap:11px;align-items:center;padding:11px 3px;border-bottom:1px solid #eef1f4;text-decoration:none}.hl-event:last-child{border-bottom:0}.hl-event-date{height:45px;display:grid;place-content:center;border:1px solid #f2dac2;border-radius:10px;color:#bf5f08;background:#fff7ef;text-align:center}.hl-event-date b{font-size:16px;line-height:1}.hl-event-date span{margin-top:3px;font-size:7px;font-weight:850;text-transform:uppercase}.hl-event>div:last-child strong{display:block;color:#344054;font-size:10px}.hl-event>div:last-child span{display:block;margin-top:4px;color:#8590a2;font-size:8px}.hl-empty{min-height:150px;display:grid;place-items:center;padding:18px;color:#8a94a6;font-size:9px;text-align:center}
      .hl-bottom-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(320px,.7fr);gap:16px}.hl-map-frame{height:360px;background:#f4f6f8}.hl-map-frame iframe{width:100%;height:100%;border:0;display:block}.hl-map-link{padding:7px 9px;border:1px solid #e9d4bd;border-radius:9px;background:#fff8f1}.hl-environment-head{align-items:center}.hl-environment-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.hl-environment-tabs{display:inline-flex;gap:3px;padding:3px;border:1px solid #e1e6ed;border-radius:10px;background:#f7f8fa}.hl-environment-tabs button{min-height:30px;padding:6px 9px;border:0;border-radius:7px;color:#6c778b;background:transparent;font-size:8px;font-weight:850;cursor:pointer}.hl-environment-tabs button.active{color:#a9580c;background:#fff;box-shadow:0 3px 9px rgba(31,42,62,.08)}.hl-environment-scene{height:360px;perspective:1300px;overflow:hidden;background:#f6f8fa}.hl-environment-flipper{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .68s cubic-bezier(.2,.7,.2,1)}.hl-environment-flipper.is-flipped{transform:rotateY(180deg)}.hl-environment-face{position:absolute;inset:0;backface-visibility:hidden;background:#fff}.hl-traffic-face{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(250px,.65fr)}.hl-news-face{transform:rotateY(180deg);padding:15px;background:radial-gradient(circle at 93% 0,#f5edff 0,transparent 30%),linear-gradient(180deg,#fff,#fbfcff)}.hl-live-map-wrap{position:relative;min-width:0;background:#eef2f5}.hl-live-map{position:absolute;inset:0}.hl-live-map iframe{width:100%;height:100%;border:0;display:block}.hl-traffic-status{position:absolute;left:12px;bottom:12px;z-index:3;max-width:265px;padding:8px 10px;border:1px solid rgba(221,228,235,.95);border-radius:10px;background:rgba(255,255,255,.94);box-shadow:0 6px 16px rgba(34,45,62,.10);backdrop-filter:blur(8px)}.hl-traffic-status b,.hl-traffic-status span{display:block}.hl-traffic-status b{color:#217149;font-size:8px}.hl-traffic-status span{margin-top:2px;color:#778399;font-size:7px;line-height:1.35}.hl-incidents{min-width:0;border-left:1px solid #e7ebf0;background:#fff}.hl-incidents-head{padding:12px;border-bottom:1px solid #edf0f4}.hl-incidents-head strong{display:block;color:#344054;font-size:10px}.hl-incidents-head span{display:block;margin-top:3px;color:#8b95a7;font-size:7.5px;line-height:1.4}.hl-incident-list{height:302px;padding:8px;overflow:auto;display:grid;gap:6px;align-content:start}.hl-incident-item{display:grid;grid-template-columns:30px minmax(0,1fr);gap:8px;padding:8px;border:1px solid #e7ebf0;border-radius:10px;background:#fbfcfd}.hl-incident-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;color:#b45d0c;background:#fff1e4;font-size:11px;font-weight:900}.hl-incident-item strong{display:block;color:#344054;font-size:8.5px;line-height:1.3}.hl-incident-item p{margin:3px 0 0;color:#8490a2;font-size:7px;line-height:1.35}.hl-incident-meta{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}.hl-incident-meta span{padding:3px 5px;border-radius:999px;color:#677388;background:#eef2f6;font-size:6.5px;font-weight:800}.hl-live-empty{min-height:90px;display:grid;place-items:center;padding:14px;color:#8792a4;text-align:center;font-size:8px;line-height:1.45}.hl-news-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:11px;border-bottom:1px solid #e8ecf1}.hl-news-head strong{display:block;margin-top:4px;color:#2f3b50;font-size:13px}.hl-news-head small{display:block;margin-top:3px;color:#8490a2;font-size:8px}.hl-news-live{padding:6px 8px;border-radius:999px;color:#7a4c98;background:#f5eefb;font-size:7px;font-weight:900}.hl-news-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:11px;max-height:285px;overflow:auto}.hl-news-item{min-width:0;min-height:105px;display:flex;flex-direction:column;padding:10px;border:1px solid #e5e9ef;border-radius:11px;background:rgba(255,255,255,.94);text-decoration:none;box-shadow:0 5px 13px rgba(40,50,70,.04);transition:.17s ease}.hl-news-item:hover{border-color:#dfc9eb;transform:translateY(-1px);box-shadow:0 8px 16px rgba(40,50,70,.07)}.hl-news-item small{color:#9362b0;font-size:6.5px;font-weight:900;text-transform:uppercase}.hl-news-item strong{display:-webkit-box;margin-top:5px;overflow:hidden;color:#344054;font-size:8.5px;line-height:1.35;-webkit-line-clamp:3;-webkit-box-orient:vertical}.hl-news-item span{margin-top:auto;padding-top:7px;color:#8792a4;font-size:6.5px}.hl-activity-list{padding:7px 16px}.hl-activity-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #eef1f4}.hl-activity-row:last-child{border-bottom:0}.hl-activity-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;font-size:12px;font-weight:900}.hl-activity-icon.pago{color:#087a47;background:#ecf9f2}.hl-activity-icon.visita{color:#c86509;background:#fff4e8}.hl-activity-icon.acceso{color:#b42318;background:#fff0ef}.hl-activity-icon.residente{color:#2b67ba;background:#edf4ff}.hl-activity-row strong{display:block;color:#344054;font-size:9.5px}.hl-activity-row div span{display:block;margin-top:3px;color:#8792a4;font-size:8px}.hl-activity-row time{color:#8a94a6;font-size:7.5px;white-space:nowrap}.hl-footer{display:flex;justify-content:space-between;gap:18px;padding:20px 2px 0;color:#9099a8;font-size:8px}.hl-loading,.hl-error{min-height:560px;display:grid;place-content:center;justify-items:center;gap:8px;text-align:center}.hl-loading span{width:34px;height:34px;border:3px solid #f2d3b6;border-top-color:#ef7d0b;border-radius:50%;animation:hlspin .75s linear infinite}.hl-loading strong,.hl-error strong{font-size:14px}.hl-loading small,.hl-error p{margin:0;color:#7d899d;font-size:9px}.hl-error button{margin-top:4px;padding:9px 13px;border:0;border-radius:9px;color:#fff;background:#ef7d0b;cursor:pointer;font-size:9px;font-weight:850}@keyframes hlspin{to{transform:rotate(360deg)}}
      @media(max-width:1180px){.hl-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.hl-main-grid,.hl-bottom-grid{grid-template-columns:1fr}.hl-traffic-face{grid-template-columns:minmax(0,1.4fr) minmax(240px,.7fr)}}
      @media(max-width:720px){.dashboard{padding:20px 15px 34px!important}.hl-welcome{align-items:flex-start;flex-direction:column}.hl-kpis{grid-template-columns:1fr}.hl-actions{width:100%}.hl-action,.hl-refresh{flex:1}.hl-money-row,.hl-card-head,.hl-footer{align-items:flex-start;flex-direction:column}.hl-chart-wrap{overflow-x:hidden;min-width:0;max-width:100%;padding:4px 3px 0}.hl-chart{width:100%;min-width:0;max-width:100%;height:270px}.hl-map-frame{height:300px}.hl-environment-actions{width:100%;justify-content:flex-start}.hl-environment-tabs{width:100%;display:grid;grid-template-columns:1fr 1fr}.hl-environment-scene{height:600px}.hl-traffic-face{grid-template-columns:1fr;grid-template-rows:340px 260px}.hl-incidents{border-left:0;border-top:1px solid #e7ebf0}.hl-incident-list{height:205px}.hl-news-grid{grid-template-columns:1fr 1fr;max-height:515px}.hl-activity-row{grid-template-columns:34px minmax(0,1fr)}.hl-activity-row time{grid-column:2}.hl-data-note>a{margin-left:0}}

      /* Inicio operativo de Seguridad/Residente: el de Administración no cambia. */
      .hl-op-scope{display:flex;gap:12px;align-items:center;justify-content:space-between;margin:0 0 15px;padding:11px 16px;border:1px solid #dfe9f0;border-radius:12px;background:#f5f9fd;color:#485a73}
      .hl-op-scope strong{font-size:11px;color:#344761}.hl-op-scope span{font-size:10px}
      .hl-op-kpis{grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:16px}
      .hl-op-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:16px}
      .hl-op-panel{min-width:0;overflow:hidden}.hl-op-panel .hl-card-head{align-items:center}
      .hl-op-total{flex:0 0 auto;padding:7px 10px;border:1px solid #e8e1ef;border-radius:9px;background:#fbf7ff;color:#745886;font-size:10px;font-weight:850}
      .hl-op-list{list-style:none;display:grid;gap:0;max-height:400px;overflow-y:auto;margin:0;padding:6px 17px}
      .hl-op-entry{display:flex;justify-content:space-between;align-items:center;gap:13px;padding:13px 0;border-bottom:1px solid #ecf0f4}
      .hl-op-entry:last-child{border-bottom:0}.hl-op-person{display:flex;flex-direction:column;gap:5px;min-width:0}
      .hl-op-person strong{color:#304059;font-size:12px;line-height:1.4;overflow-wrap:anywhere}
      .hl-op-person>span{color:#8490a0;font-size:10px}.hl-op-person .hl-op-house{color:#627489;font-size:10px;font-weight:700}
      .hl-op-status{flex:0 0 auto;padding:6px 9px;border-radius:9px;font-size:9px;font-weight:850;text-transform:capitalize}
      .hl-op-status.scheduled{background:#fff1e6;color:#a7662c}.hl-op-status.inside{background:#e6f6ed;color:#227748}
      .hl-op-empty{padding:22px 6px;color:#8a94a6;font-size:11px;text-align:center}
      .hl-op-more{margin:0;padding:10px 18px;border-top:1px solid #eaf0f5;font-size:10px;color:#77859a}
      .hl-op-map{min-width:0;margin-bottom:10px}.hl-op-map>.hl-map-card{width:100%;max-width:100%;min-width:0}
      @media(max-width:900px){.hl-op-grid{grid-template-columns:minmax(0,1fr)}}
      @media(max-width:720px){
        .hl-op-scope{flex-direction:column;align-items:flex-start;gap:4px}
        .hl-op-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px}
        .hl-op-kpis .hl-kpi{padding:13px;min-height:98px}
        .hl-op-kpis .hl-kpi strong{font-size:25px}
        .hl-op-kpis .hl-kpi small{font-size:9px;line-height:1.35}
        .hl-op-grid{grid-template-columns:minmax(0,1fr)}
        .hl-op-panel .hl-card-head{align-items:flex-start;gap:9px}
        .hl-op-map .hl-environment-scene{height:600px}
      }
      @media(max-width:370px){.hl-op-kpis{grid-template-columns:minmax(0,1fr)!important}}
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
