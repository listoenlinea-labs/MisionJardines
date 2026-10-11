'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const count = (s,token) => s.split(token).length-1;

test('Seguridad: cuotas aparece antes del contacto y no dentro del sidebar',()=>{
  const html=read('docs/seguridad.html');
  const camera=html.indexOf('id="cameraGrid"');
  const gate=html.indexOf('id="openGate"');
  const quotas=html.indexOf('id="seguridadCuotasPanel"');
  const contact=html.indexOf('class="panel panel-pad security-contact-compact"');
  assert.ok(camera>0 && camera<gate && gate<quotas && quotas<contact);
  const dashboard=html.slice(html.indexOf('<section class="dashboard">'),quotas);
  assert.doesNotMatch(dashboard,/COMUNICACIÓN DIRECTA/);
  for(const id of [
    'cameraGrid','gateScene','openGate','closeGate',
    'seguridadCuotasPanel','segCuotasCalle','segCuotasNumero','segCuotasEstado',
    'segCuotasRows','segCuotasStatus','segCuotasPrev','segCuotasNext',
    'adminName','adminSchedule','adminWhatsapp','adminEmail'
  ]) assert.equal(count(html,'id="'+id+'"'),1,'Identificador cambiado: '+id);
  assert.ok(html.includes('data-open="accessModal"'));
  assert.ok(html.includes('data-open="incomeModal"'));
});

test('Comunicación compacta mantiene acciones y horarios originales',()=>{
  const html=read('docs/seguridad.html');
  const start=html.indexOf('security-contact-compact');
  const compact=html.slice(start,html.indexOf('</aside>',start)+8);
  assert.match(compact,/<h3>Administración<\/h3>/);
  assert.match(compact,/id="adminSchedule"/);
  assert.match(compact,/id="adminWhatsapp"/);
  assert.match(compact,/id="adminEmail"/);
  assert.match(compact,/class="actions"/);
});

test('Análisis: seis campos sin cambiar valores ni flujo financiero',()=>{
  const js=read('docs/assets/js/analisis-cuotas.js');
  assert.doesNotThrow(()=>new Function(js));
  assert.equal(count(js,'class="house-amount"'),2);
  for(const field of ['Calle','Casa','Residente','Estado','Pagado','Saldo pendiente'])
    assert.ok(js.includes('data-label="'+field+'"'),'Campo ausente '+field);
  assert.match(js,/fmt\(h\.montoPagado\)/);
  assert.match(js,/fmt\(h\.saldoPendiente\)/);
  assert.match(js,/request\('\/analisis\?anio=/);
});

test('Estilos específicos no alteran escritorio ni funciones de acceso',()=>{
  const css=read('docs/assets/css/mobile-operativo.css');
  const shared=read('docs/assets/js/site-sidebar.js');
  const s=read('docs/seguridad.html');
  const ana=read('docs/analisis-cuotas.html');
  assert.match(css,/body\.page-seguridad-v2 \.security-contact-compact/);
  assert.match(css,/grid-template-areas:"calle casa" "residente pagado" "estado saldo"/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/#financeHouseRows>tr/);
  assert.match(shared,/mobile-operativo\.css\?v=20261011-seguridad-fichas/);
  assert.match(s,/site-sidebar\.js\?v=20261011-seguridad-fichas/);
  assert.match(ana,/analisis-cuotas\.js\?v=20261011-fichas/);
  let balance=0,min=0;
  for(const ch of css){balance+=ch==='{'?1:ch==='}'?-1:0;min=Math.min(min,balance)}
  assert.equal(balance,0);
  assert.equal(min,0);
  assert.doesNotThrow(()=>new Function(shared));
});
