'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../../',p),'utf8');

test('Historial de pagos presenta un botón de refrescar visible junto al título, sin duplicar acciones',()=>{
 const html=read('docs/pagos.html');
 const section=html.slice(html.indexOf('<span class="eyebrow">MIS RECIBOS</span>'),html.indexOf('id="receiptList"'));
 assert.match(section,/Historial de pagos/);
 assert.match(section,/id="refreshReceipts" class="receipt-refresh-btn" type="button"/);
 assert.match(section,/aria-label="Actualizar historial de pagos"/);
 assert.match(section,/<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">/);
 assert.equal((html.match(/id="refreshReceipts"/g)||[]).length,1);
 assert.match(html,/assets\/js\/pagos\.js\?v=20261022-refrescar-recibos/);
});

test('refrescar reconsulta los recibos existentes, actualiza el contador y conserva los datos si hay error',()=>{
 const js=read('docs/assets/js/pagos.js');
 assert.match(js,/async function loadReceipts\(\{ preserveOnError = false \} = \{\}\)/);
 assert.match(js,/api\('\/pagos\/mios', \{ headers: headers\(\) \}\)/);
 assert.match(js,/renderReceipts\(d\.data \|\| \[\]\)/);
 assert.match(js,/if \(!preserveOnError\)/);
 assert.match(js,/\$\('refreshReceipts'\)\.addEventListener\('click', async \(\) => \{/);
 assert.match(js,/const updated = await loadReceipts\(\{ preserveOnError: true \}\)/);
 assert.match(js,/\$\('showAllReceipts'\)\.textContent='Ver todos \('/);
 assert.match(js,/\$\('receiptAllList'\)\.innerHTML=/);
 assert.match(js,/\$\('receiptCount'\)\.textContent=/);
 assert.match(js,/receiptRefreshBusy = false/);
});

test('indicador de espera, foco accesible y animación reducida',()=>{
 const html=read('docs/pagos.html');
 const js=read('docs/assets/js/pagos.js');
 assert.match(html,/\.receipt-refresh-btn:focus-visible/);
 assert.match(html,/\.receipt-refresh-btn\.is-loading svg\{animation:receipt-refresh-spin/);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.match(html,/@media\(max-width:520px\)\{\.receipt-refresh-btn/);
 assert.match(js,/button\.disabled = true;/);
 assert.match(js,/button\.classList\.add\('is-loading'\)/);
 assert.match(js,/button\.setAttribute\('aria-busy', 'true'\)/);
 assert.match(js,/finally \{[\s\S]*?button\.disabled = false;/);
 assert.match(js,/button\.removeAttribute\('aria-busy'\)/);
});
