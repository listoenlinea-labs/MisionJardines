const API_URL = 'https://api-misionjardines.listoenlinea.host/api';
const token = localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
const PAGE_SIZE = 12; let residents = [], filteredResidents = [], houses = [], page = 1, canManage = false;
if (!token) location.replace('login.html');
const esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const norm = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function toast(m) { const e = document.getElementById('toast'); e.textContent = m; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = 'none', 3000) }
function connection(m, error = false) { const e = document.getElementById('connectionStatus'); e.textContent = m; e.classList.toggle('error', error) }
function clearSession() { ['misionJardinesToken', 'misionJardinesUsuario'].forEach(k => { localStorage.removeItem(k); sessionStorage.removeItem(k) }) }
async function api(path, options = {}) { const r = await fetch(API_URL + path, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { "Content-Type": "application/json" } : {}) } }); let d = {}; try { d = await r.json() } catch (_) { } if (r.status === 401) { clearSession(); location.replace('login.html'); throw Error('Sesión expirada') } if (!r.ok || d.ok === false) throw Error(d.message || 'No fue posible consultar el padrón'); return d }
function flatten(casas) { return (casas || []).flatMap(casa => (Array.isArray(casa.condominos) ? casa.condominos : []).map(c => ({ id: c.id, name: c.nombreCompleto || 'Sin nombre', phone: c.telefono || '', email: c.correo || '', date: c.fechaRegistro || '', active: c.activo !== false, houseId: casa.id, street: casa.calleCorrecta || casa.calle || '', number: casa.numero || '' }))) }
function fillStreets() { const s = document.getElementById('filterStreet'), selected = s.value, streets = [...new Set(residents.map(x => x.street).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es-MX', {numeric:true,sensitivity:'base'})); s.innerHTML = '<option value="">Todas las calles</option>' + streets.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join(''); if (streets.includes(selected)) s.value = selected }
function metrics() { metricResidents.textContent = residents.length; metricHomes.textContent = new Set(residents.map(x => x.houseId)).size; metricPhones.textContent = residents.filter(x => x.phone).length; metricEmails.textContent = residents.filter(x => x.email).length }
function initials(n) { return String(n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]?.toUpperCase()).join('') || 'R' }
function formatDate(v) { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(d) }
function link(type, v) { if (!v) return '—'; const safe = esc(v); return type === 'phone' ? `<a class="contact" href="tel:${safe.replace(/\s+/g, '')}">${safe}</a>` : `<a class="contact" href="mailto:${safe}">${safe}</a>` }
function applyFilters(reset = true) { const q = norm(filterText.value), street = norm(filterStreet.value), num = norm(filterNumber.value), contact = filterContact.value; filteredResidents = residents.filter(x => (!q || norm(`${x.name} ${x.phone} ${x.email}`).includes(q)) && (!street || norm(x.street) === street) && (!num || norm(x.number).includes(num)) && (!contact || (contact === 'phone' && x.phone) || (contact === 'no-phone' && !x.phone) || (contact === 'email' && x.email) || (contact === 'no-email' && !x.email))); filteredResidents.sort((a,b)=>String(a.street).localeCompare(String(b.street),'es-MX',{numeric:true,sensitivity:'base'})||String(a.number).localeCompare(String(b.number),'es-MX',{numeric:true})||String(a.name).localeCompare(String(b.name),'es-MX',{sensitivity:'base'})); if (reset) page = 1; render() }
function render() { const total = Math.max(1, Math.ceil(filteredResidents.length / PAGE_SIZE)); page = Math.min(page, total); const start = (page - 1) * PAGE_SIZE, items = filteredResidents.slice(start, start + PAGE_SIZE); residentsTable.innerHTML = items.length ? items.map(x => `<tr><td><div class="resident"><span class="avatar">${esc(initials(x.name))}</span><div><b>${esc(x.name)}</b><small>ID ${esc(x.id)}</small></div></div></td><td>${esc(x.street || '—')}</td><td><strong>${esc(x.number || '—')}</strong></td><td>${link('phone', x.phone)}</td><td>${link('email', x.email)}</td><td>${esc(formatDate(x.date))}</td><td><span class="chip">${x.active ? 'Activo' : 'Inactivo'}</span></td>${canManage ? `<td><button type="button" class="btn" data-edit-resident="${esc(x.id)}" data-house="${esc(x.houseId)}">Editar</button></td>` : ''}</tr>`).join('') : '<tr><td class="empty" colspan="8">No se encontraron residentes con los filtros seleccionados.</td></tr>'; const from = filteredResidents.length ? start + 1 : 0, to = Math.min(start + PAGE_SIZE, filteredResidents.length); paginationInfo.textContent = `Mostrando ${from}-${to} de ${filteredResidents.length} residentes`; let h = `<button class="page-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>‹</button>`; for (let p = 1; p <= total; p++)if (p === 1 || p === total || Math.abs(p - page) <= 1) h += `<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`; h += `<button class="page-btn" data-page="${page + 1}" ${page === total ? 'disabled' : ''}>›</button>`; paginationControls.innerHTML = h }
function go(p) { const total = Math.max(1, Math.ceil(filteredResidents.length / PAGE_SIZE)); page = Math.min(Math.max(p, 1), total); render() }
function clearFilters() { filterText.value = ''; filterStreet.value = ''; filterNumber.value = ''; filterContact.value = ''; applyFilters() }
function exportResidents() { if (!filteredResidents.length) return toast('No hay residentes para exportar.'); const rows = [['Nombre', 'Calle', 'Número', 'Teléfono', 'Correo', 'Fecha de registro'], ...filteredResidents.map(x => [x.name, x.street, x.number, x.phone, x.email, formatDate(x.date)])], csv = '\ufeff' + rows.map(r => r.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\n'), blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `residentes-mision-jardines-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url) }
async function validate() { try { const d = await api('/auth/perfil'), role = d.usuario?.rol?.nombre || d.usuario?.rol; canManage = ['SUPER_ADMIN', 'ADMINISTRADOR'].includes(role); document.querySelectorAll('[data-admin]').forEach(el => { el.hidden = !canManage; }); const allowed = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'SEGURIDAD']; if (!allowed.includes(role)) { toast('Tu perfil no tiene acceso al padrón completo.'); setTimeout(() => location.replace('index.html'), 1000); return false } return true } catch (e) { console.error(e); return false } }
async function loadResidents(manual = false) { connection('Consultando padrón…'); try { if (!(await validate())) return; const d = await api('/casas'); houses = d.casas || []; residents = flatten(houses); fillStreets(); const params = new URLSearchParams(location.search); if (!manual) { filterText.value = params.get('buscar') || ''; filterStreet.value = params.get('calle') || ''; filterNumber.value = params.get('numero') || ''; } metrics(); applyFilters(); connection('Conectado al padrón'); if (manual) toast('Padrón actualizado.') } catch (e) { console.error(e); residents = []; filteredResidents = []; metrics(); render(); connection('No se pudo cargar el padrón', true); toast(e.message || 'No fue posible cargar residentes.') } }

const element = id => document.getElementById(id);
const dialog = element('residentDialog');
let houseDetail = null, detailRequest = 0, savingResident = false;
function formError(message = '') {
  element('residentFormError').textContent = message;
  element('residentFormError').hidden = !message;
}
function configureMode() {
  const mode = element('residentMode').value;
  const edit = mode === 'EDITAR', change = mode === 'CAMBIO';
  element('outgoingLabel').hidden = mode === 'ALTA';
  element('outgoingResident').required = mode !== 'ALTA';
  element('residentAccountSection').hidden = !change;
  element('confirmResidentChange').required = change;
  element('confirmResidentChange').checked = false;
  element('residentContact').disabled = change;
  element('residentContact').checked = change || (!houseDetail?.residentes?.length);
  element('residentDialogTitle').textContent = change ? 'Cambio de inquilino' : edit ? 'Editar residente' : 'Nuevo residente';
  element('incomingNameLabel').textContent = change ? 'Nombre completo del nuevo inquilino' : 'Nombre completo';
  element('residentName').value = '';
  element('residentPhone').value = '';
  element('residentEmail').value = '';
  element('residentAccounts').querySelectorAll('input').forEach(input => { input.checked = false; });
  if (edit) fillResident();
  formError();
}
function fillResident() {
  if (element('residentMode').value !== 'EDITAR') return;
  const resident = houseDetail?.residentes.find(r => String(r.id) === element('outgoingResident').value);
  element('residentName').value = resident?.nombreCompleto || '';
  element('residentPhone').value = resident?.telefono || '';
  element('residentEmail').value = resident?.correo || '';
  element('residentContact').checked = !!resident && houseDetail.casa.nombre === resident.nombreCompleto;
}
async function loadHouseDetail(residentId) {
  const requestId = ++detailRequest;
  houseDetail = null;
  element('saveResident').disabled = true;
  element('residentAccounts').replaceChildren();
  formError();
  try {
    const response = await api('/casas/' + element('residentHouse').value + '/residentes');
    if (requestId !== detailRequest || !dialog.open) return;
    houseDetail = response.data;
    const casa = houseDetail.casa;
    element('residentRental').checked = !!casa.enRenta;
    element('residentNotes').value = casa.observaciones || '';
    element('outgoingResident').innerHTML = '<option value="">Selecciona un residente</option>' +
      houseDetail.residentes.map(r => `<option value="${esc(r.id)}">${esc(r.nombreCompleto)}</option>`).join('');
    if (residentId) element('outgoingResident').value = String(residentId);
    element('residentAccounts').innerHTML = houseDetail.cuentas.length ? houseDetail.cuentas.map(link => {
      const user = link.usuario || {}, eligible = user.rol?.nombre === 'CONDOMINO';
      const name = [user.nombre, user.apellidoPaterno, user.apellidoMaterno].filter(Boolean).join(' ');
      return `<label class="resident-check"><input type="checkbox" value="${esc(link.usuarioId)}" ${eligible ? '' : 'disabled'}><span>${esc(name)}<br><small>${esc(user.correo || '')} · ${esc(link.tipo)}${eligible ? '' : ' · Cuenta administrativa: se conserva'}</small></span></label>`;
    }).join('') : '<p>No hay cuentas vinculadas a esta vivienda.</p>';
    configureMode();
    element('saveResident').disabled = false;
  } catch (error) {
    if (requestId === detailRequest && dialog.open) formError(error.message);
  }
}
async function openResidentDialog(mode = 'ALTA', houseId, residentId) {
  if (!canManage || savingResident) return;
  element('residentForm').reset();
  element('residentMode').value = mode;
  element('residentHouse').innerHTML = houses.map(casa => `<option value="${esc(casa.id)}">${esc(casa.calleCorrecta || casa.calle)} ${esc(casa.numero)}</option>`).join('');
  if (!houses.length) return toast('No hay viviendas disponibles en el padrón.');
  if (houseId) element('residentHouse').value = String(houseId);
  dialog.showModal();
  configureMode();
  await loadHouseDetail(residentId);
}
function closeResidentDialog() {
  if (savingResident) return;
  ++detailRequest;
  dialog.close();
}
element('residentForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (savingResident || !houseDetail || element('saveResident').disabled) return;
  const mode = element('residentMode').value;
  const body = { modo: mode, residenteId: element('outgoingResident').value || undefined,
    nombreCompleto: element('residentName').value, telefono: element('residentPhone').value,
    correo: element('residentEmail').value, enRenta: element('residentRental').checked,
    observaciones: element('residentNotes').value, actualizarContacto: element('residentContact').checked,
    confirmarCambio: element('confirmResidentChange').checked,
    desvincularUsuarioIds: mode === 'CAMBIO' ? [...element('residentAccounts').querySelectorAll('input:checked')].map(input => input.value) : [] };
  savingResident = true;
  element('saveResident').disabled = true;
  element('saveResident').textContent = 'Guardando…';
  const controls = [...element('residentForm').elements];
  const disabledState = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  formError();
  try {
    await api('/casas/' + houseDetail.casa.id + '/residentes', { method: 'POST', body: JSON.stringify(body) });
    dialog.close();
    await loadResidents(true);
    toast(mode === 'CAMBIO' ? 'Inquilino actualizado. Se conservó el historial de la vivienda.' : 'Residente guardado.');
  } catch (error) { formError(error.message); }
  finally {
    savingResident = false;
    controls.forEach((control, i) => { control.disabled = disabledState[i]; });
    element('saveResident').disabled = false;
    element('saveResident').textContent = 'Guardar cambios';
  }
});
element('residentMode').addEventListener('change', configureMode);
element('residentHouse').addEventListener('change', () => loadHouseDetail());
element('outgoingResident').addEventListener('change', fillResident);
element('newResident').addEventListener('click', () => openResidentDialog());
element('manageHouse').addEventListener('click', () => openResidentDialog('CAMBIO'));
element('closeResidentDialog').addEventListener('click', closeResidentDialog);
element('cancelResidentDialog').addEventListener('click', closeResidentDialog);
dialog.addEventListener('cancel', event => { if (savingResident) event.preventDefault(); else ++detailRequest; });
element('refreshResidents').addEventListener('click', () => loadResidents(true));
element('exportResidents').addEventListener('click', exportResidents);
element('clearResidentsFilters').addEventListener('click', clearFilters);
element('residentsTable').addEventListener('click', event => {
  const button = event.target.closest('[data-edit-resident]');
  if (button) openResidentDialog('EDITAR', button.dataset.house, button.dataset.editResident);
});
element('paginationControls').addEventListener('click', event => {
  const button = event.target.closest('[data-page]');
  if (button && !button.disabled) go(Number(button.dataset.page));
});
['filterText', 'filterNumber'].forEach(id => element(id).addEventListener('input', () => applyFilters()));
['filterStreet', 'filterContact'].forEach(id => element(id).addEventListener('change', () => applyFilters()));
loadResidents();
