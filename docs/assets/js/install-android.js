(() => {
  'use strict';

  const button = document.getElementById('mjInstallAndroid');
  const isAndroid = navigator.userAgentData?.platform === 'Android' || /Android/i.test(navigator.userAgent);
  if (!button || !isAndroid || window.matchMedia('(display-mode: standalone)').matches) return;

  let installEvent;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installEvent = event;
    button.hidden = false;
  });

  button.addEventListener('click', async () => {
    if (!installEvent) return;
    const promptEvent = installEvent;
    // El navegador permite usar cada evento de instalación una sola vez.
    installEvent = null;
    button.hidden = true;
    try {
      await promptEvent.prompt();
    } catch {
      document.querySelector('.install-help').open = true;
    }
  });

  window.addEventListener('appinstalled', () => {
    installEvent = null;
    button.hidden = true;
  });
})();
