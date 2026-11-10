(function () {
  'use strict';
  const admins = ['SUPER_ADMIN', 'ADMINISTRADOR'];
  let refreshId = null;
  function updateMeter(data) {
    const root = document.getElementById('mjDbCapacityMeter');
    if (!root) return;
    const name = document.getElementById('mjDbCapacityValue');
    const detail = document.getElementById('mjDbCapacityDetail');
    const needle = document.getElementById('mjDbCapacityNeedle');
    const observed = [data.connections, data.queries].filter(v =>
      v && Number.isFinite(v.limit) && v.limit > 0);
    const chosen = observed.sort((a,b)=>
      b.percentageUsedEstimate-a.percentageUsedEstimate)[0] || null;
    // El porcentaje del indicador expresa capacidad estimada restante:
    // izquierda rojo 0%, derecha verde 100%.
    const remainingPct = chosen ? Math.max(0, 100 - chosen.percentageUsedEstimate) : 50;
    const radians = Math.PI * (1 - remainingPct/100);
    const x = 50 + 27 * Math.cos(radians);
    const y = 48 - 27 * Math.sin(radians);
    needle.setAttribute('x2', x.toFixed(1));
    needle.setAttribute('y2', y.toFixed(1));
    if (chosen) {
      const unit = chosen === data.connections ? 'conexiones/h' : 'consultas/h';
      name.textContent = chosen.remainingEstimate.toLocaleString('es-MX') + ' est.';
      detail.textContent = unit + ' restantes';
    } else {
      name.textContent = 'Sin cuota';
      detail.textContent = 'Límite no disponible';
    }
    root.dataset.risk = data.risk || 'desconocido';
    root.title = 'Estimación local, no saldo oficial de Hostinger. ' +
      'Conexiones observadas en 60 min: ' + (data.connections?.observedLastHour ?? '—') +
      '. Consultas observadas: ' + (data.queries?.observedLastHour ?? '—') +
      '. ' + (data.message || '') + ' ' +
      'Consulta los límites reales de la cuenta en Hostinger.';
  }
  async function refresh() {
    const root = document.getElementById('mjDbCapacityMeter');
    const token = localStorage.getItem('misionJardinesToken') ||
      sessionStorage.getItem('misionJardinesToken');
    if (!root || !token || root.hidden) return;
    try {
      const response = await fetch((window.MJ_API_URL ||
        'https://api-misionjardines.listoenlinea.host/api') + '/monitor/mysql', {
        headers: { Authorization: 'Bearer ' + token }, cache: 'no-store'
      });
      if (!response.ok) throw new Error('Medición no disponible');
      const data = await response.json();
      if (data.ok) updateMeter(data);
    } catch (_) {
      document.getElementById('mjDbCapacityValue').textContent = 'Sin datos';
      document.getElementById('mjDbCapacityDetail').textContent = 'No disponible';
      root.dataset.risk = 'desconocido';
      root.title = 'No fue posible consultar el estado preventivo de MySQL.';
    }
  }
  function start(role) {
    const root = document.getElementById('mjDbCapacityMeter');
    if (!root) return;
    if (refreshId) { clearInterval(refreshId); refreshId = null; }
    root.hidden = !admins.includes(role);
    if (root.hidden) return;
    refresh();
    refreshId = setInterval(refresh, 60000);
  }
  window.MJDbCapacityMeter = { start };
})();
