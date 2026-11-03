'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../../',p),'utf8');

test('los recibos van a la carpeta existente seleccionada, dentro del año, como PDF independientes',()=>{
 const service=read('backend/src/services/drive-respaldos.service.js');
 const paths=read('backend/src/routes/finanzas.routes.js');
 const controller=read('backend/src/controllers/drive-respaldos.controller.js');
 assert.match(service,/folder\(token,year,r\.folder_id\)/);
 assert.match(service,/name==='02_Recibos_PDF'|info\.name!=='02_Recibos_PDF'/);
 assert.match(service,/upload\(token,item\.name,'application\/pdf',item\.data,folderId\)/);
 assert.match(service,/pdfExistente\(token,folderId,item\.name\)/);
 assert.match(service,/await recibos\.lotePdf\(periodo,n,10\)/);
 assert.match(service,/UPDATE google_drive_respaldo SET folder_id=\?/);
 assert.match(paths,/router\.post\('\/drive\/carpeta',drive\.elegirCarpeta\)/);
 assert.match(paths,/router\.post\('\/drive\/recibos',drive\.recibos\)/);
 assert.match(paths,/router\.get\('\/drive\/selector',drive\.selector\)/);
 assert.match(controller,/res\.set\('Cache-Control','no-store'\)/);
 assert.doesNotThrow(()=>new Function(service));
});
test('Google Picker concede acceso limitado a 02_Recibos_PDF sin pedir drive global',()=>{
 const frontend=read('docs/assets/js/analisis-cuotas.js');
 const html=read('docs/analisis-cuotas.html');
 const backend=read('backend/src/services/drive-respaldos.service.js');
 assert.match(frontend,/new pickerApi\.DocsView\(pickerApi\.ViewId\.FOLDERS\)/);
 assert.match(frontend,/setSelectFolderEnabled\(true\)/);
 assert.match(frontend,/request\('\/drive\/carpeta',\{folderId\}\)/);
 assert.match(frontend,/request\('\/drive\/recibos',\{periodo:month,offset\}\)/);
 assert.match(frontend,/soloExcel:true/);
 assert.match(html,/id="financeDriveChooseFolder"/);
 assert.match(html,/id="financeDriveFolderLink"/);
 assert.match(html,/analisis-cuotas\.js\?v=20261102-drive-picker-2026/);
 assert.match(backend,/GOOGLE_PICKER_API_KEY/);
 assert.match(backend,/GOOGLE_CLOUD_PROJECT_NUMBER/);
 assert.match(backend,/scope:'https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
 assert.doesNotThrow(()=>new Function(frontend));
});
test('procesamiento por lotes conserva límites y no reporta PDF faltantes como completos',()=>{
 const service=read('backend/src/services/recibos-masivos.service.js');
 assert.match(service,/async function lotePdf\(periodo,offset=0,limit=10\)/);
 assert.match(service,/throw fail\(409,'No se subió este lote:/);
 assert.match(service,/ids\.slice\(offset,offset\+limit\)/);
 assert.match(service,/nextOffset:Math\.min\(ids\.length,offset\+selected\.length\)/);
 assert.doesNotThrow(()=>new Function(service));
});
