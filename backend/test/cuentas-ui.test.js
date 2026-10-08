const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../docs');

function ui(page, script, request) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    function element() {
        const listeners = {};
        return { listeners, value: '', hidden: false, disabled: false, checked: false, textContent: '', children: [], attributes: {},
            classList: { toggle() {} }, setAttribute(name, value) { this.attributes[name] = value; }, focus() {},
            addEventListener(name, fn) { listeners[name] = fn; },
            async emit(name, event = {}) { return listeners[name]?.({ preventDefault() {}, target: this, ...event }); },
            append(...children) { this.children.push(...children); },
            replaceChildren(...children) { this.children = children; },
            reportValidity() { return true; }, reset() {},
            showModal() { this.open = true; }, close() { this.open = false; listeners.close?.(); }
        };
    }
    const elements = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], element()]));
    const tabs = ['PENDIENTE', 'APROBADA', 'RECHAZADA'].map(status => Object.assign(element(), { dataset: { status } }));
    const body = { nombre: 'Ana', apellidoPaterno: 'Prueba', correo: 'ana@example.com', contrasena: 'Prueba1234', calle: 'Gardenias', numeroCasa: '5' };
    const writes = [];
    const window = { MJAccessReady: Promise.resolve(true) };
    const sandbox = { window, document: { getElementById: id => elements[id], querySelectorAll: () => tabs,
        createElement: element, createTextNode: value => ({ textContent: value }) },
        localStorage: { getItem: () => 'fake-session' }, sessionStorage: { getItem: () => null },
        confirm: () => true,
        Option: function(text, value) { return { textContent: text, value }; },
        FormData: function() {
            const entries = Object.entries(body).filter(([key]) => !elements.addressFields?.disabled || !['calle', 'numeroCasa'].includes(key));
            return entries;
        },
        fetch: async (url, options = {}) => {
            const sent = options.body ? JSON.parse(options.body) : null;
            if (sent) writes.push(sent);
            const data = await request(url, options, sent);
            return { ok: data.ok !== false, json: async () => data };
        }
    };
    const done = vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js', script), 'utf8'), sandbox);
    return { elements, done, writes, tabs };
}
test('registro de seguridad sin vivienda crea solicitud pendiente, sin paso de correo', async () => {
    const u = ui('registro.html','registro.js',async () => ({ok:true,pendienteAprobacion:true,message:'Solicitud recibida'}));
    const e=u.elements;
    await e.securityType.emit('click');
    assert.equal(e.addressFields.hidden,true);
    assert.equal(e.addressFields.disabled,true);
    e.registerPassword.value=e.confirmPassword.value='Prueba1234';
    await e.registerForm.emit('submit');
    assert.equal(u.writes.length,1);
    assert.equal(u.writes[0].tipoCuenta,'SEGURIDAD');
    assert.equal(u.writes[0].calle,undefined);
    assert.equal(e.registerForm.hidden,true);
    assert.equal(e.registerSuccess.hidden,false);
    assert.match(e.registerTitle.textContent,/solicitud/i);
});
test('si falla guardar la solicitud el formulario continúa disponible y muestra el error', async () => {
    const u=ui('registro.html','registro.js',async ()=>({ok:false,message:'No fue posible guardar la solicitud'}));
    const e=u.elements;
    e.registerPassword.value=e.confirmPassword.value='Prueba1234';
    await e.registerForm.emit('submit');
    assert.equal(e.registerMessage.hidden,false);
    assert.match(e.registerMessage.textContent,/guardar/);
    assert.equal(e.registerForm.hidden,false);
    assert.equal(e.registerSubmit.disabled,false);
});
async function adminUI() {
    const item = { id: 8, tipoCuenta: 'CONDOMINO', calle: 'Gardenias', numeroCasa: '5', estatus: 'PENDIENTE', usuario: { id: 21, nombre: '<script>bad()</script>', apellidoPaterno: 'Prueba', correo: 'ana@example.com' } };
    const u = ui('verificacion-cuentas.html', 'verificacion-cuentas.js', async (url, options) => {
        if (options.method === 'PATCH') return { ok: true, message: 'Cuenta aprobada' };
        if (url.includes('/viviendas')) return { ok: true, viviendas: [{ id: 7, calle: 'Gardenias', numero: '5' }] };
        return { ok: true, solicitudes: [item], total: 1, paginas: 1 };
    });
    await u.done;
    const card = u.elements.requestList.children[0];
    assert.equal(card.children[0].children[1].children[0].textContent, '<script>bad()</script> Prueba');
    await card.children.at(-1).emit('click');
    await new Promise(resolve => setImmediate(resolve));
    return u;
}
test('administrative UI requires identity confirmation and sends only the chosen role and real house', async () => {
    const u = await adminUI(), e = u.elements;
    e.assignedRole.value = 'CONDOMINO';
    await e.approvalForm.emit('submit');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(u.writes.length, 0); assert.match(e.dialogMessage.textContent, /identidad/);
    e.identityConfirmed.checked = true; e.verifiedHouse.value = '7';
    await e.approvalForm.emit('submit'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(u.writes[0].rol, 'CONDOMINO'); assert.equal(u.writes[0].casaId, '7');
    assert.equal(u.writes[0].identidadVerificada, true); assert.equal(e.reviewDialog.open, false);
});
test('switching approval to security hides housing and never sends a stale house selection', async () => {
    const u = await adminUI(), e = u.elements;
    e.assignedRole.value = 'SEGURIDAD'; e.verifiedHouse.value = '7';
    await e.assignedRole.emit('change');
    assert.equal(e.houseAssignment.hidden, true); assert.equal(e.verifiedHouse.required, false);
    e.identityConfirmed.checked = true;
    await e.approvalForm.emit('submit'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(u.writes[0].rol, 'SEGURIDAD'); assert.equal(u.writes[0].casaId, null);
});
