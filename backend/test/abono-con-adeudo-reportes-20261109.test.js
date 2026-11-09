'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {ultimoAbonoConAdeudo}=require('../src/services/abono-con-adeudo-resumen.service');
const {historialMantenimiento}=require('../src/services/historial-pagos-vivienda.service');
const {estadoPeriodoMantenimiento}=require('../src/services/estado-mantenimiento-tablas.service');
const {prepararReporte}=require('../../docs/assets/js/analisis-excel');
const policy=require('../../docs/assets/js/permissions');

const abono={
 id:41,anio:2026,mes:'NOVIEMBRE',montoPagado:300,recargo:0,
 estatusPago:'PAGO_PARCIAL',origenImportacion:'MANUAL_ABONO_ADEUDO',
 referencia:'MJABONO:prueba-001',fechaPago:'2026-11-09T15:00:00.000Z'
};
const folio='MJ-NOV-2026-1234567890-R18-M';
const rosas={
 casaId:18,calle:'Rosas',numero:'18',nombre:'Residente',estatus:'PENDIENTE',
 pagada:true,abonoConAdeudo:true,montoPagado:300,saldoPendiente:3500,
 ultimoAbonoConAdeudo:{anio:2026,mes:'NOVIEMBRE',monto:300,fecha:abono.fechaPago,
  referencia:abono.referencia,folio},tags:{detalle:[]}
};
const gardenias={
 casaId:5,calle:'Gardenias',numero:'5',nombre:'Residente',
 estatus:'PAGADO',pagada:true,montoPagado:300,saldoPendiente:0,tags:{detalle:[]}
};
const reporteMock={
 periodo:'NOVIEMBRE 2026',anio:2026,mes:11,esCargaHistorica:false,
 viviendas:[rosas,gardenias],cuotasPeriodoDetalle:[{
   id:41,casaId:18,calle:'Rosas',numero:'18',anio:2026,mes:'NOVIEMBRE',
   estatus:'PAGO_PARCIAL',montoPagado:300,origen:'MANUAL_ABONO_ADEUDO'
 }]
};

test('El rol de Seguridad siempre inicia en Conmutador, sin quitar acceso a Seguridad/Visitas',()=>{
 assert.equal(policy.landing('SEGURIDAD'),'conmutador.html');
 for(const target of ['conmutador.html','seguridad.html','visitas.html'])
  assert.equal(policy.canAccess('SEGURIDAD',target),true);
 assert.equal(policy.landing('ADMINISTRADOR'),'index.html');
 const index=read('docs/index.html');
 const shell=read('docs/assets/js/app-shell.js');
 assert.match(index,/role === 'SEGURIDAD'/);
 assert.match(index,/window\.location\.replace\('app\.html\?page=conmutador\.html'\)/);
 assert.match(shell,/const raw = resolveEntry\(/);
 assert.match(shell,/const target = resolveEntry\(/);
});

test('Un abono solo aparece si tiene referencia, importe, mes aplicable y deuda anterior',()=>{
 const cuota=ultimoAbonoConAdeudo([abono],2026,11,3500);
 assert.equal(cuota.monto,300);
 assert.equal(cuota.mes,'NOVIEMBRE');
 assert.equal(ultimoAbonoConAdeudo([abono],2026,10,3500),null);
 assert.equal(ultimoAbonoConAdeudo([abono],2026,11,0),null);
 assert.equal(ultimoAbonoConAdeudo([{...abono,origenImportacion:'MANUAL_ANALISIS'}],2026,11,3500),null);
 assert.equal(ultimoAbonoConAdeudo([{...abono,montoPagado:0}],2026,11,3500),null);
});

test('El historial conserva el movimiento especial con fecha, mes y monto',()=>{
 const movs=historialMantenimiento([abono],[]);
 assert.equal(movs.length,1);
 assert.equal(movs[0].fuente,'ABONO_CON_ADEUDO');
 assert.equal(movs[0].monto,300);
 assert.equal(movs[0].referencia,abono.referencia);
 assert.deepEqual(movs[0].periodos.map(p=>p.mes+' '+p.anio),['NOVIEMBRE 2026']);
 assert.equal(estadoPeriodoMantenimiento(abono,{saldoPendiente:3500},2026,11),'PENDIENTE');
});

test('Todos los Excel incluyen al moroso con abono, folio válido y sin contarlo como pagado completo',()=>{
 for(const tipo of ['padron','pagadas','pendientes','historicas']){
  const reporte=prepararReporte(reporteMock,tipo);
  const hoja=reporte.hojas.find(h=>h.nombre==='Abono con adeudo');
  assert.ok(hoja,'Falta hoja del abono en '+tipo);
  assert.equal(hoja.filas.length,1);
  assert.equal(hoja.filas[0][hoja.columnas.indexOf('Abono con adeudo')],'Sí');
  assert.equal(hoja.filas[0][hoja.columnas.indexOf('Estado del mes')],'PENDIENTE');
  assert.equal(hoja.filas[0][hoja.columnas.indexOf('Importe del abono (MXN)')],300);
  assert.equal(hoja.filas[0][hoja.columnas.indexOf('Folio abono con adeudo')],folio);
  assert.equal(reporte.enlacesAbonos['18'].referencia,abono.referencia);
 }
 const padron=prepararReporte(reporteMock,'padron');
 assert.equal(padron.dashboard.indicadores.completas,1);
 assert.equal(padron.dashboard.indicadores.pendientes,1);
 assert.equal(padron.dashboard.indicadores.abonos,1);
 assert.equal(padron.hojas.find(s=>s.nombre==='Sin Pagar').filas.length,1);
 assert.equal(padron.hojas.find(s=>s.nombre==='Pago registrado').filas.length,2);
 assert.ok(padron.resumen.some(([a,b])=>/con abono con adeudo/.test(a)&&b===1));
});

test('El frontend mantiene la deuda roja, el filtro y el botón de confirmación desactivado',()=>{
 const html=read('docs/analisis-cuotas.html');
 const js=read('docs/assets/js/analisis-cuotas.js');
 assert.match(html,/<option value="ABONO_CON_ADEUDO">Abono con adeudo<\/option>/);
 assert.match(html,/id="houseAbonoAdeudoSave"[^>]*disabled/);
 assert.match(js,/if\(status==='ABONO_CON_ADEUDO'\)/);
 assert.match(js,/house-row-overdue/);
 assert.match(js,/house-abono-debt-tag/);
 assert.match(js,/addEventListener\('change',syncAbonoAdeudoConfirm\)/);
 assert.match(js,/p\.fuente==='ABONO_CON_ADEUDO'/);
 assert.match(js,/historial\?concepto=MANTENIMIENTO/);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.doesNotThrow(()=>new vm.Script(read('docs/assets/js/analisis-excel.js')));
 assert.doesNotThrow(()=>new vm.Script(read('backend/src/controllers/finanzas.controller.js')));
});
