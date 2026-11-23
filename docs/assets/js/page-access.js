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
      // En el iframe del portal, evitar repetir la consulta de perfil que el
      // padre ya verificó. Directo y en sesiones expiradas: consulta normal.
      const fromShell = (() => {
        if (window.parent === window || new URLSearchParams(location.search).get('_mjFrame') !== '1') return null;
        try {
          if (window.parent.location.origin !== location.origin || !window.parent.MJ_SHELL_MODE) return null;
          const current = window.parent.MJShellVerifiedSession;
          return current?.token === token &&
            current.houseId === (sessionStorage.getItem('mjCasaSeleccionada') || '') &&
            (!(sessionStorage.getItem('mjCasaSeleccionada')) ||
              Number(current.user?.casaId) === Number(sessionStorage.getItem('mjCasaSeleccionada'))) &&
            Date.now() - current.verifiedAt < 60000 ? current.user : null;
        } catch (_) { return null; }
      })();
      let user = fromShell;
      if (!user) {
        const response = await fetch((window.MJ_API_URL || 'https://api-misionjardines.listoenlinea.host/api') + '/auth/perfil', {headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if (response.status === 403 && sessionStorage.getItem('mjCasaSeleccionada') && !['cuenta.html','viviendas.html','verificacion-cuentas.html'].includes(page)) {
        sessionStorage.removeItem('mjCasaSeleccionada');
        let roleAnterior = '';
        try { const almacenado = localStorage.getItem('misionJardinesUsuario') || sessionStorage.getItem('misionJardinesUsuario'); const previo = JSON.parse(almacenado || 'null'); roleAnterior = previo?.rol?.nombre || previo?.rol || ''; } catch (_) {}
        location.replace(roleAnterior === 'CONDOMINO' ? 'pagos.html' : 'viviendas.html'); return false;
      }
      if (!response.ok) throw new Error('No fue posible verificar tu sesión.');
        const data = await response.json();
        if (!data.ok) throw new Error('Sesión inválida.');
        user = data.usuario;
        // Solo reutilizar un perfil comprobado del mismo contexto de casa.
        if (window.parent !== window && new URLSearchParams(location.search).get('_mjFrame') === '1') {
          try {
            if (window.parent.MJ_SHELL_MODE && window.parent.location.origin === location.origin) {
              window.parent.MJShellVerifiedSession = {
                token, user, houseId: sessionStorage.getItem('mjCasaSeleccionada') || '',
                verifiedAt: Date.now()
              };
            }
          } catch (_) { /* Sin acceso al padre */ }
        }
      }
      const role = user?.rol?.nombre || user?.rol;
      if (!role || !MJPermissions.canAccess(role,MJPermissions.landing(role))) throw new Error('Sesión inválida.');
      window.MJVerifiedUser = user;
      for (const storage of [localStorage, sessionStorage]) {
        if (storage.getItem('misionJardinesToken') === token) storage.setItem('misionJardinesUsuario',JSON.stringify(user));
      }
      if (!MJPermissions.canAccess(role,page)) { location.replace(MJPermissions.landing(role)); return false; }
      window.MJVerifiedRole = role;
      if (role === 'SEGURIDAD') sessionStorage.removeItem('mjCasaSeleccionada');
      function filterLink(link) {
        const url = new URL(link.href,location.href);
        const target = url.pathname.split('/').pop() || 'index.html';
        if (url.origin === location.origin && MJPermissions.pages.includes(target)) {
          if (!MJPermissions.canAccess(role,target)) link.setAttribute('data-mj-denied','');
          else link.removeAttribute('data-mj-denied');
        }
      }
      function filterLinks(){document.querySelectorAll('a[href]').forEach(filterLink);}
      filterLinks();
      // Solo revisar los enlaces agregados. La observación anterior recorría
      // TODA la página en cada mutación, incluso tablas grandes de Finanzas.
      const linkNodes = new Set();
      let linkUpdateQueued = false;
      new MutationObserver(mutations=>{
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) if (node.nodeType===1) linkNodes.add(node);
        }
        if (!linkNodes.size || linkUpdateQueued) return;
        linkUpdateQueued=true;
        requestAnimationFrame(()=>{
          linkUpdateQueued=false;
          for(const root of linkNodes){
            if(root.matches?.('a[href]'))filterLink(root);
            root.querySelectorAll?.('a[href]').forEach(filterLink);
          }
          linkNodes.clear();
        });
      }).observe(document.documentElement,{childList:true,subtree:true});
      document.documentElement.dataset.mjAuthorized = 'true';
      const notifyShellReady = () => {
        if (window.parent===window || new URLSearchParams(location.search).get('_mjFrame')!=='1') return;
        try{
          if (window.parent.location.origin===location.origin)
            window.parent.postMessage({type:'MJ_SHELL_READY',page},location.origin);
        }catch(_) {}
      };
      if(document.readyState==='loading')
        document.addEventListener('DOMContentLoaded',notifyShellReady,{once:true});
      else notifyShellReady();
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
