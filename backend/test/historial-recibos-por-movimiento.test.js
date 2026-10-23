'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../../',p),'utf8');

test('cada movimiento de mantenimiento ofrece generar su recibo por referencia',()=>{
 const js=read('docs/assets/js/analisis-cuotas.js');
 assert.match(js,/data-history-receipt/);
 assert.match(js,/activeConcept==='MANTENIMIENTO'\?'<button/);
 assert.match(js,/historyMovements\[index\]/);
 assert.match(js,/movement\.referencia,button/);
 assert.match(js,/if\(!movement\?\.referencia\)return/);
 assert.match(js,/disabled title="No hay referencia verificable/);
 assert.match(js,/const query=referencia\?'\?referencia='\+encodeURIComponent\(referencia\)/);
 assert.match(js,/receiptCurrentHouseId/);
 assert.match(js,/if\(e\.key==='Escape'&&!historyModal\.hidden&&receiptModal\.hidden\)/);
 assert.match(js,/MJFinanceExport\.descargarReporte/);
});

test('el visor PDF queda encima del historial y conserva descarga y WhatsApp',()=>{
 const css=read('docs/assets/css/analisis-cuotas.css');
 const html=read('docs/analisis-cuotas.html');
 assert.match(css,/#houseReceiptModal\{z-index:10110\}/);
 assert.match(css,/\.history-event-footer\{/);
 assert.match(css,/\.history-receipt-button:focus-visible/);
 assert.match(html,/id="houseReceiptPreview"/);
 assert.match(html,/id="houseReceiptDownload"/);
 assert.match(html,/id="houseReceiptWhatsApp"/);
 assert.match(html,/analisis-cuotas\.js\?v=20261022-recibos-historial/);
 assert.match(html,/analisis-cuotas\.css\?v=20261022-recibos-historial/);
});

test('backend valida referencia y solo consulta mantenimiento para emitir PDF',()=>{
 const controller=read('backend/src/controllers/recibos-mantenimiento-analisis.controller.js');
 const service=read('backend/src/services/recibo-mantenimiento-analisis.service.js');
 const routes=read('backend/src/routes/finanzas.routes.js');
 assert.match(controller,/referenciaSolicitada\(req\)/);
 assert.match(controller,/referencia\.length > 255/);
 assert.match(service,/referenciaBuscada/);
 assert.match(service,/movimientos\.find\(item => refNormalizada\(item\.referencia\) === referenciaBuscada/);
 assert.match(routes,/router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
});
