(() => {
  const $ = id => document.getElementById(id);
  const base = window.MJ_API_URL || 'https://api-misionjardines.listoenlinea.host/api';
  let tipoCuenta = 'CONDOMINO';
  let busy = false;

  function message(text, error = false) {
    $('registerMessage').textContent = text;
    $('registerMessage').className = 'account-message' + (error ? ' error' : '');
    $('registerMessage').hidden = false;
  }
  function setType(type) {
    if (busy) return;
    tipoCuenta = type;
    const security = type === 'SEGURIDAD';
    $('addressFields').hidden = security;
    $('addressFields').disabled = security;
    for (const [id, selected] of [['residentType', !security], ['securityType', security]]) {
      $(id).classList.toggle('selected', selected);
      $(id).setAttribute('aria-pressed', String(selected));
    }
    $('typeHint').textContent = security
      ? 'No necesitas indicar una vivienda. Administración verificará tu identidad y autorizará tu rol.'
      : 'Administración verificará tu identidad y la vivienda que indiques.';
  }
  async function submit(body) {
    let response;
    try {
      response = await fetch(base + '/auth/registro/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (error) {
      console.error('[registro] Error de conexión (sin datos personales):', error.name);
      throw Error('No fue posible conectarse al servidor. Intenta nuevamente.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      // No registrar contraseñas ni datos personales en DevTools.
      console.error('[registro] Solicitud no guardada:', { http: response.status, codigo: data.codigo || 'SIN_CODIGO' });
      throw Error(data.message || 'El servidor no pudo guardar la solicitud (HTTP ' + response.status + ').');
    }
    return data;
  }

  $('residentType').addEventListener('click', () => setType('CONDOMINO'));
  $('securityType').addEventListener('click', () => setType('SEGURIDAD'));

  $('registerForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const password = $('registerPassword').value;
    if (password !== $('confirmPassword').value) {
      message('Las contraseñas no coinciden.', true);
      $('confirmPassword').focus();
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      message('Incluye mayúscula, minúscula y número en la contraseña.', true);
      return;
    }
    const body = { ...Object.fromEntries(new FormData(event.currentTarget)), tipoCuenta };
    busy = true;
    $('registerSubmit').disabled = true;
    $('registerSubmit').textContent = 'Enviando solicitud…';
    try {
      const data = await submit(body);
      $('registerForm').hidden = true;
      $('registerMessage').hidden = true;
      $('registerSuccess').hidden = false;
      $('registerTitle').textContent = '¡Solicitud recibida!';
      $('registerSuccess').setAttribute('tabindex', '-1');
      $('registerSuccess').focus();
      $('registerForm').reset();
      message(data.message);
    } catch (error) {
      message(error.message, true);
    } finally {
      busy = false;
      $('registerSubmit').disabled = false;
      $('registerSubmit').textContent = 'Enviar solicitud de acceso →';
    }
  });
})();
