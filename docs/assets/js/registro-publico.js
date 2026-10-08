(() => {
  'use strict';
  const API = 'https://api-misionjardines.listoenlinea.host/api';
  const $ = id => document.getElementById(id);
  let security = false, currentEmail = '';
  let houses = [];
  const showMessage = (message, bad = false) => {
    $('message').textContent = message;
    $('message').classList.toggle('error', bad);
    $('message').hidden = false;
  };
  async function api(path, body) {
    const response = await fetch(API + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) throw Error(json.message || 'No fue posible completar la solicitud.');
    return json;
  }
  function fillOptions(element, items, initial) {
    element.replaceChildren(new Option(initial, ''));
    for (const item of items) element.add(new Option(item.label, item.value));
  }
  async function loadHouses() {
    try {
      const result = await api('/auth/registro-publico/viviendas');
      houses = result.casas || [];
      const streets = [...new Set(houses.map(h => h.calle))].sort((a, b) => a.localeCompare(b, 'es'));
      fillOptions($('street'), streets.map(s => ({ label:s, value:s })), 'Selecciona tu calle');
    } catch (error) { showMessage('No fue posible cargar las viviendas: ' + error.message, true); }
  }
  $('street').addEventListener('change', () => {
    const found = houses.filter(h => h.calle === $('street').value).sort((a, b) =>
      String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true }));
    fillOptions($('house'), found.map(h => ({ label:'Casa ' + h.numero, value:h.id })), 'Selecciona tu casa');
    $('house').disabled = !found.length;
  });
  $('securityToggle').addEventListener('click', () => {
    security = !security;
    $('securityToggle').setAttribute('aria-pressed', String(security));
    $('securityState').textContent = security ? 'Sí' : 'No';
    $('houseFields').hidden = security;
    $('street').required = !security;
    $('house').required = !security;
  });
  $('registration').addEventListener('submit', async event => {
    event.preventDefault();
    if ($('confirmation').value !== $('registration').elements.contrasena.value) {
      return showMessage('Las contraseñas deben coincidir.', true);
    }
    const button = $('registerButton');
    button.disabled = true;
    $('message').hidden = true;
    try {
      const form = Object.fromEntries(new FormData(event.currentTarget));
      const result = await api('/auth/registro-publico/solicitar', {
        ...form, casaId: security ? null : Number($('house').value), esSeguridad: security
      });
      currentEmail = form.correo.trim().toLowerCase();
      $('verifyEmail').textContent = currentEmail;
      $('registration').hidden = true;
      $('verifyForm').hidden = false;
      $('verificationCode').focus();
      showMessage(result.message);
    } catch (error) { showMessage(error.message, true); }
    finally { button.disabled = false; }
  });
  $('verifyForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('verifyButton');
    button.disabled = true;
    try {
      const result = await api('/auth/registro-publico/verificar', {
        correo: currentEmail, codigo: $('verificationCode').value.trim()
      });
      $('verifyForm').hidden = true;
      showMessage(result.message);
    } catch (error) { showMessage(error.message, true); }
    finally { button.disabled = false; }
  });
  loadHouses();
})();
