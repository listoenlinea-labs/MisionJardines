'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const balance=require('../../docs/assets/js/analisis-balance.js');
const {prepararReporte}=require('../../docs/assets/js/analisis-excel.js');
const {prepararReporteProyecto}=require('../../docs/assets/js/analisis-excel-proyectos.js');
const read=file=>fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');

test('balance mensual coincide con ambos paneles, sin sumarle saldo inicial',()=>{
 const b=balance.mensual({ingresosMantenimientoCalles:{mes:38100},
  egresosPorConcepto:{mes:38068},saldoInicial:10000});
 assert.equal(b.diferencia,32);
 assert.equal(b.estado,'SALDO_A_FAVOR');
 assert.equal(balance.mensual({ingresosMantenimientoCalles:{mes:100},
  egresosPorConcepto:{mes:200}}).estado,'SALDO_EN_CONTRA');
 assert.equal(balance.mensual({ingresosMantenimientoCalles:{mes:100},
  egresosPorConcepto:{mes:100}}).estado,'EN_EQUILIBRIO');
 assert.equal(balance.mensual({ingresosMantenimientoCalles:{mes:100}}),null);
});

test('diferencia de extraordinarias usa gastos reales, nunca presupuesto duplicado',()=>{
 const b=balance.proyecto({recaudado:1500.5,totalEsperado:3000,egresosReales:500});
 assert.equal(b.diferencia,1000.5);
 assert.equal(b.tipo,'EXTRAORDINARIO');
 assert.equal(b.estado,'SALDO_A_FAVOR');
 const club=balance.casaClub({ingresos:1200,egresos:1300});
 assert.equal(club.tipo,'CASA_CLUB');
 assert.equal(club.diferencia,-100);
 const maintenance=balance.mensual({ingresosMantenimientoCalles:{mes:5000},
  egresosPorConcepto:{mes:450},finanzasAmbitos:{MANTENIMIENTO:{egresos:200}}});
 assert.equal(maintenance.diferencia,4800);
});

test('HTML y CSS contienen tres gráficos adaptativos',()=>{
 const html=read('docs/analisis-cuotas.html');
 const css=read('docs/assets/css/analisis-cuotas.css');
 const js=read('docs/assets/js/analisis-cuotas.js');
 for(const id of ['financeIncomeCard','financeBalanceCard','financeExpenseCard',
  'financeBalanceDifference','financeBalanceStatus'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(js,/renderBalanceCard\(\)/);
 assert.match(html,/analisis-balance\.js/);
});

test('exportación incorpora balance y enlaces sin tokens dentro del Excel',()=>{
 const js=read('docs/assets/js/analisis-excel.js');
 const link=read('docs/recibo-excel.html');
 const login=read('docs/assets/js/login.js');
 assert.match(js,/kind:'bar'[\s\S]*?source:balanceEtiquetas/);
 assert.match(js,/cell\.value=\{text:ref,hyperlink:url\.href/);
 assert.match(js,/recibo-excel\.html/);
 assert.doesNotMatch(js,/JWT_SECRET|misionJardinesToken/);
 assert.match(link,/recibo\/vista/);
 assert.match(link,/Authorization:'Bearer '/);
 assert.match(login,/regresarRecibo/);
});

test('padrón conserva todas las viviendas y añade balance informativo en finanzas',()=>{
 globalThis.MJFinanceBalance=balance;
 try{
  const data={periodo:'NOVIEMBRE 2026',viviendasMantenimiento:[
   {casaId:1,calle:'Gardenias',numero:'4',estatus:'PAGADO',pagada:true,
    ultimoPago:{referencia:'ABC-123',fecha:'2026-11-09',monto:300}}
  ],ingresosReportados:{},ingresosMantenimientoCalles:{mes:38100},
   egresosPorConcepto:{mes:38068},ingresosParaBalance:38000,totalEgresos:38068};
  const report=prepararReporte(data,'padron');
  assert.equal(report.hojas[0].filas.length,1);
  assert.equal(report.dashboard.balanceMensual.diferencia,32);
  assert.ok(report.hojas.find(h=>h.nombre==='Finanzas').filas.some(x=>x[1]==='Saldo a favor'&&x[2]===32));
 }finally{delete globalThis.MJFinanceBalance;}
});
