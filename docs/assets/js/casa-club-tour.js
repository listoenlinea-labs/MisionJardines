/* Guía visual de Casa Club: no envía formularios ni altera reservaciones. */
(() => {
  'use strict';

  const PRIVATE_LINK = /^#(?:comprobante|mis-reservas)=/i;
  if (PRIVATE_LINK.test(window.location.hash)) return;

  const PUBLIC_KEY = 'mjCasaClubTourPublicoV1';
  const SIGNED_KEY = 'mjCasaClubTourSesionV1';
  const $ = (selector) => document.querySelector(selector);
  const isVisible = (element) => Boolean(element && element.getClientRects().length &&
    !element.closest('[hidden]') && getComputedStyle(element).visibility !== 'hidden');

  function signedIn() {
    return Boolean($('#clubTabs') && !$('#clubTabs').hidden);
  }

  function isAdmin() {
    return ['ADMINISTRADOR', 'SUPER_ADMIN'].includes(window.MJVerifiedRole);
  }

  function seenKey() {
    return signedIn() ? SIGNED_KEY : PUBLIC_KEY;
  }

  function hasSeen() {
    try { return localStorage.getItem(seenKey()) === '1'; }
    catch (_) { return false; }
  }

  function markSeen() {
    try { localStorage.setItem(seenKey(), '1'); }
    catch (_) { /* Disponible para repetir en la sesión actual. */ }
  }

  function addStep(steps, selector, title, description, side = 'bottom') {
    const element = $(selector);
    if (!isVisible(element)) return;
    steps.push({
      element,
      popover: { title, description, side, align: 'center' }
    });
  }

  function stepsForCurrentView() {
    const steps = [];
    const mobile = matchMedia('(max-width: 700px)').matches;
    const member = signedIn();
    const admin = isAdmin();
    addStep(steps, '.club-hero', 'Bienvenido a Casa Club',
      '<p>Te mostraremos cómo consultar el calendario, solicitar una fecha y dar seguimiento al pago. <strong>Esta guía es informativa: no crea ni modifica reservaciones.</strong></p>');
    addStep(steps, '#clubAvailabilityCard .legend', 'Comprende los colores',
      '<p><strong>Verde:</strong> disponible. <strong>Amarillo:</strong> apartada o en revisión. <strong>Rojo:</strong> reservada. <strong>Gris:</strong> no disponible o fecha pasada. No puedes elegir un día ocupado.</p>', 'bottom');
    addStep(steps, '.calendar-nav', 'Cambia el mes',
      '<p>Utiliza las flechas para revisar otras fechas. En el acceso público no puedes reservar hoy, fechas pasadas ni fechas fuera del periodo permitido.</p>');
    addStep(steps, '#calendarDays', 'Elige una fecha libre',
      '<p>Selecciona un <strong>día verde habilitado</strong>. Esto abre o prepara la solicitud, pero <strong>todavía no confirma la reservación</strong>. Si la disponibilidad no se puede verificar, el sistema deshabilita nuevos apartados.</p>');
    if (mobile) {
      addStep(steps, '#clubMobileSubmitArea', 'En celular: completa y guarda',
        '<p>Al tocar un día disponible se abre una ventana para capturar los datos. Indica la vivienda, tus datos y el motivo; pulsa <strong>Guardar</strong>. Después de aceptar el reglamento podrás enviar la solicitud desde esta pantalla.</p>', 'top');
    } else {
      addStep(steps, '#clubReservationCard', 'Completa la solicitud',
        member
          ? '<p>Verifica la vivienda vinculada a tu cuenta y los datos de contacto. Completa el motivo del evento y los campos requeridos antes de enviar.</p>'
          : '<p>Escribe tu calle y elige el número sugerido, después agrega nombre, teléfono de 10 dígitos, <strong>correo válido</strong>, si eres propietario y motivo del evento. En el enlace público <strong>no se autocompletan datos personales</strong>.</p>', 'left');
      addStep(steps, member ? '#clubLinkedHouse' : '#clubStreetField',
        member ? 'Vivienda de tu cuenta' : 'Selecciona tu domicilio',
        member
          ? '<p>La solicitud se asocia a la vivienda vinculada a tu cuenta. No puedes reservar en nombre de otra vivienda con esta sesión.</p>'
          : '<p>Selecciona primero la calle y luego el número correspondiente. La dirección es necesaria para comprobar los requisitos de la reservación.</p>', 'right');
      addStep(steps, '#clubEmail', 'Escribe bien tu correo',
        '<p>Utiliza un correo al que tengas acceso: ahí recibirás el folio, la información de pago y el enlace privado para enviar el comprobante y consultar tus reservaciones.</p>', 'left');
    }
    addStep(steps, '#clubRegulationsAcceptance', 'Lee y acepta el reglamento',
      '<p>Abre <strong>Leer reglamento y términos</strong>, recorre el documento hasta el final y acepta. <strong>Sin esa aceptación no puedes enviar la solicitud.</strong> La guía no sustituye la lectura del reglamento.</p>', 'bottom');
    if (!mobile) {
      addStep(steps, '#clubInstructionsOpen', 'Consulta las instrucciones de pago',
        '<p>Consulta los conceptos, el monto vigente y la cuenta oficial, pero <strong>no transfieras antes de registrar la solicitud y obtener tu folio</strong>. Utiliza el concepto que te indiquen para tu vivienda.</p>', 'top');
    }
    addStep(steps, mobile ? '#clubMobileSendRequest' : '#clubSubmit', 'Envía tu solicitud',
      admin
        ? '<p>Como administrador puedes registrar una reservación directamente. Verifica los datos antes de confirmar; aprobar una fecha <strong>no equivale a registrar un pago</strong>.</p>'
        : '<p>Cuando la fecha, los datos y el reglamento estén completos, pulsa <strong>Enviar solicitud de reservación</strong>. El día se aparta de manera provisional, sujeto a las validaciones y al plazo informado.</p>', 'top');
    addStep(steps, '#clubCalendarHint', '¿Qué llegará a tu correo?',
      '<p>Recibirás el <strong>folio</strong>, la <strong>fecha</strong>, la <strong>vivienda</strong>, el <strong>importe</strong>, los <strong>datos bancarios</strong>, el <strong>plazo</strong> y un <strong>enlace privado</strong> para adjuntar el comprobante. Si no llega, revisa spam y contacta a Administración; el envío puede fallar.</p>', 'top');
    addStep(steps, '#clubAvailabilityCard', 'Sube el comprobante desde tu enlace',
      '<p>Abre el enlace privado enviado a tu correo. Ahí verás la fecha y vivienda asociadas y podrás subir la imagen o PDF del depósito. El sistema lee el comprobante y lo contrasta con la notificación bancaria. <strong>Subirlo no confirma automáticamente el pago.</strong> No subas el mismo depósito dos veces.</p>', 'right');
    if (member) {
      addStep(steps, '[data-tab="mis-reservas"]', 'Revisa tus reservaciones',
        '<p>Con sesión iniciada, abre <strong>Mis reservas</strong> para revisar el estado de tus fechas, consultar las que siguen pendientes y cancelar cuando la opción esté habilitada. También puedes seguir la validación desde el enlace enviado a tu correo.</p>', 'bottom');
    } else {
      addStep(steps, '#clubAvailabilityCard .section-header', 'Consulta el estado por correo',
        '<p>En la liga pública no se muestran reservaciones privadas de otras viviendas. Utiliza el <strong>enlace personal recibido en tu correo</strong> para revisar tus propias solicitudes y su estado, sin iniciar sesión.</p>', 'bottom');
    }
    addStep(steps, '#clubAvailabilityCard .legend', 'Límites y condiciones',
      '<p>No puedes apartar <strong>días ocupados, pasados o deshabilitados</strong>. La vivienda debe estar al corriente en <strong>mantenimiento</strong>, no tener una restricción vigente por tarjetas rojas y cumplir el reglamento. El sistema puede rechazar la solicitud si no cumple las condiciones.</p>', 'bottom');
    addStep(steps, '.club-hero', 'Antes de terminar',
      '<p>No cambies la fecha o vivienda de un comprobante privado, no compartas ese enlace, ni consideres pagada una reserva hasta que se valide. Para aclaraciones, vencimientos y posibles devoluciones, contacta a Administración. Puedes abrir de nuevo esta guía con <strong>Guía para reservar</strong>.</p>', 'bottom');
    return steps;
  }

  function showFallback() {
    const existing = $('#clubTourFallback');
    if (existing) { existing.showModal(); return; }
    const dialog = document.createElement('dialog');
    dialog.id = 'clubTourFallback';
    dialog.className = 'club-tour-fallback';
    dialog.innerHTML = `<h2>Guía para reservar Casa Club</h2>
      <p><strong>1.</strong> Elige un día verde disponible; los días rojos, amarillos o grises no se pueden apartar.</p>
      <p><strong>2.</strong> Completa domicilio, datos de contacto, correo y motivo. En celular, pulsa Guardar tras llenar la ventana.</p>
      <p><strong>3.</strong> Lee el reglamento completo, acéptalo y envía la solicitud.</p>
      <p><strong>4.</strong> Revisa el correo: recibirás folio, importe, cuenta, fecha límite y enlace privado para subir tu comprobante y consultar el estado.</p>
      <p><strong>5.</strong> El archivo no confirma el pago: debe validarse con el banco. No se admiten fechas ocupadas o vencidas, adeudos de mantenimiento o restricciones vigentes por tarjetas rojas.</p>
      <button type="button" class="club-tour-fallback-close">Entendido</button>`;
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    document.body.append(dialog);
    dialog.showModal();
  }

  function openTour() {
    // Cambiar a Reservar solo cambia la vista. No envía formularios ni modifica fechas.
    const tab = $('[data-tab="reservar"]');
    if (signedIn() && tab && tab.getAttribute('aria-current') !== 'page') tab.click();
    const steps = stepsForCurrentView();
    if (!steps.length) return showFallback();
    markSeen();
    if (!window.driver?.js?.driver) return showFallback();
    window.driver.js.driver({
      showProgress: true,
      allowClose: true,
      disableActiveInteraction: true,
      overlayOpacity: 0.67,
      smoothScroll: true,
      stagePadding: 9,
      stageRadius: 14,
      nextBtnText: 'Siguiente',
      prevBtnText: 'Atrás',
      doneBtnText: 'Terminar',
      popoverClass: 'club-tour-popover',
      steps
    }).drive();
  }

  function init() {
    if (!$('.club-hero') || !$('#tab-reservar')) return;
    const action = document.createElement('button');
    action.type = 'button';
    action.id = 'clubTourLaunch';
    action.className = 'club-tour-launch';
    action.textContent = '✦  Guía para reservar';
    action.setAttribute('aria-label', 'Iniciar guía interactiva de reservación de Casa Club');
    const intro = $('.club-hero > div:first-child');
    (intro || $('.club-hero')).append(action);
    action.addEventListener('click', openTour);

    // En la sesión se espera a que el perfil determine si es residente o administrador.
    let hasToken = false;
    try { hasToken = Boolean(localStorage.getItem('misionJardinesToken') ||
      sessionStorage.getItem('misionJardinesToken')); }
    catch (_) { /* Un navegador puede restringir storage. */ }
    // En el portal autenticado hay un recorrido global por rol. Evitar un segundo
    // inicio automático que se superponga al tour principal del shell.
    const insidePortal = window.parent !== window &&
      new URLSearchParams(location.search).has('_mjFrame');
    setTimeout(() => {
      if (!insidePortal && !hasSeen() && isVisible($('#tab-reservar')) && !document.querySelector('dialog[open]')) {
        openTour();
      }
    }, hasToken ? 5600 : 1100);
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init, { once: true });
})();
