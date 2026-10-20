        const API_URL =
            ['localhost', '127.0.0.1'].includes(window.location.hostname)
                ? 'http://localhost:3000/api'
                : 'https://api-misionjardines.listoenlinea.host/api';
        const portal = role => 'app.html?page=' + encodeURIComponent(MJPermissions.landing(role));
        const loginForm = document.getElementById("loginForm"), correoInput = document.getElementById("correo"), contrasenaInput = document.getElementById("contrasena"), passwordToggle = document.getElementById("passwordToggle"), loginButton = document.getElementById("loginButton"), buttonText = document.getElementById("buttonText"), loginMessage = document.getElementById("loginMessage"), messageIcon = document.getElementById("messageIcon"), messageTitle = document.getElementById("messageTitle"), messageText = document.getElementById("messageText");
        const iconoOjoCerrado = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 3l18 18"></path>
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path>
        <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9.5 5 9.5 5a17.6 17.6 0 0 1-2.1 2.6"></path>
        <path d="M6.6 6.6C4 8.2 2.5 12 2.5 12s4 5 9.5 5a10.6 10.6 0 0 0 4.1-.8"></path>
    </svg>
`;

        const iconoOjoAbierto = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"></path>
        <circle cx="12" cy="12" r="2.5"></circle>
    </svg>
`;

        passwordToggle.addEventListener("click", () => {
            const contraseñaVisible =
                contrasenaInput.type === "text";

            if (contraseñaVisible) {
                contrasenaInput.type = "password";
                passwordToggle.innerHTML = iconoOjoCerrado;
                passwordToggle.setAttribute(
                    "aria-label",
                    "Mostrar contraseña"
                );
                passwordToggle.setAttribute(
                    "title",
                    "Mostrar contraseña"
                );
            } else {
                contrasenaInput.type = "text";
                passwordToggle.innerHTML = iconoOjoAbierto;
                passwordToggle.setAttribute(
                    "aria-label",
                    "Ocultar contraseña"
                );
                passwordToggle.setAttribute(
                    "title",
                    "Ocultar contraseña"
                );
            }
        });
        let mode = 'telefono', checkedPhone = '', busy = false;
        const passwordFields = document.getElementById('passwordFields');
        function showPassword(show) {
            passwordFields.hidden = !show; contrasenaInput.disabled = !show; contrasenaInput.required = show;
            if (!show) contrasenaInput.value = '';
            buttonText.textContent = show ? 'Ingresar al portal' : 'Continuar';
        }
        document.getElementById('loginAlternative').addEventListener('click', () => {
            if (busy) return;
            mode = mode === 'telefono' ? 'correo' : 'telefono'; checkedPhone = '';
            document.getElementById('identifierLabel').textContent = mode === 'telefono' ? 'Número de teléfono' : 'Usuario o correo electrónico';
            document.getElementById('loginAlternative').textContent = mode === 'telefono' ? 'Usar usuario o correo' : 'Usar teléfono';
            correoInput.type = mode === 'telefono' ? 'tel' : 'text';
            correoInput.placeholder = mode === 'telefono' ? 'Teléfono con lada' : 'Tu usuario o correo';
            correoInput.value = ''; contrasenaInput.value = ''; showPassword(mode === 'correo'); limpiarMensaje(); correoInput.focus();
        });
        correoInput.addEventListener('input', () => {
            if (mode === 'telefono') { checkedPhone = ''; showPassword(false); }
        });
        function mostrarMensaje(tipo, titulo, texto) { loginMessage.className = `login-message visible ${tipo}`; messageIcon.textContent = tipo === 'success' ? '✓' : '!'; messageTitle.textContent = titulo; messageText.textContent = texto; }
        function limpiarMensaje() { loginMessage.className = 'login-message'; }
        async function request(path, body) {
            const response = await fetch(API_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.ok) throw Error(result.message || 'No fue posible completar la consulta. Intenta nuevamente.');
            return result;
        }
        showPassword(false);
        loginForm.addEventListener('submit', async event => {
            event.preventDefault(); if (busy) return; limpiarMensaje();
            const identifier = correoInput.value.trim();
            if (!identifier) { mostrarMensaje('error', 'Faltan datos', 'Escribe tu teléfono para continuar.'); return; }
            busy = true; loginButton.disabled = true; correoInput.disabled = true;
            buttonText.textContent = 'Consultando…';
            try {
                if (mode === 'telefono' && checkedPhone !== identifier) {
                    const result = await request('/auto-users/acceso/telefono', { telefono: identifier });
                    if (result.estado === 'ACEPTADA') { checkedPhone = identifier; showPassword(true); contrasenaInput.focus(); return; }
                    if (result.estado === 'PRERREGISTRO') {
                        sessionStorage.setItem('mjTelefonoPreregistro', identifier);
                        window.location.href = 'aceptar-cuenta.html#desde-login'; return;
                    }
                    if (result.estado === 'NUEVA') {
                        sessionStorage.setItem('mjTelefonoSolicitud', identifier);
                        window.location.href = 'registro.html#desde-login'; return;
                    }
                    mostrarMensaje('error', 'Revisión de cuenta', result.mensaje || 'Contacta a Administración.'); return;
                }
                const contrasena = contrasenaInput.value;
                if (!contrasena) throw Error('Escribe tu contraseña para continuar.');
                const recordarme = document.getElementById('recordarme').checked;
                const result = await request('/auth/login', { ...(mode === 'telefono' ? { telefono: identifier } : { correo: identifier.toLowerCase() }), contrasena, recordarme });
                for (const storage of [localStorage, sessionStorage]) { storage.removeItem('misionJardinesToken'); storage.removeItem('misionJardinesUsuario'); }
                sessionStorage.removeItem('mjCasaSeleccionada');
                const storage = recordarme ? localStorage : sessionStorage;
                storage.setItem('misionJardinesToken', result.token); storage.setItem('misionJardinesUsuario', JSON.stringify(result.usuario));
                mostrarMensaje('success', 'Inicio de sesión correcto', 'Acceso autorizado. Preparando tu portal…');
                const role = result.usuario?.rol?.nombre || result.usuario?.rol;
                window.location.href = role !== 'SEGURIDAD' && sessionStorage.getItem('mjInvitacion') ? 'invitacion.html' : portal(role);
            } catch (error) { mostrarMensaje('error', 'No se pudo continuar', error.name === 'TimeoutError' ? 'El servidor tardó en responder. Intenta nuevamente.' : error.message); }
            finally { busy = false; loginButton.disabled = false; correoInput.disabled = false; buttonText.textContent = passwordFields.hidden ? 'Continuar' : 'Ingresar al portal'; }
        });

        // Restore a remembered session only after checking its current permissions.
        // This never stores or fills a password.
        (async () => {
            const saved = localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
            if (!saved) return;
            const currentToken = () => localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
            try {
                const response = await fetch(`${API_URL}/auth/perfil`, { headers: { Authorization: `Bearer ${saved}` }, cache: 'no-store', signal: AbortSignal.timeout(30000) });
                // An older profile request must not redirect or erase a newly signed-in account.
                if (currentToken() !== saved) return;
                if (!response.ok) {
                    if (response.status === 401 || response.status === 403) {
                        for (const storage of [localStorage, sessionStorage]) { storage.removeItem('misionJardinesToken'); storage.removeItem('misionJardinesUsuario'); }
                    }
                    return;
                }
                const data = await response.json();
                if (!data.ok || currentToken() !== saved) return;
                const user = data.usuario;
                const storage = localStorage.getItem('misionJardinesToken') === saved ? localStorage : sessionStorage;
                storage.setItem('misionJardinesUsuario', JSON.stringify(user));
                window.location.replace(portal(user?.rol?.nombre || user?.rol));
            } catch (_) { /* Preserve session on a temporary network failure. */ }
        })();
