const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../../docs');
async function ui(role = 'ADMINISTRADOR', failSave = false) {
    const html = fs.readFileSync(path.join(root, 'bases_datos.html'), 'utf8');
    const elements = {};
    for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
        let markup = '';
        const listeners = {};
        elements[id] = { value: '', checked: false, disabled: false, hidden: true, style: {}, textContent: '',
            classList: { toggle() {} }, inputs: [], listeners,
            addEventListener(event, fn) { listeners[event] = fn; },
            emit(event) { return listeners[event]?.({ preventDefault() {}, target: this }); },
            querySelectorAll(selector) { return selector.includes(':checked') ? this.inputs.filter(i => i.checked) : this.inputs; },
            replaceChildren() { this.inputs = []; }, reset() {},
            showModal() { this.open = true; }, close() { this.open = false; },
            get innerHTML() { return markup; },
            set innerHTML(value) { markup = value; if (['residentHouse', 'outgoingResident'].includes(id)) this.value = value.match(/<option value="([^"]*)"/)?.[1] || ''; } };
    }
    for (const id of ['filterText','filterStreet','filterNumber','filterContact']) elements[id].hidden = false;
    elements.residentMode.value = 'ALTA';
    elements.residentForm.elements = Object.values(elements);
    const writes = [], calls = [];
    const casa = { id: 5, calle: 'Gardenias', numero: '5', enRenta: true, nombre: 'Anterior Persona',
        condominos: [{ id: 7, nombreCompleto: 'Anterior Persona', correo: 'old@example.com', activo: true }] };
    const sandbox = { ...elements, document: { getElementById: id => elements[id],
        querySelectorAll: selector => selector === '[data-admin]' ? [elements.newResident, elements.manageHouse] : [] },
        localStorage: { getItem: () => 'test-token' }, sessionStorage: { getItem: () => null },
        location: { search: '', replace() {} }, console, Intl, URLSearchParams,
        setTimeout: () => 1, clearTimeout() {},
        fetch: async (url, options = {}) => {
            calls.push({ url, options });
            let data;
            if (url.endsWith('/auth/perfil')) data = { ok: true, usuario: { rol: { nombre: role } } };
            else if (options.method === 'POST') {
                writes.push(JSON.parse(options.body));
                data = failSave ? { ok: false, message: 'La vivienda cambió. Actualiza el padrón.' } : { ok: true };
            } else if (url.endsWith('/residentes')) data = { ok: true, data: { casa, residentes: casa.condominos, cuentas: [] } };
            else data = { ok: true, casas: [casa] };
            return { ok: data.ok, status: data.ok ? 200 : 409, json: async () => data };
        }
    };
    await vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/residentes.js'), 'utf8'), sandbox);
    return { elements, writes, calls, sandbox };
}
test('admin can register a resident and the browser sends contact choices to the selected real house', async () => {
    const u = await ui(), e = u.elements;
    assert.equal(e.newResident.hidden, false);
    await e.newResident.emit('click');
    assert.equal(e.residentDialog.open, true);
    e.residentName.value = 'Nueva Persona'; e.residentEmail.value = 'new@example.com';
    e.residentContact.checked = true;
    await e.residentForm.emit('submit');
    assert.equal(u.writes[0].modo, 'ALTA');
    assert.equal(u.writes[0].nombreCompleto, 'Nueva Persona');
    assert.equal(u.writes[0].actualizarContacto, true);
    assert.equal(u.writes[0].desvincularUsuarioIds.length, 0);
    assert.ok(u.calls.some(c => c.url.endsWith('/casas/5/residentes') && c.options.method === 'POST'));
    assert.equal(e.residentDialog.open, false);
});
test('tenant change sends explicit outgoing resident and only selected accounts', async () => {
    const u = await ui(), e = u.elements;
    await e.manageHouse.emit('click');
    assert.equal(e.residentAccountSection.hidden, false);
    assert.equal(e.residentContact.disabled, true);
    e.outgoingResident.value = '7'; e.residentName.value = 'Nueva Persona';
    e.confirmResidentChange.checked = true;
    e.residentAccounts.inputs = [{ value: '8', checked: true }, { value: '9', checked: false }];
    await e.residentForm.emit('submit');
    assert.equal(u.writes[0].modo, 'CAMBIO');
    assert.equal(u.writes[0].residenteId, '7');
    assert.deepEqual(Array.from(u.writes[0].desvincularUsuarioIds), ['8']);
    assert.equal(u.writes[0].confirmarCambio, true);
});
test('failed save keeps the form and its values available, and displays the server error', async () => {
    const u = await ui('ADMINISTRADOR', true), e = u.elements;
    await e.newResident.emit('click'); e.residentName.value = 'Nueva Persona';
    await e.residentForm.emit('submit');
    assert.equal(e.residentDialog.open, true);
    assert.equal(e.residentName.value, 'Nueva Persona');
    assert.equal(e.saveResident.disabled, false);
    assert.equal(e.residentFormError.hidden, false);
    assert.match(e.residentFormError.textContent, /Actualiza/);
});
test('security sees the registry without administrative controls or edit actions', async () => {
    const u = await ui('SEGURIDAD');
    assert.equal(u.elements.newResident.hidden, true);
    assert.equal(u.elements.manageHouse.hidden, true);
    assert.doesNotMatch(u.elements.residentsTable.innerHTML, /data-edit-resident/);
    await u.elements.newResident.emit('click');
    assert.notEqual(u.elements.residentDialog.open, true);
});
