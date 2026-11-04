'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../..',p),'utf8');
const pending=require('../src/services/proyectos-saldos-pendientes.service').pendientesReales;

test('solo los proyectos con saldo positivo aparecen como adeudo; $0 sigue en los proyectos',()=>{
 const cargos=[
  {id:1,monto:0,estado:'PAGADO'},
  {id:2,monto:0,estado:'NO_APLICA'},
  {id:3,monto:0.004,estado:'PAGO_PARCIAL'},
  {id:4,monto:1000,estado:'PENDIENTE'},
  {id:5,monto:123.45,estado:'PAGO_PARCIAL'}
 ];
 assert.deepEqual(pending(cargos).map(x=>x.id),[4,5]);
 const service=read('backend/src/services/adeudos-comunidad.service.js');
 assert.match(service,/const extras = pendientesReales\(cargos\)\.map/);
 assert.match(service,/totalMeta:Math\.round\(cargos\.reduce/);
 assert.match(service,/totalAbonado:Math\.round\(cargos\.reduce/);
 const ui=read('docs/assets/js/pagos.js');
 assert.match(ui,/source\.filter\(item=>Number\(item\.monto\)>0\.009\)/);
 assert.match(ui,/if\(!items\.length\)\{\s*if\(\$\('debtModal'\)\.open\)\$\('debtModal'\)\.close\(\)/);
});
test('texto de proyecto largo no se desborda; se evita en JS y CSS',()=>{
 const js=read('docs/assets/js/analisis-cuotas.js');
 const css=read('docs/assets/css/analisis-cuotas.css');
 assert.match(js,/finance-project-name-card/);
 assert.match(css,/#financialSecondary \.metric\.finance-project-name-card strong/);
 assert.match(css,/overflow-wrap:anywhere/);
 assert.match(css,/white-space:normal/);
});
function fakeService({registered='registrado@example.com',sendError=null}={}){
 const original=read('backend/src/services/recibos-correo-analisis.service.js');
 const sent=[];
 const models={
  Casa:{findByPk:async id=>({id,correo:registered})},
  UsuarioCasa:{findAll:async()=>[]},
  Usuario:{findAll:async()=>[]}
 };
 const dependencies={
  sequelize:{Op:{in:Symbol('in')}},
  '../models':models,
  './email.service':{enviarReciboAdjunto:async params=>{
    sent.push(params);
    if(sendError)throw sendError;
    return {messageId:'mock-smtp-accepted'};
  }},
  './recibo-mantenimiento-analisis.service':{
   consultarPago:async()=>({recibo:{folio:'MJ-NOV-2026-TEST-G5-M'},
    resumen:{monto:300},casa:{calle:'Gardenias',numero:5}}),
   generarPdf:async()=>({buffer:Buffer.from('fakepdf'),nombreArchivo:'MJ-NOV-2026-TEST-G5-M.pdf'})
  },
  './recibo-extraordinario-analisis.service':{
   consultarPago:async()=>({recibo:{folio:'MJ-NOV-2026-TEST-G5-P'},
    resumen:{monto:200,concepto:'Reparación de la calle'},casa:{calle:'Gardenias',numero:5}})
  }
 };
 const mod={exports:{}};
 new Function('module','exports','require',original)(mod,mod.exports,name=>{
  if(!(name in dependencies))throw Error('Unmocked dependency '+name);
  return dependencies[name];
 });
 return {api:mod.exports,sent,models};
}
const request=(others={})=>({
 casaId:5,actor:18,concepto:'MANTENIMIENTO',referencia:'TEST',...others
});
test('si no editas correo sigue usando el registrado, sin cambios a BD',async()=>{
 const {api,sent}=fakeService();
 const response=await api.enviar(request());
 assert.equal(response.correo,'registrado@example.com');
 assert.equal(response.destinoAlternativo,false);
 assert.equal(sent[0].destinatario,'registrado@example.com');
});
test('el administrador puede cambiar correo en mantenimiento o proyectos para ese envío',async()=>{
 for(const tipo of ['MANTENIMIENTO','EXTRAORDINARIO']){
  const {api,sent,models}=fakeService();
  const res=await api.enviar(request({
   concepto:tipo,proyectoId:tipo==='EXTRAORDINARIO'?8:null,
   correoDestino:'nuevo@example.com'
  }));
  assert.equal(res.correo,'nuevo@example.com');
  assert.equal(res.destinoAlternativo,true);
  assert.equal(sent[0].destinatario,'nuevo@example.com');
  assert.equal(models.Casa.update,undefined,'no escribe correo en la vivienda');
  assert.equal(models.Usuario.update,undefined,'no escribe correo en cuentas');
 }
});
test('sin correo registrado puede elegir uno manualmente, pero nunca vacío o múltiple',async()=>{
 const {api,sent}=fakeService({registered:null});
 await assert.rejects(api.enviar(request()),e=>e.status===400);
 for(const email of ['','persona@example.com,tercero@example.com','nombre sin arroba','correo@\nexample.com']){
  await assert.rejects(api.enviar(request({correoDestino:email})),e=>e.status===400);
 }
 assert.equal(sent.length,0);
 const res=await api.enviar(request({correoDestino:'correcto@example.com'}));
 assert.equal(res.correo,'correcto@example.com');
 assert.equal(sent.length,1);
});
test('si SMTP no confirma envío nunca declara éxito ni bloquea corregir y reintentar',async()=>{
 const {api,sent}=fakeService({sendError:new Error('SMTP temporal')});
 await assert.rejects(api.enviar(request({correoDestino:'contacto@example.com'})),/SMTP temporal/);
 await assert.rejects(api.enviar(request({correoDestino:'contacto@example.com'})),/SMTP temporal/);
 assert.equal(sent.length,2);
});
test('la ruta de administración conserva middleware; no se abre un relay público',()=>{
 const route=read('backend/src/routes/finanzas.routes.js');
 const ctl=read('backend/src/controllers/recibos-correo-analisis.controller.js');
 assert.match(route,/router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
 assert.match(route,/router\.post\('\/pagos-vivienda\/:casaId\/recibo\/enviar-correo'/);
 assert.match(ctl,/correoDestino:req\.body\?\.correoDestino/);
 const html=read('docs/analisis-cuotas.html');
 const js=read('docs/assets/js/analisis-cuotas.js');
 assert.match(html,/id="houseReceiptEmailInput"[^>]*type="email"/);
 assert.doesNotMatch(html,/id="houseReceiptEmailInput"[^>]*readonly/);
 assert.doesNotMatch(html,/id="houseReceiptHelp"/);
 assert.doesNotMatch(js,/\$\('houseReceiptHelp'\)/);
 assert.match(js,/correoDestino/);
 assert.match(js,/window\.confirm\('¿Enviar el recibo '/);
 assert.doesNotThrow(()=>new Function(js));
});
