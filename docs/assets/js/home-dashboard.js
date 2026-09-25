(() => {
  const API_URL = window.MJ_API_URL || 'https://api-misionjardines.listoenlinea.host/api';
  const token = window.MJ_TOKEN || localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
  const GOOGLE_SHARE_URL = 'https://share.google/XOJvMvlvdeocnd6mQ';
  const GOOGLE_EMBED_URL = 'https://www.google.com/maps?q=Misi%C3%B3n+Jardines+Fraccionamiento,+C.+Atotonilco+700,+45138+Zapopan,+Jalisco,+M%C3%A9xico&output=embed';

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
        <article class="hl-card hl-map-card">
          <div class="hl-card-head"><div><span class="hl-eyebrow">UBICACIÓN REAL</span><h2>Misión Jardines Fraccionamiento</h2><p>C. Atotonilco 700, C.P. 45138, Zapopan, Jalisco.</p></div><a class="hl-map-link" href="${GOOGLE_SHARE_URL}" target="_blank" rel="noopener">Abrir en Google Maps ↗</a></div>
          <div class="hl-map-frame"><iframe title="Mapa real de Misión Jardines" src="${GOOGLE_EMBED_URL}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>
          <div class="hl-data-note"><span class="hl-source ok">● Google Maps</span><span>El mapa consulta la ubicación pública real del fraccionamiento; no es un dibujo de demostración.</span><a href="mapa.html">Ver plano interno</a></div>
        </article>

        <article class="hl-card hl-activity">
          <div class="hl-card-head"><div><span class="hl-eyebrow">MOVIMIENTOS</span><h2>Actividad reciente</h2></div></div>
          <div class="hl-activity-list">${renderActivity(data.actividad)}</div>
          <div class="hl-data-note"><span class="hl-source ok">● Base de datos</span><span>Pagos, visitas, accesos y altas recientes.</span></div>
        </article>
      </section>

      <footer class="hl-footer"><span>Actualizado: ${formatWhen(data.generadoEn)}</span><span>Fuentes: cuotas · visitas_programadas · accesos_seguridad · condominos · direcciones · eventos</span></footer>
    `;

    document.getElementById('hlRefresh')?.addEventListener('click', load);
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
      .hl-bottom-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(320px,.7fr);gap:16px}.hl-map-frame{height:360px;background:#f4f6f8}.hl-map-frame iframe{width:100%;height:100%;border:0;display:block}.hl-map-link{padding:7px 9px;border:1px solid #e9d4bd;border-radius:9px;background:#fff8f1}.hl-activity-list{padding:7px 16px}.hl-activity-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #eef1f4}.hl-activity-row:last-child{border-bottom:0}.hl-activity-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:10px;font-size:12px;font-weight:900}.hl-activity-icon.pago{color:#087a47;background:#ecf9f2}.hl-activity-icon.visita{color:#c86509;background:#fff4e8}.hl-activity-icon.acceso{color:#b42318;background:#fff0ef}.hl-activity-icon.residente{color:#2b67ba;background:#edf4ff}.hl-activity-row strong{display:block;color:#344054;font-size:9.5px}.hl-activity-row div span{display:block;margin-top:3px;color:#8792a4;font-size:8px}.hl-activity-row time{color:#8a94a6;font-size:7.5px;white-space:nowrap}.hl-footer{display:flex;justify-content:space-between;gap:18px;padding:20px 2px 0;color:#9099a8;font-size:8px}.hl-loading,.hl-error{min-height:560px;display:grid;place-content:center;justify-items:center;gap:8px;text-align:center}.hl-loading span{width:34px;height:34px;border:3px solid #f2d3b6;border-top-color:#ef7d0b;border-radius:50%;animation:hlspin .75s linear infinite}.hl-loading strong,.hl-error strong{font-size:14px}.hl-loading small,.hl-error p{margin:0;color:#7d899d;font-size:9px}.hl-error button{margin-top:4px;padding:9px 13px;border:0;border-radius:9px;color:#fff;background:#ef7d0b;cursor:pointer;font-size:9px;font-weight:850}@keyframes hlspin{to{transform:rotate(360deg)}}
      @media(max-width:1180px){.hl-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.hl-main-grid,.hl-bottom-grid{grid-template-columns:1fr}}
      @media(max-width:720px){.dashboard{padding:20px 15px 34px!important}.hl-welcome{align-items:flex-start;flex-direction:column}.hl-kpis{grid-template-columns:1fr}.hl-actions{width:100%}.hl-action,.hl-refresh{flex:1}.hl-money-row,.hl-card-head,.hl-footer{align-items:flex-start;flex-direction:column}.hl-chart-wrap{overflow-x:auto}.hl-chart{min-width:600px}.hl-map-frame{height:300px}.hl-activity-row{grid-template-columns:34px minmax(0,1fr)}.hl-activity-row time{grid-column:2}.hl-data-note>a{margin-left:0}}
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
