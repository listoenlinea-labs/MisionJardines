(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const token = localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
  let user;
  try { user = JSON.parse(localStorage.getItem('misionJardinesUsuario') || sessionStorage.getItem('misionJardinesUsuario') || '{}'); } catch { user = {}; }
  if (!token) { location.replace('login.html'); return; }
  const role = user?.rol?.nombre || user?.rol;
  if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(role)) { $('adminAccess').textContent = 'Esta página es exclusiva de Administración.'; return; }
  const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:3000/api' : 'https://api-misionjardines.listoenlinea.host/api';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const labels = { PRUEBA_SIN_ENVIO: 'Prueba sin envío', CREADO: 'Creadas', EXISTENTE: 'Ya existentes', VINCULADO_EXISTENTE: 'Vinculadas a cuenta existente', ENVIADO: 'Enviado a WhatsApp', ERROR: 'Error', REVISAR: 'Revisar', ACEPTADA_O_NO_ELEGIBLE: 'Cuenta ya aceptada o no disponible', SIN_ENVIAR: 'Sin enviar', ENVIANDO: 'Enviando', REQUIERE_CORRECCION: 'Corrección pendiente', ABIERTO: 'Abierto', CORREGIDO: 'Corregido' };
  const name = u => [u.nombre, u.apellidoPaterno, u.apellidoMaterno].filter(Boolean).join(' ');
  let page = 1, total = 0, reportPage = 1, reportTotal = 0, busy = false, rows = [], reports = [], houses = [];
  async function api(path, body, method = 'GET') {
    const response = await fetch(API + '/auto-users' + path, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw Error(data.message || 'No fue posible completar la operación.');
    return data;
  }
  let trialId = null, trialAccepted = false, trialAvailable = false;
  let trialKey = sessionStorage.getItem('autoUsersTrialKey');
  if (!trialKey) { trialKey = crypto.randomUUID().replace(/-/g, ''); sessionStorage.setItem('autoUsersTrialKey', trialKey); }
  function trialButtons() {
    $('createTrial').disabled = busy || !trialAvailable;
    $('generateTrialLink').disabled = busy || !trialId || trialAccepted;
    $('copyTrialLink').disabled = busy || !$('trialLink').value;
  }
  async function trialAction(create) {
    if (busy) return;
    setBusy(true); $('trialLink').value = '';
    try {
      if (create) {
        const data = await api('/prueba/crear', { casaId: Number($('trialHouse').value), clavePrueba: trialKey }, 'POST');
        trialId = data.usuarioId; trialAccepted = data.cuentaAceptada;
        $('trialStatus').textContent = 'Cuenta de prueba #' + trialId + (trialAccepted ? ' · Aceptada: prueba completada.' : ' · Pendiente. Genera su enlace sin enviar.');
      } else {
        const data = await api('/prueba/' + trialId + '/enlace', { frontendUrl: new URL('.', location.href).href }, 'POST');
        $('trialLink').value = data.enlace;
        $('trialStatus').textContent = 'Enlace generado. No se envió ningún WhatsApp. Cópialo y ábrelo en incógnito.';
      }
      await load();
    } catch (error) { $('trialStatus').textContent = error.message; }
    finally { setBusy(false); }
  }
  $('createTrial').addEventListener('click', () => trialAction(true));
  $('generateTrialLink').addEventListener('click', () => trialAction(false));
  $('copyTrialLink').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('trialLink').value); $('trialStatus').textContent = 'Enlace copiado. Ábrelo en incógnito.'; }
    catch { $('trialLink').focus(); $('trialLink').select(); $('trialStatus').textContent = 'Copia el enlace seleccionado y ábrelo en incógnito.'; }
  });
  function buttons(u) {
    if (u.cuentaAceptada || u.estatus && u.estatus !== 'PENDIENTE') return '—';
    return '<button type="button" data-edit="' + esc(u.id) + '">Editar</button><button type="button" data-invite="' + esc(u.id) + '">Enviar</button>';
  }
  async function load() {
    const data = await api('?pagina=' + page + '&paginaReportes=' + reportPage);
    rows = data.registros; reports = data.reportes; total = Number(data.total);
    reportTotal = Number(data.totalReportes);
    if (!reports.length && reportPage > 1 && reportTotal <= (reportPage - 1) * 50) { reportPage = Math.max(1, Math.ceil(reportTotal / 50)); return load(); }
    if (!rows.length && page > 1 && total <= (page - 1) * 50) { page = Math.max(1, Math.ceil(total / 50)); return load(); }
    $('userCount').textContent = total + ' cuenta(s) vinculadas a condóminos';
    $('usersPage').textContent = 'Página ' + page + ' de ' + Math.max(1, Math.ceil(total / 50));
    $('usersPrevious').disabled = busy || page <= 1; $('usersNext').disabled = busy || page * 50 >= total;
    $('reportsPage').textContent = 'Reportes: ' + reportTotal + ' · Página ' + reportPage + ' de ' + Math.max(1, Math.ceil(reportTotal / 50));
    $('reportsPrevious').disabled = busy || reportPage <= 1; $('reportsNext').disabled = busy || reportPage * 50 >= reportTotal;
    $('autoUserRows').innerHTML = rows.length ? rows.map(u => '<tr><td>' + esc(name(u)) + '<small>Condómino #' + esc(u.condominoId) + '</small></td><td>' + esc(u.casa?.calleCorrecta || u.casa?.calle || 'Sin vivienda') + ' ' + esc(u.casa?.numero) + '</td><td>' + esc(u.nombreUsuario || u.correo) + '<small>' + esc(u.correo || 'Sin e-mail') + '</small></td><td>' + esc(u.telefono || 'Sin teléfono') + '</td><td>' + (u.cuentaAceptada ? 'Sí' : 'No') + '</td><td>' + esc(labels[u.invitacion?.envioEstado] || 'Sin invitación') + '<small>' + esc(u.invitacion?.ultimoError || '') + '</small></td><td>' + buttons(u) + '</td></tr>').join('') : '<tr><td colspan="7">Aún no hay cuentas asociadas. Presiona Crear usuarios.</td></tr>';
    $('errorReports').innerHTML = reports.length ? reports.map(r => '<article class="report-card"><strong>' + esc(name(r.usuario || {})) + ' · Usuario #' + esc(r.usuarioId) + '</strong><p>Datos reportados: ' + esc(r.datosReportados?.calle) + ' ' + esc(r.datosReportados?.numero) + '<br>' + esc(r.datosReportados?.nombreUsuario) + ' · ' + esc(r.datosReportados?.correo || 'Sin e-mail') + '</p><p class="report-comment">' + esc(r.comentario) + '</p><small>' + esc(labels[r.estatus] || r.estatus) + ' · ' + esc(new Date(r.creadoEn).toLocaleString('es-MX')) + '</small><div class="actions">' + buttons(r.usuario || { id: r.usuarioId }) + '</div></article>').join('') : '<p>No hay reportes de errores.</p>';
    for (const button of document.querySelectorAll('[data-edit]')) button.addEventListener('click', () => edit(button.dataset.edit));
    for (const button of document.querySelectorAll('[data-invite]')) button.addEventListener('click', () => individual(button.dataset.invite));
  }
  function setBusy(value) {
    busy = value;
    for (const button of document.querySelectorAll('#adminWorkspace button')) button.disabled = value;
    if (!value) { $('usersPrevious').disabled = page <= 1; $('usersNext').disabled = page * 50 >= total;
      $('reportsPrevious').disabled = reportPage <= 1; $('reportsNext').disabled = reportPage * 50 >= reportTotal; }
    trialButtons();
  }
  async function runBatch(path) {
    if (busy) return;
    setBusy(true); $('batchIssues').innerHTML = '';
    let cursor = 0, counts = {};
    try {
      do {
        const data = await api(path, { desdeId: cursor }, 'POST');
        for (const result of data.resultados) {
          counts[result.resultado] = (counts[result.resultado] || 0) + 1;
          if (result.mensaje) {
            const li = document.createElement('li'); li.textContent = 'Registro #' + (result.condominoId || result.usuarioId) + (result.nombre ? ' · ' + result.nombre : '') + ': ' + result.mensaje; $('batchIssues').append(li);
          }
        }
        $('adminStatus').textContent = Object.entries(counts).map(([key, value]) => (labels[key] || key) + ': ' + value).join(' · ');
        cursor = data.siguiente;
      } while (cursor !== null);
      $('adminStatus').textContent += ' · Proceso terminado.';
      await load();
    } catch (error) { $('adminStatus').textContent = error.message; }
    finally { setBusy(false); }
  }
  async function individual(id) {
    if (busy) return;
    setBusy(true);
    try {
      const data = await api('/' + id + '/invitacion', {}, 'POST');
      $('adminStatus').textContent = data.resultados.map(r => (labels[r.resultado] || r.resultado) + (r.mensaje ? ': ' + r.mensaje : '')).join(' · ');
      await load();
    } catch (error) { $('adminStatus').textContent = error.message; }
    finally { setBusy(false); }
  }
  function edit(id) {
    const u = rows.find(r => String(r.id) === String(id)) || reports.find(r => String(r.usuarioId) === String(id))?.usuario;
    if (!u) return;
    $('editUserId').value = u.id; $('editFullName').value = name(u); $('editHouse').value = u.casaId;
    $('editUsername').value = u.nombreUsuario || u.correo || ''; $('editEmail').value = u.correo || ''; $('editPhone').value = u.telefono || '';
    $('editMessage').textContent = ''; $('editPreregistration').showModal();
  }
  $('editPreregistrationForm').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try {
      await api('/' + $('editUserId').value, { nombreCompleto: $('editFullName').value, casaId: $('editHouse').value,
        nombreUsuario: $('editUsername').value, correo: $('editEmail').value, telefono: $('editPhone').value }, 'PATCH');
      $('editPreregistration').close(); $('adminStatus').textContent = 'Prerregistro corregido. Presiona Enviar para mandar el nuevo enlace.'; await load();
    } catch (error) { $('editMessage').textContent = error.message; }
    finally { button.disabled = false; }
  });
  $('closeEdit').addEventListener('click', () => $('editPreregistration').close());
  $('createUsers').addEventListener('click', () => runBatch('/crear'));
  $('sendInvitations').addEventListener('click', () => runBatch('/invitaciones'));
  $('reloadUsers').addEventListener('click', () => load().catch(e => { $('adminStatus').textContent = e.message; }));
  $('usersPrevious').addEventListener('click', () => { if (!busy && page > 1) { page--; load().catch(e => { $('adminStatus').textContent = e.message; }); } });
  $('usersNext').addEventListener('click', () => { if (!busy && page * 50 < total) { page++; load().catch(e => { $('adminStatus').textContent = e.message; }); } });
  $('reportsPrevious').addEventListener('click', () => { if (!busy && reportPage > 1) { reportPage--; load().catch(e => { $('adminStatus').textContent = e.message; }); } });
  $('reportsNext').addEventListener('click', () => { if (!busy && reportPage * 50 < reportTotal) { reportPage++; load().catch(e => { $('adminStatus').textContent = e.message; }); } });
  try {
    // API authorization is authoritative; do not expose localStorage-only content.
    const [config, list, trials] = await Promise.all([api('/config'), api('/viviendas'), api('/prueba/viviendas')]);
    trialAvailable = trials.viviendas.length > 0;
    for (const casa of trials.viviendas) { const option = document.createElement('option'); option.value = casa.id; option.textContent = (casa.calleCorrecta || casa.calle) + ' · ' + casa.numero; $('trialHouse').append(option); }
    if (!trialAvailable) $('trialStatus').textContent = 'Primero registra una vivienda dedicada a pruebas: calle con la palabra Prueba o número TEST-001. No selecciones viviendas reales.';
    trialButtons();
    houses = list.viviendas;
    for (const casa of houses) { const option = document.createElement('option'); option.value = casa.id; option.textContent = (casa.calleCorrecta || casa.calle) + ' · ' + casa.numero; $('editHouse').append(option); }
    $('whatsappState').textContent = config.whatsappDisponible ? 'WhatsApp Business configurado. ENVIADO indica que el proveedor aceptó el mensaje; no confirma que se haya leído.' : config.mensaje;
    await load(); $('adminWorkspace').hidden = false; $('adminAccess').hidden = true;
  } catch (error) { $('adminAccess').textContent = error.message; }
})();
