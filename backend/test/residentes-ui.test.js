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
    elements.residentForm.elements = Object.values(elements);
    const writes = [], calls = [];
    const casa = { id: 5, calle: 'Gardenias', numero: '5', enRenta: true, nombre: 'Anterior Persona',
        condominos: [{ id: 7, nombreCompleto: 'Anterior Persona', correo: 'old@example.com', activo: true }] };
    const sandbox = { ...elements, document: { getElementById: id => elements[id],
        querySelectorAll: selector => selector === '[data-admin]' ? [elements.manageHouse] : [] },
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
    assert.equal(e.manageHouse.hidden, false);
    await e.manageHouse.emit('click');
    assert.equal(e.residentDialog.open, true);
    e.residentName.value = 'Nueva Persona'; e.residentEmail.value = 'new@example.com';
    e.residentContact.checked = true;
    await e.residentForm.emit('submit');
    assert.equal(u.writes[0].modo, 'ALTA');
    assert.equal(u.writes[0].nombreCompleto, 'Nueva Persona');
    assert.equal(u.writes[0].actualizarContacto, true);
    assert.equal(u.writes[0].desvincularUsuarioIds, undefined);
    assert.ok(u.calls.some(c => c.url.endsWith('/casas/5/residentes') && c.options.method === 'POST'));
    assert.equal(e.residentDialog.open, false);
});
test('registry edit preloads the selected tenant and overwrites that same record without a replacement operation', async () => {
    const u = await ui(), e = u.elements;
    assert.match(e.residentsTable.innerHTML, /Editar inquilino/);
    await e.residentsTable.listeners.click({ target: { closest: () => ({ dataset: { house: '5', editResident: '7' } }) } });
    assert.equal(e.residentName.value, 'Anterior Persona');
    assert.equal(e.residentEmail.value, 'old@example.com');
    assert.equal(e.residentHouse.disabled, true);
    assert.equal(e.residentDialogTitle.textContent, 'Editar inquilino');
    e.residentName.value = 'Nueva Persona'; e.residentEmail.value = 'new@example.com';
    await e.residentForm.emit('submit');
    assert.equal(u.writes[0].modo, 'EDITAR');
    assert.equal(u.writes[0].residenteId, '7');
    assert.equal(u.writes[0].nombreCompleto, 'Nueva Persona');
    assert.equal(u.writes[0].desvincularUsuarioIds, undefined);
    assert.equal(u.writes[0].actualizarContacto, true);
});
test('management has one orange button and no operation or outgoing tenant selector', () => {
    const html = fs.readFileSync(path.join(root, 'bases_datos.html'), 'utf8');
    assert.match(html, /class="btn btn-primary"[^>]*id="manageHouse"/);
    assert.doesNotMatch(html, /id="(?:newResident|residentMode|outgoingResident|residentAccountSection)"/);
});
test('failed save keeps the form and its values available, and displays the server error', async () => {
    const u = await ui('ADMINISTRADOR', true), e = u.elements;
    await e.manageHouse.emit('click'); e.residentName.value = 'Nueva Persona';
    await e.residentForm.emit('submit');
    assert.equal(e.residentDialog.open, true);
    assert.equal(e.residentName.value, 'Nueva Persona');
    assert.equal(e.saveResident.disabled, false);
    assert.equal(e.residentFormError.hidden, false);
    assert.match(e.residentFormError.textContent, /Actualiza/);
});
test('security sees the registry without administrative controls or edit actions', async () => {
    const u = await ui('SEGURIDAD');
    assert.equal(u.elements.manageHouse.hidden, true);
    assert.equal(u.elements.manageHouse.hidden, true);
    assert.doesNotMatch(u.elements.residentsTable.innerHTML, /data-edit-resident/);
    await u.elements.manageHouse.emit('click');
    assert.notEqual(u.elements.residentDialog.open, true);
});

test('single resident search supports street, number and combined address without losing contact search', async () => {
    const { elements: e } = await ui('ADMINISTRADOR');
    const queries = [
        'Gardenias', '5', 'Gardenias 5', '5 Gardenias',
        'gArDeNiAs, 5', 'Anterior Persona', 'old@example.com'
    ];
    for (const query of queries) {
        e.filterText.value = query;
        e.filterText.emit('input');
        assert.match(e.residentsTable.innerHTML, /Anterior Persona/, 'Search failed for ' + query);
        assert.match(e.paginationInfo.textContent, /de 1 residentes/);
    }
    e.filterText.value = 'Rosas 18';
    e.filterText.emit('input');
    assert.match(e.residentsTable.innerHTML, /No se encontraron residentes/);
    assert.match(e.paginationInfo.textContent, /de 0 residentes/);
    e.filterText.value = 'Gardenias 5';
    e.filterStreet.value = 'Rosas';
    e.filterStreet.emit('change');
    assert.match(e.residentsTable.innerHTML, /No se encontraron residentes/);
});

test('rental and principal-contact checkboxes keep label and square aligned', () => {
    const html = fs.readFileSync(path.join(root, 'bases_datos.html'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'assets/css/residentes-gestion.css'), 'utf8');
    assert.match(html, /<label class="resident-check" for="residentRental"><input id="residentRental" type="checkbox"><span>La vivienda está en renta<\/span><\/label>/);
    assert.match(html, /<label class="resident-check" for="residentContact"><input id="residentContact" type="checkbox"><span>Usar estos datos como contacto principal de la vivienda<\/span><\/label>/);
    assert.match(css, /\.residents-page \.resident-dialog label\.resident-check\s*\{[^}]*display:flex/);
    assert.match(css, /\.residents-page \.resident-dialog label\.resident-check input\[type="checkbox"\]\s*\{[^}]*width:18px!important/);
    assert.match(css, /\.residents-page \.resident-dialog label\.resident-check span\s*\{[^}]*min-width:0/);
});

test('save changes stays orange with readable white text on hover/focus', () => {
    const css = fs.readFileSync(path.join(root, 'assets/css/residentes-gestion.css'), 'utf8');
    assert.match(css, /#saveResident\.btn-primary:hover/);
    assert.match(css, /#saveResident\.btn-primary:focus-visible/);
    assert.match(css, /#saveResident\.btn-primary:hover:not\(:disabled\)\s*\{[^}]*background:linear-gradient/);
    assert.match(css, /#saveResident\.btn-primary:hover,[\s\S]*?color:#fff/);
});
