'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {conciliarHistorico,extraerMovimientos,calle}=require('../backend/src/services/casa-club-historico-viviendas.service');
const header=()=>{const h=Array(12).fill('');h[0]='No. CASA';h[1]='CALLE';h[5]='PAGO RECUPERACIÓN';h[11]='ESTATUS PAGO';return h;};
const row=(casa,street,monto,estado='PAGADO',mes='Noviembre')=>{
 const r=Array(12).fill('');r[0]=casa;r[1]=street;r[3]=mes;r[5]=monto;r[11]=estado;return r;};
const fixture=()=>[['CONTROL'],header(),
 row(20,'Gardenias ','$700'),row(20,'GARDENIAS','$1,000'),
 row('0367','Misión Jardines','$1,000'),
 row(12,'MISION LIRIOS','$250'),
 row(30,'Rosas','$700','CANCELADO'),
 row(99,'Rosas','$1,000')
];
test('normaliza prefijos, tildes y capitalización sin mezclar calles distintas',()=>{
 assert.equal(calle('Misión jardines'),'JARDINES');
 assert.equal(calle('MISION LIRIOS'),'LIRIOS');
 assert.equal(calle('Jardines'),'JARDINES');
 assert.notEqual(calle('Lirios'),calle('Jardines'));
});
test('acumula pagos repetidos por vivienda y respeta importes históricos diferentes',()=>{
 const result=conciliarHistorico(fixture(),[
  {id:1,calle:'Gardenias',numero:20},{id:2,calleCorrecta:'Jardines',numero:367},
  {id:3,calle:'Lirios',numero:12}
 ]);
 assert.equal(result.total,3950);
 assert.equal(result.registros,5);
 assert.equal(result.excluidos,1);
 assert.equal(result.porCasa['1'].monto,1700);
 assert.equal(result.porCasa['1'].cantidad,2);
 assert.equal(result.porCasa['2'].monto,1000);
 assert.equal(result.porCasa['3'].monto,250);
 assert.equal(result.coincidencias,4);
 assert.equal(result.cantidadSinConciliar,1);
 assert.equal(result.sinConciliar[0].motivo,'SIN_VIVIENDA');
 assert.equal(result.porCalle.reduce((sum,x)=>sum+x.monto,0),3950);
});
test('si hay dos casas con la misma clave no acredita ninguna por ambigüedad',()=>{
 const result=conciliarHistorico([['CONTROL'],header(),row(20,'Gardenias','$1,000')],[
  {id:1,calle:'Gardenias',numero:20},{id:2,calle:'Misión Gardenias',numero:20}
 ]);
 assert.equal(result.coincidencias,0);
 assert.equal(result.cantidadSinConciliar,1);
 assert.equal(result.sinConciliar[0].motivo,'AMBIGUA');
});
test('solo PAGADO con importe positivo de columna F, nunca cancelados ni resumen',()=>{
 const rows=[['CONTROL'],header(),row(1,'Jardines','$700','PAGADO'),
 row(2,'Jardines','$700','CANCELADO'),row(3,'Jardines','$0','PAGADO'),
 row(4,'Jardines','$200','PENDIENTE')];
 const result=extraerMovimientos(rows);
 assert.equal(result.payments.length,1);
 assert.equal(result.payments[0].monto,700);
 assert.equal(result.excluded.length,1);
});
test('la interfaz tiene solo cuatro tarjetas y la columna muestra monto o No recuperado',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../docs/assets/js/analisis-cuotas.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../docs/analisis-cuotas.html'),'utf8');
 const chart=fs.readFileSync(path.join(__dirname,'../docs/assets/js/finanzas-ambitos-vista.js'),'utf8');
 const block=js.slice(js.indexOf('function renderClubDashboard(){'),js.indexOf('function renderBalanceCard(){'));
 assert.match(block,/\['Recaudación histórica 2026 · Google'/);
 assert.match(block,/\['Limpieza'/);
 assert.doesNotMatch(block,/\['Recuperación cobrada \(MySQL\)'/);
 assert.match(js,/No recuperado/);
 assert.match(js,/Google Sheets conectado · /);
 assert.doesNotMatch(html,/id="financeDriveState"/);
 assert.match(html,/id="financeClubGoogleHistory"/);
 assert.match(chart,/historical\.porCalle/);
});
