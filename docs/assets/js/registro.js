(() => {
  const $ = id => document.getElementById(id);
  const base = window.MJ_API_URL || 'https://api-misionjardines.listoenlinea.host/api';
  let tipoCuenta = 'CONDOMINO', correo = '', busy = false;
  const message = (text, error = false) => {
    $('registerMessage').textContent = text;
    $('registerMessage').className = 'account-message' + (error ? ' error' : '');
    $('registerMessage').hidden = false;
  };
  function setType(type) {
    if (busy) return;
    tipoCuenta = type;
    const security = type === 'SEGURIDAD';
    $('addressFields').hidden = security;
    $('addressFields').disabled = security;
    for (const [id, selected] of [['residentType', !security], ['securityType', security]]) {
      $(id).classList.toggle('selected', selected); $(id).setAttribute('aria-pressed', String(selected));
    }
    $('typeHint').textContent = security ? 'No necesitas indicar una vivienda. Solo Administración puede asignarte el rol de seguridad.' : 'Administración verificará tu identidad y la vivienda que indiques.';
  }
  async function api(path, body) {
    let response;
    try {
      response = await fetch(base + '/auth/registro/' + path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
    } catch (error) {
      console.error('[Registro Misión Jardines] No se pudo conectar al servidor:', { ruta: path, motivo: error.message });
      throw Error('No fue posible conectarse al servidor. Comprueba tu conexión e intenta nuevamente.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      // Deliberadamente no registra correo, contraseña ni código de verificación.
      console.error('[Registro Misión Jardines] Falló la solicitud:', {
        ruta: path, estadoHTTP: response.status, codigo: data.codigo || 'ERROR_NO_CLASIFICADO'
      });
      throw Error(data.message || 'El servidor no pudo completar el registro (HTTP ' + response.status + ').');
    }
    return data;
  }
  $('residentType').addEventListener('click', () => setType('CONDOMINO'));
  $('securityType').addEventListener('click', () => setType('SEGURIDAD'));
  $('registerForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const password = $('registerPassword').value;
    if (password !== $('confirmPassword').value) { message('Las contraseñas no coinciden.', true); $('confirmPassword').focus(); return; }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) { message('Incluye mayúscula, minúscula y número en la contraseña.', true); return; }
    const body = { ...Object.fromEntries(new FormData(event.target)), tipoCuenta };
    busy = true; $('registerSubmit').disabled = true; $('registerSubmit').textContent = 'Enviando código…';
    try {
      const data = await api('solicitar', body); correo = data.correo;
      $('verificationEmail').textContent = correo;
      $('registerForm').hidden = true; $('verifyForm').hidden = false;
      $('registerPassword').value = ''; $('confirmPassword').value = '';
      message(data.message); $('emailCode').focus();
    } catch (error) { message(error.message, true); }
    finally { busy = false; $('registerSubmit').disabled = false; $('registerSubmit').textContent = 'Continuar y verificar correo →'; }
  });
  $('verifyForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    busy = true; $('verifySubmit').disabled = true; $('restartRegistration').disabled = true;
    try {
      await api('verificar', { correo, codigo: $('emailCode').value });
      $('verifyForm').hidden = true; $('registerMessage').hidden = true;
      $('registerSuccess').hidden = false; $('registerTitle').textContent = '¡Gracias por registrarte!';
      $('registerSuccess').setAttribute('tabindex', '-1'); $('registerSuccess').focus();
      $('registerForm').reset(); $('emailCode').value = '';
    } catch (error) { message(error.message, true); }
    finally { busy = false; $('verifySubmit').disabled = false; $('restartRegistration').disabled = false; }
  });
  $('restartRegistration').addEventListener('click', () => {
    if (busy) return;
    $('verifyForm').hidden = true; $('registerForm').hidden = false; $('registerMessage').hidden = true;
    $('emailCode').value = ''; $('registerPassword').focus();
  });
})();
