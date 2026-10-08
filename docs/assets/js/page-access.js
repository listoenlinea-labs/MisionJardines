(() => {
  // Capture house context per document so changing it never retargets an in-flight payment.
  const selected = sessionStorage.getItem('mjCasaSeleccionada');
  const nativeFetch = window.fetch.bind(window);
  const api = new URL(window.MJ_API_URL || 'https://api-misionjardines.listoenlinea.host/api');
  const currentPage = location.pathname.split('/').pop();
  window.fetch = (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input,location.href);
    if (url.origin === api.origin && url.pathname.startsWith(api.pathname+'/') && selected &&
        !(['viviendas.html','cuenta.html','verificacion-cuentas.html'].includes(currentPage) && url.pathname.endsWith('/auth/perfil'))) {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('X-Casa-Id',selected); init = {...init,headers};
    }
    return nativeFetch(input,init);
  };
})();
(() => {
  const style = document.createElement('style');
  style.textContent = 'html:not([data-mj-authorized]) body{visibility:hidden!important}[data-mj-denied]{display:none!important}';
  document.head.appendChild(style);
  const token = localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
  const page = location.pathname.split('/').pop() || 'index.html';
  window.MJAccessReady = (async () => {
    if (!token) { location.replace('login.html'); return false; }
    try {
      const response = await fetch((window.MJ_API_URL || 'https://api-misionjardines.listoenlinea.host/api') + '/auth/perfil', {headers:{Authorization:'Bearer '+token}});
      if (response.status === 403 && sessionStorage.getItem('mjCasaSeleccionada') && !['cuenta.html','viviendas.html','verificacion-cuentas.html'].includes(page)) {
        sessionStorage.removeItem('mjCasaSeleccionada'); location.replace('viviendas.html'); return false;
      }
      if (!response.ok) throw new Error('No fue posible verificar tu sesión.');
      const data = await response.json();
      const user = data.usuario;
      const role = user?.rol?.nombre || user?.rol;
      if (!data.ok || !role || !MJPermissions.canAccess(role,'cuenta.html')) throw new Error('Sesión inválida.');
      for (const storage of [localStorage, sessionStorage]) {
        if (storage.getItem('misionJardinesToken') === token) storage.setItem('misionJardinesUsuario',JSON.stringify(user));
      }
      if (!MJPermissions.canAccess(role,page)) { location.replace(MJPermissions.landing(role)); return false; }
      window.MJVerifiedRole = role;
      function filterLinks() {
        document.querySelectorAll('a[href]').forEach(link => {
          const url = new URL(link.href,location.href);
          const target = url.pathname.split('/').pop() || 'index.html';
          if (url.origin === location.origin && MJPermissions.pages.includes(target)) {
            if (!MJPermissions.canAccess(role,target)) link.setAttribute('data-mj-denied','');
            else link.removeAttribute('data-mj-denied');
          }
        });
      }
      filterLinks();
      new MutationObserver(filterLinks).observe(document.documentElement,{childList:true,subtree:true});
      document.documentElement.dataset.mjAuthorized = 'true';
      return true;
    } catch (error) {
      document.addEventListener('DOMContentLoaded', showError, {once:true});
      if (document.readyState !== 'loading') showError();
      function showError() {
        document.body.replaceChildren();
        const message = document.createElement('p'); message.textContent = 'No se pudo verificar tu acceso. Recarga la página o inicia sesión nuevamente.';
        const link = document.createElement('a'); link.href='login.html'; link.textContent='Iniciar sesión';
        document.body.append(message,link); document.documentElement.dataset.mjAuthorized='true';
      }
      return false;
    }
  })();
})();
