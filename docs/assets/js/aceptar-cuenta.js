(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const fromLogin = location.hash === '#desde-login';
  const token = new URLSearchParams(location.hash.slice(1)).get('invitacion') || '';
  // Fragment tokens are not sent as query parameters/referrers or persisted in storage.
  history.replaceState(null, '', location.pathname);
  const API = ['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://localhost:3000/api' : 'https://api-misionjardines.listoenlinea.host/api';
  async function api(action, body = {}) {
    const response = await fetch(API + '/auto-users/invitacion/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, token }) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw Error(result.message || 'No fue posible completar la operación.');
    return result;
  }
  if (!token && fromLogin) {
    const telefono = sessionStorage.getItem('mjTelefonoPreregistro');
    sessionStorage.removeItem('mjTelefonoPreregistro');
    $('pendingEmailAccess').hidden = false;
    $('invitationState').textContent = telefono ? 'Tu cuenta está preparada. Enviaremos el enlace a tu correo registrado.' : 'Vuelve a iniciar sesión e introduce tu teléfono para recuperar el enlace.';
    async function sendAccess() {
      if (!telefono) return;
      const button = $('resendAccessEmail'); if (button.disabled) return; button.disabled = true;
      $('invitationState').textContent = 'Enviando enlace a tu correo registrado…';
      try {
        const response = await fetch(API + '/auto-users/acceso/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telefono }), signal: AbortSignal.timeout(90000) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw Error(result.message || 'No se pudo confirmar el envío. Contacta a Administración.');
        $('invitationState').textContent = result.mensaje;
      } catch (error) { $('invitationState').textContent = error.name === 'TimeoutError' ? 'El envío tardó en responder. Revisa tu correo antes de solicitar otro enlace.' : error.message; }
      finally { button.disabled = !telefono; }
    }
    $('resendAccessEmail').disabled = !telefono;
    $('resendAccessEmail').addEventListener('click', sendAccess);
    await sendAccess(); return;
  }
  let registration, extraHouses = [];
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  try {
    const result = await api('consultar'); registration = result.registro;
    extraHouses = (registration.viviendas || []).filter(c => String(c.id) !== String(registration.casaId));
    $('additionalHouses').innerHTML = extraHouses.map(c => '<p class="address-readout"><strong>' + esc(c.calle) + ' · Casa ' + esc(c.numero) + '</strong></p>').join('');
    $('additionalConfirmations').innerHTML = extraHouses.map((c, i) => '<label>' + esc(c.calle) + ' · Introduce el número de casa<input id="confirmExtra' + i + '" required maxlength="20" autocomplete="off"></label>').join('');
    $('residentName').textContent = registration.nombre;
    $('invitationStreet').textContent = registration.calle; $('invitationHouse').textContent = registration.numero;
    $('acceptEmail').value = registration.correo; $('acceptUsername').value = registration.nombreUsuario;
    $('invitationState').textContent = 'Confirma tu vivienda y elige tu contraseña para activar tu cuenta.';
    $('acceptAccountForm').hidden = false;
  } catch (error) { $('invitationState').textContent = error.message; return; }
  $('acceptAccountForm').addEventListener('submit', event => {
    event.preventDefault(); $('acceptMessage').textContent = '';
    if ($('acceptPassword').value !== $('acceptPasswordConfirm').value) { $('acceptMessage').textContent = 'Las contraseñas no coinciden.'; return; }
    $('confirmAddressText').textContent = registration.calle + ' · Casa ' + registration.numero;
    extraHouses.forEach((_, i) => { $('confirmExtra' + i).value = ''; });
    $('confirmHouseNumber').value = ''; $('confirmMessage').textContent = ''; $('confirmAddress').showModal(); $('confirmHouseNumber').focus();
  });
  $('addressNo').addEventListener('click', () => $('confirmAddress').close());
  $('confirmAddressForm').addEventListener('submit', async event => {
    event.preventDefault(); const button = $('confirmAccount'); button.disabled = true; $('confirmMessage').textContent = '';
    try {
      const result = await api('aceptar', { nombreUsuario: $('acceptUsername').value, correo: $('acceptEmail').value,
        contrasena: $('acceptPassword').value, confirmarContrasena: $('acceptPasswordConfirm').value, numeroConfirmado: $('confirmHouseNumber').value,
        ...(registration.viviendas ? { viviendasConfirmadas: [{ id: registration.casaId, numero: $('confirmHouseNumber').value }, ...extraHouses.map((c, i) => ({ id: c.id, numero: $('confirmExtra' + i).value }))] } : {}) });
      for (const storage of [localStorage, sessionStorage]) { storage.removeItem('misionJardinesToken'); storage.removeItem('misionJardinesUsuario'); }
      sessionStorage.removeItem('mjCasaSeleccionada'); sessionStorage.removeItem('mjInvitacion');
      sessionStorage.setItem('misionJardinesToken', result.token); sessionStorage.setItem('misionJardinesUsuario', JSON.stringify(result.usuario));
      $('acceptPassword').value = $('acceptPasswordConfirm').value = '';
      // Newly accepted residents enter Inicio with their new session.
      location.replace('index.html');
    } catch (error) { $('confirmMessage').textContent = error.message; }
    finally { button.disabled = false; }
  });
  $('reportRegistrationError').addEventListener('click', () => { $('reportErrorMessage').textContent = ''; $('reportAddressError').showModal(); });
  $('cancelErrorReport').addEventListener('click', () => $('reportAddressError').close());
  $('reportAddressErrorForm').addEventListener('submit', async event => {
    event.preventDefault(); const button = $('submitErrorReport'); button.disabled = true;
    try {
      await api('reportar', { comentario: $('registrationErrorComment').value });
      $('reportAddressError').close(); $('acceptAccountForm').hidden = true;
      $('acceptPassword').value = $('acceptPasswordConfirm').value = '';
      $('invitationState').textContent = 'Tu registro está en revisión. Espera una nueva invitación.';
      $('errorReportSent').showModal();
    } catch (error) { $('reportErrorMessage').textContent = error.message; }
    finally { button.disabled = false; }
  });
  $('closeReportSent').addEventListener('click', () => $('errorReportSent').close());
})();
