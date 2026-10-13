(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const section = $('adminPaymentHistory');
  const raw = localStorage.getItem('misionJardinesUsuario') || sessionStorage.getItem('misionJardinesUsuario');
  let user;
  try { user = JSON.parse(raw || '{}'); } catch { return; }
  const role = user?.rol?.nombre || user?.rol;
  if (!section || !['SUPER_ADMIN', 'ADMINISTRADOR'].includes(role)) return;
  section.hidden = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = value => Number(value || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  const stamp = value => {
    if (!value) return 'No registrada';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'No registrada' : date.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  };
  let page = 1, total = 0, revision = 0;
  const now = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]));
  const start = new Date(Date.UTC(Number(now.year), Number(now.month) - 1 - (Number(now.day) < 10 ? 1 : 0), 10));
  $('historyPeriod').value = start.toISOString().slice(0, 7);
  function months(payment) {
    if (payment.tipoPago === 'EXTRAORDINARIO') return '0 · Extraordinario';
    if (!payment.movimientos.length) return 'Sin aumento registrado';
    return payment.movimientos.map(m => {
      if (!m.meses) return '0 · Abono sin avance';
      if (m.estado === 'COMPLETADO' && m.tagsTotal && m.tagsAplicados === m.tagsTotal) return esc(m.meses) + ' · Aplicados';
      if (m.tagsAplicados) return esc(m.meses) + ' · Aplicados a ' + esc(m.tagsAplicados) + '/' + esc(m.tagsTotal) + ' TAGs';
      const label = { PENDIENTE: 'pendiente', ERROR: 'error de sincronización', CONFLICTO: 'requiere revisión', SIN_TAGS: 'sin TAGs' }[m.estado] || 'requiere revisión';
      return esc(m.meses) + ' · Sin entrega confirmada (' + label + ')';
    }).join('<br>');
  }
  function row(p) {
    const status = { VALIDADO: 'Validado', PENDIENTE_VALIDACION: 'Pendiente de validación', RECHAZADO: 'Rechazado' }[p.estatus] || 'Sin estado';
    const tags = p.tags.length ? p.tags.map(t => '<div>TAG ' + esc(t.numeroTarjeta) + ': <b>' + esc(t.fechaFin || 'Sin fecha') + '</b><small>Última lectura: ' + esc(stamp(t.ultimaLectura)) + (t.enControlador ? '' : ' · Presencia no confirmada') + '</small></div>').join('') : 'Sin TAGs asociados';
    return '<tr><td><b>' + esc(p.folioReporte) + '</b><small>Banco: ' + esc(p.folioOperacion) + '</small></td><td>' + esc(p.fechaOperacion) + '<small>' + esc(p.horaOperacion) + '</small></td><td>' + esc(stamp(p.creadoEn)) + '</td><td>' + esc(money(p.monto)) + '<small>Recargo: ' + esc(money(p.recargo)) + '</small></td><td>' + esc(p.nombreReportante || 'No registrado') + '<small>' + esc(p.calleSnapshot) + ' · ' + esc(p.numeroCasaSnapshot) + '</small></td><td>' + status + '</td><td>' + months(p) + '</td><td>' + tags + '</td></tr>';
  }
  async function load() {
    const current = ++revision;
    $('historyRows').innerHTML = '<tr><td colspan="8">Cargando historial…</td></tr>';
    $('historyPrev').disabled = $('historyNext').disabled = true;
    try {
      const token = localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
      const response = await fetch('https://api-misionjardines.listoenlinea.host/api/pagos/historial?periodo=' + encodeURIComponent($('historyPeriod').value) + '&pagina=' + page, { headers: { Authorization: 'Bearer ' + token } });
      const result = await response.json();
      if (current !== revision) return;
      if (!response.ok || !result.ok) throw Error(result.message || 'No se pudo consultar el historial.');
      total = Number(result.total); page = Number(result.pagina);
      const end = new Date(result.hastaExclusiva + 'T12:00:00Z'); end.setUTCDate(end.getUTCDate() - 1);
      $('historyRange').textContent = 'Depósitos del ' + result.desde + ' al ' + end.toISOString().slice(0, 10) + ' · ' + total + ' comprobante(s).';
      $('historyRows').innerHTML = result.data.length ? result.data.map(row).join('') : '<tr><td colspan="8">No hay pagos reportados en este periodo.</td></tr>';
      $('historyPage').textContent = 'Página ' + page + ' de ' + Math.max(1, Math.ceil(total / result.limite));
      $('historyPrev').disabled = page <= 1;
      $('historyNext').disabled = page * result.limite >= total;
    } catch (error) {
      if (current !== revision) return;
      $('historyRows').innerHTML = '<tr><td colspan="8">' + esc(error.message) + '</td></tr>';
      $('historyRange').textContent = 'Consulta no disponible. Intenta actualizar de nuevo.';
      $('historyPage').textContent = '';
    }
  }
  $('historyPeriod').addEventListener('change', () => { page = 1; load(); });
  $('historyRefresh').addEventListener('click', load);
  $('historyPrev').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  $('historyNext').addEventListener('click', () => { page++; load(); });
  document.addEventListener('pagos:actualizados', load);
  load();
})();
