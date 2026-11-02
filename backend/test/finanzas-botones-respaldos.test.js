'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../../',p),'utf8');
const source=read('docs/assets/js/analisis-cuotas.js');
const html=read('docs/analisis-cuotas.html');
const css=read('docs/assets/css/analisis-cuotas.css');

test('los botones visibles tienen controladores y el modal respeta hidden',()=>{
 for(const id of ['financeDownloadAllReceipts','financeDriveConnect','financeDriveBackup','financeBackupModal',
   'financeBackupPeriod','financeBackupConfirm','financeBackupClose','houseHistoryDeleteStatus'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(source,/data-history-delete/);
 assert.match(source,/historyModal\.addEventListener\('click',async event=>/);
 for(const id of ['financeDownloadAllReceipts','financeDriveConnect','financeDriveBackup','financeBackupClose'])
  assert.ok(source.includes("$('"+id+"').addEventListener('click'"),id+' debe tener listener');
 assert.match(source,/backupConfirm\.addEventListener\('click'/);
 assert.match(source,/\/recibos-masivos\/periodos/);
 assert.match(source,/\/recibos-masivos\/zip/);
 assert.match(source,/\/drive\/respaldo/);
 assert.match(source,/\/anulacion/);
 assert.match(html,/analisis-cuotas\.js\?v=20261102-botones-funcionales/);
 assert.match(css,/#financeBackupModal \[hidden\]\{display:none!important\}/);
 assert.doesNotThrow(()=>new Function(source));
});

test('clics reales de la UI abren ZIP, descargan PDF, autorizan Drive y anulan con confirmación',async()=>{
 const start=source.indexOf(' // Acciones financieras: un botón no es funcional');
 const end=source.indexOf(' function initializePaymentYears(){',start);
 assert.ok(start>0&&end>start,'módulo de controladores cargado antes del inicio');
 const handlers=source.slice(start,end);
 const objects=new Map(),requests=[],downloads=[];
 function element(id){
  if(!objects.has(id)){
   const listeners={};
   const x={
    id,hidden:true,disabled:false,value:'',innerHTML:'',textContent:'',dataset:{},
    parentElement:{hidden:false},focus(){},contains(){return true},
    addEventListener(type,cb){(listeners[type]??=[]).push(cb);},
    async fire(type,extra={}){for(const cb of listeners[type]||[])await cb({target:x,...extra});},
    remove(){},click(){downloads.push(id);}
   };
   objects.set(id,x);
  }
  return objects.get(id);
 }
 const historyModal=element('houseHistoryModal');
 historyModal.hidden=false;
 const fakeDocument={
  addEventListener(){},createElement(){return element('download')},
  body:{appendChild(){}}
 };
 const window={
  confirm(){return true;},prompt(){return 'ANULAR';},
  open(){return {closed:false,opener:{},location:{replace(u){requests.push([u]);}},close(){}};},
  MJFinanceExport:{async descargarReporte(){return new Uint8Array([80,75,3,4]).buffer;}},
  ExcelJS:{},JSZip:{}
 };
 async function request(url,body){
  requests.push([url,body]);
  if(url==='/recibos-masivos/periodos')return {data:{periodos:['2026-09','2026-10']}};
  if(url.includes('/anulacion?'))return {data:{importe:600,periodos:['NOVIEMBRE 2026','DICIEMBRE 2026'],fechaObjetivo:'2026-11-10'}};
  if(url.endsWith('/anulacion'))return {data:{periodosRestaurados:2,restauracionC3:{estado:'PENDIENTE'}}};
  if(url==='/drive/conectar')return {data:{url:'https://accounts.google.com/o/oauth2/v2/auth'}};
  if(url==='/drive/status')return {data:{connected:true}};
  if(url==='/drive/respaldo')return {data:{cantidad:1,meses:1}};
  throw Error('Ruta inesperada '+url);
 }
 const ctx={
  $:element,document:fakeDocument,window,historyModal,
  activeConcept:'MANTENIMIENTO',currentHistoryHouseId:10,
  historyMovements:[{referencia:'MJMAN:2027-01-10:11111111-1111-4111-8111-111111111111'}],
  data:{anio:2026,mes:10},request,API:'https://example.invalid/api',token:'JWT',
  fmt:n=>'$'+n,displayDate:d=>d,notice(){},async load(){},async openHouseHistory(){},
  location:{replace(){}},URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},
  setTimeout(){},btoa(s){return s;},
  async fetch(){return {ok:true,status:200,headers:{get(){return '2';}},async blob(){return {size:100};}};}
 };
 new Function(...Object.keys(ctx),handlers)(...Object.values(ctx));
 await element('financeDownloadAllReceipts').fire('click');
 for(let i=0;i<5;i++)await Promise.resolve();
 assert.equal(element('financeBackupModal').hidden,false);
 assert.equal(element('financeBackupPeriod').value,'2026-10');
 await element('financeBackupConfirm').fire('click');
 assert.equal(downloads.length,1,'la descarga crea un enlace y ejecuta click');
 assert.match(element('financeBackupStatus').textContent,/2 PDF/);
 await element('financeDriveConnect').fire('click');
 await element('financeBackupConfirm').fire('click');
 assert.ok(requests.some(r=>r[0]==='/drive/conectar'));
 await element('financeDriveBackup').fire('click');
 for(let i=0;i<5;i++)await Promise.resolve();
 await element('financeBackupConfirm').fire('click');
 assert.ok(requests.some(r=>r[0]==='/drive/respaldo'),'se invoca respaldo de Drive');
 const button={disabled:false,dataset:{historyDelete:'0'},closest(){return button;}};
 await historyModal.fire('click',{target:button,preventDefault(){}});
 assert.ok(requests.some(r=>r[0]==='/pagos-vivienda/10/anulacion'&&r[1]?.confirmacion==='ANULAR'));
 assert.match(element('houseHistoryDeleteStatus').textContent,/Verifica el TAG/);
});
