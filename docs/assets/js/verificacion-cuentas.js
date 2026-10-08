(async () => {
  if (!await window.MJAccessReady) return;
  const $ = id => document.getElementById(id);
  const base = window.MJ_API_URL || 'https://api-misionjardines.listoenlinea.host/api';
  const token = localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
  let status = 'PENDIENTE', page = 1, pages = 1, active = null, saving = false, listVersion = 0, houseVersion = 0;
  const labels = { CONDOMINO: 'Condómino', SEGURIDAD: 'Seguridad', ADMINISTRADOR: 'Administrador' };
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  function message(id, text, error = false) {
    $(id).textContent = text; $(id).hidden = false; $(id).className = 'account-message' + (error ? ' error' : '');
  }
  async function api(path, method = 'GET', body) {
    const response = await fetch(base + '/auth/cuentas' + path, { method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw Error(data.message || 'No fue posible completar la operación.');
    return data;
  }
  function textElement(tag, text, className) {
    const node = document.createElement(tag); node.textContent = text;
    if (className) node.className = className; return node;
  }
  const fullName = user => [user?.nombre, user?.apellidoPaterno, user?.apellidoMaterno].filter(Boolean).join(' ') || 'Cuenta no disponible';
  const date = value => value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  function card(item) {
    const node = document.createElement('article'); node.className = 'request-card' + (item.tipoCuenta === 'SEGURIDAD' ? ' security' : '');
    const top = document.createElement('div'); top.className = 'request-top';
    const initials = [item.usuario?.nombre?.[0], item.usuario?.apellidoPaterno?.[0]].filter(Boolean).join('') || '?';
    top.append(textElement('span', initials, 'request-avatar'));
    const identity = document.createElement('div'); identity.append(textElement('h2', fullName(item.usuario)), textElement('p', item.usuario?.correo || '—', 'request-email'));
    top.append(identity); node.append(top, textElement('span', 'Solicita: ' + labels[item.tipoCuenta], 'request-badge'));
    const details = document.createElement('div'); details.className = 'request-details';
    for (const [label, value] of [['Domicilio', item.tipoCuenta === 'SEGURIDAD' ? 'Personal de seguridad · Sin vivienda' : [item.calle, item.numeroCasa].filter(Boolean).join(' ')],
      ['Teléfono', item.usuario?.telefono || 'No proporcionado'], ['Correo', 'Declarado · sin verificación automática'], ['Solicitada', date(item.creadoEn)]]) {
      const p = document.createElement('p'); p.append(textElement('strong', label + ': '), document.createTextNode(value || '—')); details.append(p);
    }
    if (item.estatus !== 'PENDIENTE') {
      const descripcion = item.estatus === 'APROBADA' ? 'Rol asignado: ' + (labels[item.rolAsignado] || item.rolAsignado)
        : item.estatus === 'REVOCADA' ? 'Aprobación histórica · rol: ' + (labels[item.rolAsignado] || item.rolAsignado || 'No indicado')
        : 'Solicitud rechazada';
      details.append(textElement('p', descripcion + ' · ' + date(item.revisadoEn)));
      details.append(textElement('p', 'Revisó: ' + fullName(item.revisadoPor)));
      if (item.comentarioRevision) details.append(textElement('p', item.comentarioRevision));
    }
    node.append(details);
    if(item.estatus==='APROBADA' && item.usuario?.estatus==='ACTIVO'){
      const button=textElement('button','Revocar acceso y credenciales','revoke-access');
      button.type='button';
      button.addEventListener('click',async()=>{
        if(!confirm('¿Desactivar permanentemente el acceso de '+fullName(item.usuario)+'? Se cerrarán sus permisos y no podrá volver a iniciar sesión. Se conservarán sus pagos y reservas históricas.'))return;
        if(!confirm('Confirma nuevamente: ¿revocar acceso de '+fullName(item.usuario)+'?'))return;
        button.disabled=true;
        try{const response=await api('/'+Number(item.id)+'/revocar','PATCH',{});message('reviewMessage',response.message);await load();}
        catch(error){message('reviewMessage',error.message,true);button.disabled=false;}
      });
      node.append(button);
    }else if(item.estatus==='REVOCADA'){
      node.append(textElement('span','Cuenta eliminada · acceso revocado','revoked-label'));
      if(item.usuario?.estatus==='PENDIENTE')node.append(textElement('p','La persona envió otra solicitud; revísala en Pendientes.','revoked-history-note'));
      if(item.usuario?.estatus==='ACTIVO')node.append(textElement('p','La persona fue autorizada nuevamente en una solicitud posterior.','revoked-history-note'));
    }else if(item.estatus==='APROBADA' && item.usuario?.estatus!=='ACTIVO'){
      node.append(textElement('span','Cuenta inactiva','revoked-label'));
    }
    if (item.estatus === 'PENDIENTE' && item.usuario) {
      const button = textElement('button', 'Revisar solicitud →', 'account-button secondary'); button.type = 'button';
      button.addEventListener('click', () => open(item)); node.append(button);
    }
    return node;
  }
  async function load() {
    const version = ++listVersion; $('requestList').setAttribute('aria-busy', 'true'); $('refreshAccounts').disabled = true;
    $('previousPage').disabled = true; $('nextPage').disabled = true;
    try {
      const query=new URLSearchParams({estatus:status,pagina:String(page),nombre:$('accountSearchName').value.trim(),calle:$('accountSearchStreet').value.trim(),numero:$('accountSearchHouse').value.trim()});
      const data = await api('?'+query.toString());
      if (version !== listVersion) return;
      pages = data.paginas; $('reviewCount').textContent = data.total + ' solicitud(es)';
      $('requestList').replaceChildren(...data.solicitudes.map(card));
      if (!data.solicitudes.length) {
        const empty = document.createElement('div'); empty.className = 'review-empty';
        empty.append(textElement('strong', status === 'PENDIENTE' ? 'Todo al día' : 'Sin solicitudes en este estado'), textElement('p', status === 'PENDIENTE' ? 'Aquí aparecerán las cuentas nuevas apenas envíen su solicitud.' : 'Las revisiones quedarán guardadas aquí.'));
        $('requestList').append(empty);
      }
      $('pageLabel').textContent = 'Página ' + page + ' de ' + pages;
      $('previousPage').disabled = page <= 1; $('nextPage').disabled = page >= pages;
    } catch (error) {
      if (version !== listVersion) return;
      $('requestList').replaceChildren(textElement('p', 'No fue posible cargar la lista. Usa Actualizar para reintentar.', 'review-empty'));
      message('reviewMessage', error.message, true);
    } finally {
      if (version === listVersion) { $('refreshAccounts').disabled = false; $('requestList').setAttribute('aria-busy', 'false'); }
    }
  }
  function roleChanged() {
    const security = $('assignedRole').value === 'SEGURIDAD';
    $('houseAssignment').hidden = security;
    $('verifiedHouse').required = $('assignedRole').value === 'CONDOMINO';
    $('identityConfirmed').checked = false;
  }
  async function searchHouses() {
    const version = ++houseVersion, item = active;
    $('searchHouse').disabled = true;
    try {
      const data = await api('/viviendas?q=' + encodeURIComponent($('houseQuery').value.trim()));
      if (version !== houseVersion || active !== item || !$('reviewDialog').open) return;
      const previous = $('verifiedHouse').value;
      $('verifiedHouse').replaceChildren(new Option(data.viviendas.length ? 'Selecciona una vivienda…' : 'Sin coincidencias. Prueba otra búsqueda.', ''));
      for (const house of data.viviendas) $('verifiedHouse').append(new Option(house.calle + ' · ' + house.numero, house.id));
      const suggested = data.viviendas.find(house => String(house.id) === String(item.casaSugeridaId) ||
        (normalize(house.calle) === normalize(item.calle) && normalize(house.numero) === normalize(item.numeroCasa)));
      if (data.viviendas.some(house => String(house.id) === previous)) $('verifiedHouse').value = previous;
      else if (suggested) $('verifiedHouse').value = String(suggested.id);
      $('identityConfirmed').checked = false;
    } catch (error) { if (version === houseVersion && active === item) message('dialogMessage', error.message, true); }
    finally { if (version === houseVersion) $('searchHouse').disabled = false; }
  }
  function open(item) {
    if (saving) return;
    active = item; $('approvalForm').reset(); $('dialogMessage').hidden = true;
    $('assignedRole').value = item.tipoCuenta; $('houseQuery').value = item.calle || '';
    $('verifiedHouse').replaceChildren(new Option('Selecciona una vivienda…', ''));
    $('reviewPerson').replaceChildren(textElement('strong', fullName(item.usuario)), textElement('div', item.usuario.correo),
      textElement('div', item.tipoCuenta === 'SEGURIDAD' ? 'Solicita acceso como personal de seguridad.' : 'Domicilio declarado: ' + item.calle + ' · ' + item.numeroCasa));
    roleChanged(); $('reviewDialog').showModal();
    if (item.tipoCuenta !== 'SEGURIDAD') void searchHouses();
  }
  async function review(action) {
    if (saving || !active) return;
    const comentario = $('reviewComment').value.trim();
    if (action === 'RECHAZAR' && !comentario) { message('dialogMessage', 'Indica el motivo del rechazo.', true); $('reviewComment').focus(); return; }
    if (action === 'APROBAR' && !$('identityConfirmed').checked) { message('dialogMessage', 'Confirma que verificaste la identidad antes de dar acceso.', true); return; }
    if (action === 'APROBAR' && !$('approvalForm').reportValidity()) return;
    if (action === 'RECHAZAR' && !confirm('¿Rechazar esta solicitud y mantener la cuenta sin acceso?')) return;
    if (action === 'APROBAR' && $('assignedRole').value === 'ADMINISTRADOR' && !confirm('Esta cuenta podrá administrar el sistema y aprobar otras cuentas. ¿Confirmas el rol de administrador?')) return;
    const body = { accion: action, rol: $('assignedRole').value, casaId: $('assignedRole').value === 'SEGURIDAD' ? null : ($('verifiedHouse').value || null),
      identidadVerificada: $('identityConfirmed').checked, comentario };
    saving = true;
    for (const id of ['approveAccount', 'rejectAccount', 'closeReview', 'searchHouse']) $(id).disabled = true;
    try {
      const data = await api('/' + active.id, 'PATCH', body);
      $('reviewDialog').close(); active = null; page = 1;
      message('reviewMessage', data.message); await load();
    } catch (error) { message('dialogMessage', error.message, true); }
    finally { saving = false; for (const id of ['approveAccount', 'rejectAccount', 'closeReview', 'searchHouse']) $(id).disabled = false; }
  }
  $('approvalForm').addEventListener('submit', event => { event.preventDefault(); void review('APROBAR'); });
  $('rejectAccount').addEventListener('click', () => void review('RECHAZAR'));
  $('closeReview').addEventListener('click', () => { if (!saving) $('reviewDialog').close(); });
  $('reviewDialog').addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  $('reviewDialog').addEventListener('close', () => { active = null; houseVersion++; $('searchHouse').disabled = false; });
  $('assignedRole').addEventListener('change', roleChanged);
  $('verifiedHouse').addEventListener('change', () => { $('identityConfirmed').checked = false; });
  $('searchHouse').addEventListener('click', () => void searchHouses());
  $('houseQuery').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void searchHouses(); } });
  let searchTimer;
  for(const id of ['accountSearchName','accountSearchStreet','accountSearchHouse']){
    $(id).addEventListener('input',()=>{
      clearTimeout(searchTimer);
      searchTimer=setTimeout(()=>{page=1;void load()},280);
    });
  }
  $('clearAccountSearch').addEventListener('click',()=>{
    ['accountSearchName','accountSearchStreet','accountSearchHouse'].forEach(id=>$(id).value='');
    page=1;void load();
  });
  $('refreshAccounts').addEventListener('click', () => void load());
  for (const button of document.querySelectorAll('[data-status]')) button.addEventListener('click', () => {
    status = button.dataset.status; page = 1; $('reviewMessage').hidden = true;
    for (const tab of document.querySelectorAll('[data-status]')) tab.setAttribute('aria-pressed', String(tab === button));
    void load();
  });
  $('previousPage').addEventListener('click', () => { if (page > 1) { page--; void load(); } });
  $('nextPage').addEventListener('click', () => { if (page < pages) { page++; void load(); } });
  await load();
  // Refresca solicitudes en espera sin interferir con el formulario de revisión.
  if (typeof setInterval === 'function') setInterval(() => {
    if (status === 'PENDIENTE' && !$('reviewDialog').open && !document.hidden) void load();
  }, 30000);
})();
