'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('La vista de TAGs permanece con sus IDs, acciones y rutas actuales',()=>{
 const html=read('docs/zkteco.html');
 for(const id of ['rows','mHouses','mEnabled','mBlocked','street','tagNumber','applyFilters','clearFilters','sync','openLogs','diagnoseConnection','pageInfo','paginationButtons','tagModal','editTagModal','houseValidityModal','logsModal','gateCollapse']){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 for(const endpoint of ['/zkteco/viviendas?','/zkteco/sincronizar','/zkteco/tarjetas/','/zkteco/pluma']){
   assert.ok(html.includes(endpoint),'No debe eliminarse '+endpoint);
 }
 assert.match(html,/id="accessTabTags"[^>]*aria-selected="true"/);
 assert.match(html,/id="accessTagsPanel"/);
});
test('Controles posee pestaña separada y cubre acciones equivalentes a TAGs',()=>{
 const html=read('docs/zkteco.html');
 const js=read('docs/assets/js/zkteco-controles.js');
 for(const id of ['accessTabRemotes','accessRemotesPanel','remoteHouses','remoteEnabled','remoteBlocked',
 'remoteStreet','remoteCodeSearch','remoteOrder','remoteRows','remotePages','remotePageInfo',
 'remoteEditModal','remoteHouseModal','remoteControlCode','remoteDescription','remoteEndDate',
 'remoteValidityModal','remoteLogsModal','remoteButtonA','remoteButtonB','remoteButtonC','remoteButtonD']){
  assert.ok(html.includes('id="'+id+'"'),'Falta '+id);
 }
 for(const action of ['create','edit','block','house-block','delete','validity','expand']){
  assert.ok(js.includes("case '"+action+"'"),'Falta acción '+action);
 }
 for(const endpoint of ['/viviendas','/controles/','/bloqueo','/vigencia','/logs']){
  assert.ok(js.includes(endpoint),'Falta endpoint '+endpoint);
 }
 assert.doesNotMatch(js,/fetch\([^\n]*\/zkteco\//);
 assert.match(html,/Un control bloqueado aquí todavía podría abrir físicamente el portón/);
});
test('El backend no modifica ZKTeco ni pagos, y exige rol administrador',()=>{
 const r=read('backend/src/routes/controles-remotos.routes.js');
 assert.match(r,/autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR','MESA_DIRECTIVA'\)/);
 assert.match(r,/r\.use\(autenticarToken,authorized\)/);
 assert.doesNotMatch(r,/require\([^)]*(zkteco-direct|pagos|cuotas)/);
 assert.doesNotMatch(r,/\/api\/zkteco|setCardBlocked|setHouseBlocked|operateGate|sequelize\.sync\(/);
 assert.match(r,/Control\.sync\(\)/);
 assert.match(r,/Evento\.sync\(\)/);
 assert.match(r,/integracionFisica:false/);
 const app=read('backend/src/app.js');
 assert.match(app,/app\.use\('\/api\/controles-remotos'/);
 assert.match(app,/app\.use\('\/api\/zkteco', zktecoRoutes\)/);
});
test('Los nuevos datos arrancan con cero controles sin tocar direcciones.controles',()=>{
 const model=read('backend/src/models/ControlRemoto.js');
 const sql=read('backend/sql/2026-11-10-controles-remotos-mj.sql');
 assert.match(model,/tableName:'controles_remotos_mj'/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS controles_remotos_mj/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS controles_remotos_eventos_mj/);
 assert.doesNotMatch(sql,/UPDATE\s+direcciones|DELETE\s+FROM\s+zk/i);
});
