'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');
const mod=require('../../docs/assets/js/analisis-excel-proyectos.js');
const excel=read('docs/assets/js/analisis-excel.js'),ui=read('docs/assets/js/analisis-cuotas.js');
const html=read('docs/analisis-cuotas.html');
const app=read('backend/src/app.js'),signal=read('backend/src/services/finanzas-live-signal.service.js');
const controller=read('backend/src/controllers/pagos-manuales-analisis.controller.js');
const email=read('backend/src/services/recibos-correo-analisis.service.js');
function fixture(){
 const houses=Array.from({length:231},(_,i)=>({casaId:i+1,calle:i<100?'Gardenias':'Rosas',
  numero:String(i+1),nombre:'Persona '+(i+1),tags:{detalle:[]}}));
 const detail=houses.map((h,i)=>({casaId:h.casaId,montoCuota:i===1?0:1000,
  montoPagado:i===0?200:i===2?1000:0,
  saldoPendiente:i===0?800:i===1||i===2?0:1000,saldoFavor:0,
  estatus:i===0?'PAGO_PARCIAL':i===1?'NO_APLICA':i===2?'PAGADO':'PENDIENTE',
  ultimoPago:i===0?{monto:200,fecha:'2026-11-03',referencia:'AB-1'}:null}));
 const data={viviendasMantenimiento:houses,proyectosExtraordinarios:[
  {id:7,codigo:'MJ-P-2026',nombre:'Proyecto prueba',fechaInicio:'2026-11-01',viviendasDetalle:detail},
  {id:8,codigo:'OTRO',nombre:'Otro proyecto',viviendasDetalle:[]}]};
 const movimientos=[
  {casaId:1,cargoId:1,monto:200,fecha:'2026-11-03',referencia:'AB-1',origen:'ADMIN',formaPago:'EFECTIVO'},
  {casaId:3,cargoId:3,monto:1000,fecha:'2026-11-03',referencia:'HIST-3',origen:'EXCEL_HISTORICO',formaPago:'OTRO'}];
 return {data,movimientos};
}
test('231 viviendas; ocho hojas, parciales, no aplica y orígenes financieros',()=>{
 const {data,movimientos}=fixture();
 const r=mod.prepararReporteProyecto(data,'padron',7,movimientos);
 assert.deepEqual(r.hojas.map(h=>h.nombre),[
  'Todas las viviendas','Pago registrado','Sin Pagar','Finanzas','Desglose por calle',
  'Aportaciones','No aplica','Abonos parciales']);
 assert.equal(r.hojas[0].filas.length,231);
 assert.equal(r.hojas[1].filas.length,2);
 assert.equal(r.hojas[2].filas.length,229);
 assert.equal(r.hojas[5].filas.length,2);
 assert.equal(r.hojas[6].filas.length,1);
 assert.equal(r.hojas[7].filas.length,1);
 assert.deepEqual(r.dashboard.status,[['Meta alcanzada',1],['Sin meta completa',229]]);
 assert.equal(r.dashboard.indicadores.totalIngresos,1200);
 assert.equal(r.dashboard.indicadores.saldoDisponible,230000);
 assert.equal(r.dashboard.ingresos.reduce((sum,row)=>sum+row[1],0),1200);
 assert.match(r.archivo,/MJ_Extraordinarias_MJ-P-2026_padron\.xlsx/);
});
test('los cuatro botones generan un libro completo sin mezclar proyectos',()=>{
 const {data,movimientos}=fixture();
 for(const tipo of ['padron','pagadas','pendientes','historicas']){
  const r=mod.prepararReporteProyecto(data,tipo,7,movimientos);
  assert.equal(r.hojas[0].filas.length,231);
  assert.equal(r.hojas[5].filas.length,2);
  assert.equal(r.dashboard.esProyecto,true);
  assert.ok(r.nombre.endsWith(tipo));
 }
 assert.throws(()=>mod.prepararReporteProyecto(data,'padron',8,movimientos),/no contiene los cargos/);
 assert.throws(()=>mod.prepararReporteProyecto(data,'padron',999,movimientos),/Selecciona un proyecto/);
});
test('los campos externos no pueden inyectar fórmulas en Excel',()=>{
 const {data,movimientos}=fixture();
 data.viviendasMantenimiento[0].nombre='=HYPERLINK("https://invalid.test")';
 movimientos[0].referencia='=2+2';
 const report=mod.prepararReporteProyecto(data,'padron',7,movimientos);
 assert.equal(report.hojas[0].filas[0][3][0],"'");
 assert.equal(report.hojas[5].filas.find(x=>x[0]===1)[6][0],"'");
});
test('se reutilizan las gráficas nativas del libro original',()=>{
 assert.match(excel,/options\.report\|\|prepararReporte\(data,tipo\)/);
 assert.match(excel,/projectReport\?'Cumplimiento de la meta del proyecto'/);
 assert.match(excel,/projectReport\?'Aportaciones por origen'/);
 assert.match(excel,/projectReport\?'Meta, recaudación y saldos del proyecto'/);
 assert.match(ui,/renderProjectDashboard\(seleccionado\)/);
 assert.match(ui,/MJFinanceExcelProyectos\.prepararReporteProyecto/);
 assert.match(ui,/movimientos-exportacion/);
 assert.match(html,/analisis-excel-proyectos\.js/);
});
test('correo oficial registrado sin destinatarios elegidos desde el frontend',()=>{
 assert.match(email,/UsuarioCasa\.findAll/);
 assert.match(email,/cuentaAceptada:true,recibeCorreosPago:true/);
 assert.match(email,/mail\.enviarReciboAdjunto/);
 assert.match(email,/60000/);
 assert.doesNotMatch(email,/req\.body\.correo|body\.destinatario/);
 assert.match(ui,/Recibo enviado correctamente/);
 assert.match(html,/id="houseReceiptEmailInput"[^>]*readonly/);
 assert.match(html,/id="houseReceiptEmailSend"/);
});
test('sincronización con JWT de firma, sin consultas MySQL cada 20 segundos',()=>{
 assert.match(app,/app\.get\('\/api\/finanzas\/revision'/);
 assert.match(app,/require\('jsonwebtoken'\)\.verify/);
 assert.match(signal,/let revision=1/);
 assert.doesNotMatch(signal,/findAll|findOne|findByPk|sequelize\.query/);
 assert.match(ui,/setInterval\(\(\)=>\{void refreshWhenChanged\(\);\},20000\)/);
 assert.match(ui,/10\*60\*1000/);
 assert.match(ui,/document\.visibilityState==='hidden'/);
 assert.match(ui,/mj_analisis_return_v1/);
 assert.match(read('docs/zkteco.html'),/id="backToFinance"/);
});
test('noviembre no pierde la guardia bancaria; devuelve registros identificables',()=>{
 assert.match(controller,/tipoPago:'MANTENIMIENTO'/);
 assert.match(controller,/revision\.vinculos=linked/);
 assert.match(controller,/revision\.registrable=false/);
 assert.match(controller,/vinculos:revision\.vinculos\|\|\[\]/);
 assert.match(controller,/No se generará cobro ni orden duplicada al C3/);
});
test('sintaxis JS válida',()=>{
 for(const p of ['docs/assets/js/analisis-excel-proyectos.js','docs/assets/js/analisis-excel.js',
  'docs/assets/js/analisis-cuotas.js','backend/src/services/finanzas-live-signal.service.js',
  'backend/src/services/recibos-correo-analisis.service.js',
  'backend/src/controllers/recibos-correo-analisis.controller.js',
  'backend/src/controllers/pagos-manuales-analisis.controller.js'])
  assert.doesNotThrow(()=>new Function(read(p)),p);
});
