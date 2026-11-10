'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.resolve(__dirname,'../../docs/zkteco.html'),'utf8');
test('Las cinco acciones originales de TAGs están dentro de una única fila horizontal',()=>{
 const actions=src.match(/<div class="zk-tag-toolbar-actions"[^>]*>([\s\S]*?)<\/div>/);
 assert.ok(actions,'Falta fila de acciones');
 const ids=['applyFilters','clearFilters','diagnoseConnection','openLogs','sync'];
 for(const id of ids)assert.match(actions[1],new RegExp('id="'+id+'"'));
 assert.equal((actions[1].match(/<button\b/g)||[]).length,5);
 assert.match(src,/#accessTagsPanel \.zk-tag-toolbar-actions\s*\{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/s);
 assert.match(src,/#accessTagsPanel \.zk-tag-toolbar-actions \.btn\s*\{[^}]*height:42px/s);
});
test('En móvil no se pierde ningún botón y la fila permite desplazamiento horizontal',()=>{
 assert.match(src,/#accessTagsPanel \.zk-tag-toolbar-actions\s*\{[^}]*overflow-x:auto/s);
 assert.match(src,/grid-template-columns:repeat\(5,128px\)/);
});
test('El JS de TAGs continúa operativo con sus IDs y rutas originales',()=>{
 for(const id of ['applyFilters','clearFilters','diagnoseConnection','openLogs','sync'])
   assert.match(src,new RegExp("\\$\\('"+id+"'\\)"));
 assert.match(src,/\/zkteco\/sincronizar/);
 assert.match(src,/\/zkteco\/viviendas\?/);
 assert.match(src,/\/zkteco\/pluma/);
});
