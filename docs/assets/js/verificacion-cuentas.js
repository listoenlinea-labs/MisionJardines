(() => {
  'use strict';
  const API = 'https://api-misionjardines.listoenlinea.host/api';
  const $ = id => document.getElementById(id);
  const token = localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
  const role = () => {
    try {
      const user = JSON.parse(localStorage.getItem('misionJardinesUsuario') || sessionStorage.getItem('misionJardinesUsuario') || '{}');
      return user.rol?.nombre || user.rol || '';
    } catch (_) { return ''; }
  };
  if (!token || !['SUPER_ADMIN', 'ADMINISTRADOR'].includes(role())) {
    location.replace('login.html');
    return;
  }
  const notice = (msg, error = false) => {
    $('notice').textContent = msg;
    $('notice').style.background = error ? '#fff4f4' : '#f1faf4';
    $('notice').style.color = error ? '#a44a4a' : '#336b4b';
    $('notice').hidden = false;
  };
  async function api(path, body, method) {
    const response = await fetch(API + path, {
      method: method || 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      location.replace('login.html'); throw Error('Sesión expirada');
    }
    if (!response.ok || !result.ok) throw Error(result.message || 'Error al consultar la información');
    return result;
  }
  const text = (tag, value, className) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = value == null ? '' : String(value);
    return el;
  };
  const field = (label, value) => {
    const wrapper = document.createElement('div');
    wrapper.append(text('small', label), text('strong', value || '—'));
    return wrapper;
  };
  let houses = [];
  function houseSelect(value) {
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Vivienda confirmada');
    const first = new Option('Selecciona vivienda', '');
    select.add(first);
    for (const house of houses) select.add(new Option(house.calle + ' · Casa ' + house.numero, String(house.id)));
    if (value) select.value = String(value);
    return select;
  }
  function card(s) {
    const article = text('article', '', 'card');
    const user = s.usuario || {};
    const name = [user.nombre,user.apellidoPaterno,user.apellidoMaterno].filter(Boolean).join(' ') || 'Usuario sin datos';
    const header = text('div', '', 'card-top');
    const about = text('div', '');
    about.append(text('h2', name), text('span', user.correo, 'email'));
    header.append(about, text('span', 'Pendiente', 'badge'));
    article.append(header);
    const meta = text('div', '', 'meta');
    meta.append(
      field('Solicitud', s.tipoSolicitado === 'SEGURIDAD' ? 'Personal de seguridad' : 'Residente'),
      field('Vivienda solicitada', s.casa ? s.casa.calle + ' · Casa ' + s.casa.numero : 'No aplica'),
      field('Teléfono', user.telefono || 'No proporcionado'),
      field('Padrón de la vivienda', (s.padron || []).join(', ') || s.casa?.nombre || 'Sin coincidencia en padrón'),
      field('Fecha de solicitud', s.creadoEn ? new Date(s.creadoEn).toLocaleString('es-MX') : '—')
    );
    article.append(meta);
    const formrow = text('div', '', 'formrow');
    const roleLabel = text('label', 'Rol a conceder');
    const roleSelect = document.createElement('select');
    roleSelect.setAttribute('aria-label', 'Rol asignado por administración');
    for (const [value, label] of [['CONDOMINO','Condómino'],['SEGURIDAD','Seguridad'],['ADMINISTRADOR','Administrador']]) roleSelect.add(new Option(label,value));
    roleSelect.value = s.tipoSolicitado === 'SEGURIDAD' ? 'SEGURIDAD' : 'CONDOMINO';
    roleLabel.append(roleSelect);
    const houseLabel = text('label', 'Casa confirmada');
    const selectHouse = houseSelect(s.casaId);
    houseLabel.append(selectHouse);
    formrow.append(roleLabel, houseLabel);
    article.append(formrow);
    const updateHouse = () => {
      houseLabel.hidden = roleSelect.value !== 'CONDOMINO';
    };
    roleSelect.addEventListener('change', updateHouse);
    updateHouse();
    const notesLabel = text('label', 'Observaciones de revisión', 'notes');
    const textarea = document.createElement('textarea');
    textarea.maxLength = 600;
    textarea.placeholder = 'Motivo o evidencia de la revisión (opcional)';
    notesLabel.append(textarea); article.append(notesLabel);
    const actions = text('div', '', 'actions');
    const reject = text('button', 'Rechazar', 'reject');
    reject.type = 'button';
    const approve = text('button', 'Aprobar cuenta', 'approve');
    approve.type = 'button';
    actions.append(reject,approve);article.append(actions);
    async function act(accion) {
      if (accion === 'APROBAR' && roleSelect.value === 'CONDOMINO' && !selectHouse.value) {
        notice('Confirma primero la vivienda del condómino.', true);return;
      }
      const verb = accion === 'APROBAR' ? 'aprobar' : 'rechazar';
      if (!confirm('¿Confirmas ' + verb + ' la cuenta de ' + name + '? ' +
        (accion === 'APROBAR' ? 'Se concederá el rol ' + roleSelect.value + '.' : 'No podrá iniciar sesión.'))) return;
      approve.disabled = reject.disabled = true;
      try {
        const result = await api('/auth/registro-publico/solicitudes/' + Number(s.id), {
          accion, rol: roleSelect.value,
          casaId: roleSelect.value === 'CONDOMINO' ? Number(selectHouse.value) : null,
          comentario: textarea.value
        }, 'PATCH');
        notice(result.message);
        await load();
      } catch(error) { notice(error.message,true); approve.disabled = reject.disabled = false; }
    }
    approve.addEventListener('click', () => act('APROBAR'));
    reject.addEventListener('click', () => act('RECHAZAR'));
    return article;
  }
  async function load() {
    $('refresh').disabled = true;
    try {
      const [requests, options] = await Promise.all([
        api('/auth/registro-publico/solicitudes'),
        api('/auth/registro-publico/viviendas')
      ]);
      houses = options.casas || [];
      const pending = requests.solicitudes || [];
      $('count').textContent = pending.length + ' solicitudes pendientes';
      $('requests').replaceChildren(...pending.map(card));
      if (!pending.length) $('requests').append(text('div', 'No hay cuentas pendientes de revisión.', 'empty'));
    } catch (error) { notice(error.message, true); }
    finally { $('refresh').disabled = false; }
  }
  $('refresh').addEventListener('click', load);
  load();
})();
