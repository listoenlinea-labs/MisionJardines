const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = require('../docs/assets/js/permissions');
const sidebar = fs.readFileSync('docs/assets/js/site-sidebar.js', 'utf8');
const login = fs.readFileSync('docs/assets/js/login.js', 'utf8');
function storage(values = {}) {
  const data = new Map(Object.entries(values));
  return {getItem:key => data.get(key) || null, setItem:(key,value) => data.set(key,value), removeItem:key => data.delete(key)};
}
function navigation(role) {
  const context = {MJPermissions:policy, location:{pathname:'/seguridad.html'},
    localStorage:storage({misionJardinesUsuario:JSON.stringify({rol:{nombre:role}})}), sessionStorage:storage()};
  vm.createContext(context);
  vm.runInContext(sidebar.slice(0, sidebar.indexOf('  function styles()')) + 'globalThis.result = {groups:navigationGroups(), html:markup()};})();',context);
  return context.result;
}
test('guard navigation retains Inicio and five Security links without admin or resident areas', () => {
  const {groups,html} = navigation('SEGURIDAD');
  assert.deepEqual(Array.from(groups, g => g.label), ['', 'Seguridad']);
  assert.deepEqual(Array.from(groups[0].items, i => i.page), ['index.html']);
  assert.deepEqual(Array.from(groups[1].items, i => i.page), ['conmutador.html','seguridad.html','visitas.html','mapa.html','reportes.html']);
  for (const page of ['viviendas.html','bases_datos.html','zkteco.html','cuotas.html']) assert.equal(html.includes(`href="${page}"`),false);
  assert.ok(html.includes('href="index.html"'));
  assert.ok(html.includes('href="cuenta.html"'));
});
test('Mapa and Reportes belong to Seguridad for administrators too', () => {
  const {groups} = navigation('ADMINISTRADOR');
  for (const page of ['mapa.html','reportes.html']) {
    assert.deepEqual(Array.from(groups.filter(g=>g.items.some(i=>i.page===page)),g=>g.label),['Seguridad']);
  }
  assert.ok(groups[0].items.some(i=>i.page==='index.html'));
  assert.ok(groups[0].items.some(i=>i.page==='viviendas.html'));
});
async function signIn(role, invitation) {
  const nodes = new Map();
  const document = {getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, {value:id==='correo'?'guard@example.invalid':'password',checked:false,classList:{add(){},remove(){}},focus(){},addEventListener(event,fn){this[event]=fn;}});
    return nodes.get(id);
  }};
  const context = {document, MJPermissions:policy, window:{location:{hostname:'localhost'}},
    localStorage:storage(),sessionStorage:storage(invitation?{mjInvitacion:'pending'}:{}),
    fetch:async()=>({ok:true,json:async()=>({ok:true,token:'test',usuario:{rol:{nombre:role}}})}),
    AbortSignal:{timeout:()=>({})}};
  vm.createContext(context);vm.runInContext(login,context);
  nodes.get('loginAlternative').click();
  nodes.get('correo').value='guard@example.invalid';
  nodes.get('contrasena').value='password';
  await nodes.get('loginForm').submit({preventDefault(){}});
  return context.window.location.href;
}
test('login opens persistent portal with correct role landing and respects pending invitations', async () => {
  assert.equal(await signIn('SEGURIDAD',false),'app.html?page=seguridad.html');
  assert.equal(await signIn('SEGURIDAD',true),'app.html?page=seguridad.html');
  assert.equal(await signIn('CONDOMINO',false),'app.html?page=cuotas.html');
  assert.equal(await signIn('ADMINISTRADOR',false),'app.html?page=index.html');
  assert.equal(await signIn('CONDOMINO',true),'invitacion.html');
});
