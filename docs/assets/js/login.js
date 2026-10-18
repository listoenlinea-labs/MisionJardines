        const API_URL =
            ['localhost', '127.0.0.1'].includes(window.location.hostname)
                ? 'http://localhost:3000/api'
                : 'https://api-misionjardines.listoenlinea.host/api';
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
        function mostrarMensaje(tipo, titulo, texto) { loginMessage.className = `login-message visible ${tipo}`; messageIcon.textContent = tipo === "success" ? "✓" : "!"; messageTitle.textContent = titulo; messageText.textContent = texto }
        function limpiarMensaje() { loginMessage.className = "login-message" }
        function activarCarga() { loginButton.disabled = true; loginButton.classList.add("loading"); buttonText.textContent = "Verificando acceso..." }
        function detenerCarga() { loginButton.disabled = false; loginButton.classList.remove("loading"); buttonText.textContent = "Ingresar al portal" }
        loginForm.addEventListener("submit", async event => {
            event.preventDefault(); limpiarMensaje(); const correo = correoInput.value.trim().toLowerCase(), contrasena = contrasenaInput.value; if (!correo || !contrasena) { mostrarMensaje("error", "Faltan datos", "Escribe tu usuario o correo y contraseña para continuar."); return } activarCarga(); try {
                const recordarme = document.getElementById("recordarme").checked;
                const response = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ correo, contrasena, recordarme }) }); const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.message || "No fue posible iniciar sesión."); for (const previousStorage of [localStorage, sessionStorage]) { previousStorage.removeItem("misionJardinesToken"); previousStorage.removeItem("misionJardinesUsuario"); } sessionStorage.removeItem("mjCasaSeleccionada"); const storage = recordarme ? localStorage : sessionStorage; storage.setItem("misionJardinesToken", result.token); storage.setItem("misionJardinesUsuario", JSON.stringify(result.usuario)); mostrarMensaje("success", "Inicio de sesión correcto", "Acceso autorizado. Preparando tu portal…"); buttonText.textContent = "Acceso autorizado";
                setTimeout(() => {
                    const role = result.usuario?.rol?.nombre || result.usuario?.rol;
                    window.location.href = role !== "SEGURIDAD" && sessionStorage.getItem("mjInvitacion") ? "invitacion.html" : MJPermissions.landing(role);
                }, 1200);
            } catch (error) { mostrarMensaje("error", "No se pudo iniciar sesión", error.message) } finally { detenerCarga() }
        });

        // Al volver a abrir este navegador se valida el token con el servidor.
        // Nunca se guardan ni completan automáticamente las credenciales.
        (async () => {
            const saved = localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
            if (!saved) return;
            try {
                const response = await fetch(`${API_URL}/auth/perfil`, { headers: { Authorization: `Bearer ${saved}` }, cache: 'no-store' });
                if (!response.ok) {
                    if (response.status === 401 || response.status === 403) {
                        for (const storage of [localStorage, sessionStorage]) {
                            storage.removeItem('misionJardinesToken');
                            storage.removeItem('misionJardinesUsuario');
                        }
                    }
                    return;
                }
                const data = await response.json();
                if (!data.ok) return;
                const user = data.usuario;
                const storage = localStorage.getItem('misionJardinesToken') === saved ? localStorage : sessionStorage;
                storage.setItem('misionJardinesUsuario', JSON.stringify(user));
                location.replace(MJPermissions.landing(user?.rol?.nombre || user?.rol));
            } catch (_) { /* Sin conexión: conservar sesión para reintentar. */ }
        })();
