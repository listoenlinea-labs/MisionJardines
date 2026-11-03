'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const code=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-cuotas.js'),'utf8');
const css=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/css/analisis-cuotas.css'),'utf8');
const html=fs.readFileSync(path.resolve(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
const between=(from,to)=>{
 const start=code.indexOf(from);
 const end=code.indexOf(to,start+from.length);
 assert.ok(start>=0&&end>start,'se encontró '+from);
 return code.slice(start,end);
};

test('recarga preserva la página actual pero cambiar de pestaña la reinicia',()=>{
 assert.match(code,/function elegirConcepto\(concepto,\{resetPage=true\}=\{\}\)/);
 assert.match(code,/if\(resetPage\)housePage=1/);
 assert.match(code,/elegirConcepto\(activeConcept,\{resetPage:false\}\)/);
 const section=between('function elegirConcepto(','function syncHouseSort()');
 const run=new Function('initialPage','housesCount',[
  'let housePage=initialPage,activeConcept="MANTENIMIENTO",selectedReceiptHouseId=null;',
  'const data={viviendasMantenimiento:Array.from({length:housesCount},(_,i)=>({casaId:i+1})),viviendasConceptos:{},viviendas:[]};',
  'const els=new Map();',
  'function $(id){if(!els.has(id))els.set(id,{hidden:false,classList:{toggle(){}},',
  '  setAttribute(){},querySelector(){return null},value:"",textContent:""});return els.get(id);}',
  'const document={querySelectorAll:()=>[]};',
  'const notice=()=>{};',
  'function actualizarAniosUltimoPago(){}',
  'function renderHouses(){housePage=Math.min(Math.max(1,housePage),Math.max(1,Math.ceil(data.viviendas.length/12)));}',
  section,
  'elegirConcepto("MANTENIMIENTO",{resetPage:false});',
  'const preserved=housePage;',
  'elegirConcepto("MANTENIMIENTO");',
  'return {preserved,reset:housePage};'
 ].join('\n'));
 assert.deepEqual(run(4,60),{preserved:4,reset:1});
 assert.deepEqual(run(7,25),{preserved:3,reset:1}); // Total bajó a tres páginas.
 assert.deepEqual(run(1,60),{preserved:1,reset:1});
});

function pickerHarness(){
 const nodes=new Map(),classes=new Set(),attributes=new Map();
 const overlay={
  hidden:false,
  classList:{toggle(name,flag){if(flag)classes.add(name);else classes.delete(name);}},
  setAttribute(name,value){attributes.set(name,value);},
  removeAttribute(name){attributes.delete(name);}
 };
 function $(id){
  if(!nodes.has(id))nodes.set(id,{id,disabled:false,textContent:''});
  return nodes.get(id);
 }
 let callback=null,throwOnOpen=false,permissionFailure=false,chosenUrl=null;
 class DocsView{
  setIncludeFolders(){return this;}
  setSelectFolderEnabled(){return this;}
 }
 class Builder{
  addView(){return this;}
  setOAuthToken(){return this;}
  setDeveloperKey(){return this;}
  setAppId(){return this;}
  setOrigin(){return this;}
  setTitle(){return this;}
  setCallback(fn){callback=fn;return this;}
  build(){return{setVisible(){if(throwOnOpen)throw Error('Fallo al abrir iframe de Picker');}};}
 }
 const pickerApi={
  DocsView,PickerBuilder:Builder,ViewId:{FOLDERS:'folders'},
  Response:{ACTION:'action',DOCUMENTS:'documents'},
  Action:{PICKED:'picked',CANCEL:'cancel'},Document:{ID:'id'}
 };
 const request=async(route,body)=>{
  if(route==='/drive/selector')return{data:{accessToken:'token',apiKey:'key',appId:'123456789'}};
  if(route==='/drive/carpeta'){
   assert.equal(body.folderId,'1abcdefghi012345');
   if(permissionFailure)throw Error('Sin permisos para esta carpeta');
   return{data:{url:'https://drive.google.com/drive/folders/1abcdefghi012345'}};
  }
  throw Error('Ruta inesperada: '+route);
 };
 const script=[
  'let drivePickerActive=false,backupBusy=false,backupAction="drive";',
  'const backupModal=overlay;',
  between('function setDrivePickerActive(','async function loadBackupPeriods()'),
  between('async function pickDriveFolder()', "$('financeDriveChooseFolder').addEventListener"),
  'return {pickDriveFolder,closeBackupModal,isActive:()=>drivePickerActive};'
 ].join('\n');
 const controls=new Function('overlay','$','window','request','ensureGooglePicker',
  'updateDriveFolderLink','setBackupStatus',script)(
  overlay,$,{google:{picker:pickerApi},location:{origin:'https://listoenlinea-labs.github.io'}},
  request,async()=>{},url=>{chosenUrl=url;},()=>{}
 );
 return{
  ...controls,overlay,classes,attributes,$,
  cb:async payload=>{assert.ok(callback);await callback(payload);},
  throwOnOpen:flag=>{throwOnOpen=flag;},
  failPermission:flag=>{permissionFailure=flag;},
  selectedUrl:()=>chosenUrl
 };
}

test('Google Picker queda por delante ocultando el backdrop propio y se restaura al cancelar',async()=>{
 assert.match(css,/#financeBackupModal\.finance-picker-active\s*\{[^}]*visibility:hidden!important/s);
 assert.match(css,/pointer-events:none!important/);
 const p=pickerHarness();
 await p.pickDriveFolder();
 assert.equal(p.isActive(),true);
 assert.equal(p.classes.has('finance-picker-active'),true);
 assert.equal(p.attributes.get('aria-hidden'),'true');
 assert.equal(p.overlay.hidden,false); // No perder selección ni formulario.
 assert.equal(p.$('financeDriveChooseFolder').disabled,true);
 p.closeBackupModal();
 assert.equal(p.overlay.hidden,false); // Escape no debe cerrar el formulario detrás de Google.
 await p.cb({action:'loaded'});
 assert.equal(p.isActive(),true); // LOADED no es Cancel.
 await p.cb({action:'cancel'});
 assert.equal(p.isActive(),false);
 assert.equal(p.classes.has('finance-picker-active'),false);
 assert.equal(p.attributes.has('aria-hidden'),false);
 assert.equal(p.$('financeDriveChooseFolder').disabled,false);
});

test('elegir carpeta autoriza Drive y restaura el formulario en primer plano',async()=>{
 const p=pickerHarness();
 await p.pickDriveFolder();
 await p.cb({action:'picked',documents:[{id:'1abcdefghi012345'}]});
 assert.equal(p.isActive(),false);
 assert.equal(p.classes.has('finance-picker-active'),false);
 assert.equal(p.$('financeDriveChooseFolder').disabled,false);
 assert.equal(p.selectedUrl(),'https://drive.google.com/drive/folders/1abcdefghi012345');
 assert.match(p.$('financeDriveFolderStatus').textContent,/Carpeta seleccionada/);
});

test('error en Picker o denegación de carpeta nunca dejan el formulario oculto',async()=>{
 const bad=pickerHarness();
 bad.throwOnOpen(true);
 await bad.pickDriveFolder();
 assert.equal(bad.isActive(),false);
 assert.equal(bad.$('financeDriveChooseFolder').disabled,false);
 assert.match(bad.$('financeDriveFolderStatus').textContent,/No se pudo abrir el selector/);
 const denied=pickerHarness();
 denied.failPermission(true);
 await denied.pickDriveFolder();
 await denied.cb({action:'picked',documents:[{id:'1abcdefghi012345'}]});
 assert.equal(denied.isActive(),false);
 assert.equal(denied.$('financeDriveChooseFolder').disabled,false);
 assert.match(denied.$('financeDriveFolderStatus').textContent,/No se configuró la carpeta/);
});

test('versiones cache-busting actualizan la página del iframe y el picker',()=>{
 assert.match(html,/analisis-cuotas\.js\?v=20261103-proyectos-extraordinarios/);
 assert.match(html,/analisis-cuotas\.css\?v=20261103-proyectos-extraordinarios/);
 const shell=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/app-shell.js'),'utf8');
 const app=fs.readFileSync(path.resolve(__dirname,'../../docs/app.html'),'utf8');
 assert.match(shell,/_mjVersion.*proyectos-extraordinarios-20261103/);
 assert.match(app,/app-shell\.js\?v=20261103-proyectos-extraordinarios/);
});
