const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const docs = path.resolve(__dirname, '../../docs');
const tour = fs.readFileSync(path.join(docs, 'assets/js/portal-tour.js'), 'utf8');
const sidebar = fs.readFileSync(path.join(docs, 'assets/js/site-sidebar.js'), 'utf8');
const content = fs.readFileSync(path.join(docs, 'assets/js/portal-tour-content.js'), 'utf8');
const css = fs.readFileSync(path.join(docs, 'assets/css/portal-tour.css'), 'utf8');

test('Celular: el menú siempre inicia cerrado incluso si la preferencia anterior era abierta', () => {
  assert.match(sidebar, /if \(matchMedia\(MOBILE\)\.matches\) body\.classList\.add\('mj-shared-sidebar-collapsed'\)/);
  assert.match(sidebar, /let collapsed = matchMedia\(MOBILE\)\.matches \|\| stored === '1'/);
  assert.match(sidebar, /addEventListener\('mj:portal-tour-start'/);
  assert.match(sidebar, /collapse\(body, button, true, false\)/);
  assert.match(tour, /dispatchEvent\(new CustomEvent\('mj:portal-tour-start'\)\)/);
});

test('Tour móvil: el foco está en el contenido real, no en toda la página ni en el menú fuera de pantalla', () => {
  assert.match(content, /\['\.hl-welcome', 'Panel principal'/);
  assert.match(content, /\['#clubAvailabilityCard \.section-header', 'Calendario y disponibilidad'/);
  assert.doesNotMatch(content, /\['main', 'Panel principal'/);
  assert.match(tour, /if \(!visibleElement\(el\)\) return null;/);
  assert.match(tour, /step\.selector\.includes\('\.mj-side-nav'\)/);
  assert.match(tour, /document\.querySelector\('\.mj-side-tab'\)/);
});

test('Geométrica: el foco no se dibuja debajo del panel móvil ni fuera del iframe', () => {
  const start = tour.indexOf('  function screenRect(target) {');
  const end = tour.indexOf('  function scrollTargetIntoView(target) {', start);
  assert.ok(start >= 0 && end > start);
  const clip = new Function('overlay', 'innerWidth', 'innerHeight',
    tour.slice(start, end) + '; return screenRect;')(
    { querySelector() { return { getBoundingClientRect() { return {top:420}; } }; } },
    320, 726);
  const frame = {getBoundingClientRect: () => ({left:0,top:0,right:320,bottom:726})};
  const make = (left, top, right, bottom) => ({
    frame,
    el:{getBoundingClientRect:()=>({left,top,right,bottom,width:right-left,height:bottom-top})}
  });
  const partiallyVisible = clip(make(15, 360, 310, 590));
  assert.ok(partiallyVisible);
  assert.ok(partiallyVisible.top + partiallyVisible.height <= 406);
  assert.ok(partiallyVisible.left >= 8);
  assert.ok(partiallyVisible.left + partiallyVisible.width <= 312);
  assert.equal(clip(make(15, 440, 310, 590)), null);
  assert.equal(clip(make(-250, 90, -5, 200)), null);
});

test('La tarjeta ocupa el fondo y el desplazamiento se alinea con el espacio visible', () => {
  assert.match(tour, /scrollTargetIntoView\(targetFor\(steps\[index\]\)\)/);
  assert.match(tour, /panel\.getBoundingClientRect\(\)\.top/);
  assert.match(tour, /panelTop - frameTop - 20/);
  assert.match(tour, /window\.visualViewport\?\.addEventListener\('resize'/);
  assert.match(tour, /frame\.addEventListener\('load', attachScroll\)/);
  assert.match(css, /max-height:min\(52dvh,420px\)/);
  assert.match(css, /\.mj-tour-focus\{transition:none\}/);
});

test('No se altera el flujo ni se ejecutan acciones reales', () => {
  for (const source of [tour, sidebar, content]) assert.doesNotThrow(() => new Function(source));
  assert.doesNotMatch(tour, /\bfetch\s*\(/);
  assert.doesNotMatch(tour, /\.requestSubmit\s*\(/);
  assert.doesNotMatch(tour, /\.click\s*\(/);
});
