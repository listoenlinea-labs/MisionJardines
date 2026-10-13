(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
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
  let registration;
  try {
    const result = await api('consultar'); registration = result.registro;
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
    $('confirmHouseNumber').value = ''; $('confirmMessage').textContent = ''; $('confirmAddress').showModal(); $('confirmHouseNumber').focus();
  });
  $('addressNo').addEventListener('click', () => $('confirmAddress').close());
  $('confirmAddressForm').addEventListener('submit', async event => {
    event.preventDefault(); const button = $('confirmAccount'); button.disabled = true; $('confirmMessage').textContent = '';
    try {
      const result = await api('aceptar', { nombreUsuario: $('acceptUsername').value, correo: $('acceptEmail').value,
        contrasena: $('acceptPassword').value, confirmarContrasena: $('acceptPasswordConfirm').value, numeroConfirmado: $('confirmHouseNumber').value });
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
