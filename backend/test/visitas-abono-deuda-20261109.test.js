'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Visitas tiene cuadrícula por calles, historial y formulario móvil de una sola columna',()=>{
 const html=read('docs/visitas.html');
 assert.match(html,/id="visitHouseGrid"/);
 assert.match(html,/id="visitTabHomes"/);
 assert.match(html,/id="visitTabHistory"/);
 assert.match(html,/id="visitHistoryPanel"/);
 assert.match(html,/openVisit\(h\)/);
 assert.match(html,/grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(html,/id="visitTime"/);
 assert.match(html,/\$\('visitType'\)\.value='OTRO'/);
 assert.match(html,/timeZone:MEXICO_TIME_ZONE,hour:'2-digit',minute:'2-digit'/);
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
  if(match[1].trim())assert.doesNotThrow(()=>new vm.Script(match[1]));
});
test('Abono con adeudo no adelanta el último pago ni aplica recargo posterior por un mes pagado a tiempo',()=>{
 const {estadoPeriodo,ultimoPagado,contextoCuotas}=require('../src/services/cuotas-mantenimiento-calculo');
 const c={anio:2026,mes:'NOVIEMBRE',estatusPago:'PAGO_PARCIAL',origenImportacion:'MANUAL_ABONO_ADEUDO',
   montoPagado:300,recargo:0,recargoPagado:0,fechaPago:'2026-11-09'};
 const index=2026*12+10;
 const saldo=estadoPeriodo(c,index,'2026-11-15',300);
 assert.equal(saldo.faltante,0);
 assert.equal(saldo.recargoPendiente,0);
 assert.equal(ultimoPagado([c]),null);
 assert.ok(contextoCuotas([c],'2026-11-15',300).adeudoTotal>0);
});
test('La vista de morosos sigue pendiente aunque exista abono del mes',()=>{
 const {estadoPeriodoMantenimiento}=require('../src/services/estado-mantenimiento-tablas.service');
 const status=estadoPeriodoMantenimiento(
   {estatusPago:'PAGO_PARCIAL',origenImportacion:'MANUAL_ABONO_ADEUDO'},
   {saldoPendiente:2000},2026,11);
 assert.equal(status,'PENDIENTE');
});
test('Los recibos de abono con adeudo no incluyen importe de deuda y muestran el mes',()=>{
 Object.assign(process.env,{
  DB_HOST:process.env.DB_HOST||'localhost',DB_PORT:process.env.DB_PORT||'3306',
  DB_NAME:process.env.DB_NAME||'test',DB_USER:process.env.DB_USER||'test',DB_PASSWORD:process.env.DB_PASSWORD||'unused'
 });
 const {datosDeMovimiento}=require('../src/services/recibo-mantenimiento-analisis.service');
 const cuota={
  id:17,anio:2026,mes:'NOVIEMBRE',estatusPago:'PAGO_PARCIAL',origenImportacion:'MANUAL_ABONO_ADEUDO',
  montoPagado:300,recargo:0,formaPago:'EFECTIVO',referencia:'MJABONO:unit-test',
  fechaPago:'2026-11-09',fechaConfirmacion:'2026-11-09'
 };
 const {recibo}=datosDeMovimiento({
  id:18,calle:'Rosas',calleCorrecta:'Rosas',numero:'18',nombre:'Residente'
 },[cuota],[],new Date('2026-11-09T15:00:00Z'),null,'MJABONO:unit-test');
 assert.equal(recibo.abonoConAdeudo,true);
 assert.equal(recibo.mes,'NOVIEMBRE 2026');
 assert.equal(recibo.montoPagado,300);
 assert.equal(recibo.sello,'ABONO CON ADEUDO');
 assert.equal(recibo.saldoPendiente,undefined);
 assert.match(read('backend/src/services/pdf.service.js'),/Deudas pendientes por aclarar/);
});
test('El frontend mantiene independientes flujo ordinario y abono especial',()=>{
 const html=read('docs/analisis-cuotas.html');
 const js=read('docs/assets/js/analisis-cuotas.js');
 assert.match(html,/id="houseAbonoAdeudoOpen"/);
 assert.match(html,/id="houseAbonoAdeudoPanel"/);
 assert.match(js,/await request\('\/pagos-vivienda\/abono-con-adeudo'/);
 assert.match(js,/await openHouseReceipt\(casaId,result.referencia\)/);
 assert.doesNotThrow(()=>new vm.Script(js));
});
