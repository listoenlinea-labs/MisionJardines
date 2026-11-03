'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {resumenEgresos}=require('../src/services/categorias-egresos.service');
const {referenciaEgreso}=require('../src/services/egreso-referencia.service');
const {validarCambio,categoriasEquivalentes,prepararAjuste,
 esAjuste}=require('../src/services/ajuste-egresos-mensuales.service');
const root=p=>fs.readFileSync(path.resolve(__dirname,'../../',p),'utf8');

test('las ocho categorías son válidas, y CFE/SIAPA incluyen los históricos LUZ/AGUA',()=>{
 const cambio=validarCambio({categoria:'CFE',periodo:'2026-01',
  totalAnterior:'11076.00',totalPagado:'10500.00'});
 assert.equal(cambio.inicio,'2026-01-01');
 assert.equal(cambio.fin,'2026-01-31');
 assert.equal(cambio.anterior,1107600);
 assert.equal(cambio.nuevo,1050000);
 assert.deepEqual(categoriasEquivalentes('CFE'),['CFE','LUZ']);
 assert.deepEqual(categoriasEquivalentes('SIAPA'),['SIAPA','AGUA']);
 assert.deepEqual(categoriasEquivalentes('CUOTA_EXTRAORDINARIA'),['CUOTA_EXTRAORDINARIA','PROYECTOS']);
 assert.deepEqual(categoriasEquivalentes('INTERNET'),['INTERNET']);
});
test('corregir un total con varios gastos genera la diferencia, sin borrar gastos originales',()=>{
 const cambio=validarCambio({categoria:'CFE',periodo:'2026-01',
  totalAnterior:'11076',totalPagado:'10500'});
 const original=[{monto:'5000.00'},{monto:'6076.00'}];
 const ajuste=prepararAjuste(cambio,original);
 assert.equal(ajuste.actual,1107600);
 assert.equal(ajuste.diferencia,-57600);
 assert.ok(esAjuste({concepto:ajuste.concepto}));
 const total=resumenEgresos([
  {fecha:'2026-01-02',categoria:'LUZ',monto:'5000.00'},
  {fecha:'2026-01-10',categoria:'CFE',monto:'6076.00'},
  {fecha:'2026-01-31',categoria:'CFE',monto:'-576.00',concepto:ajuste.concepto}
 ],'2026-01-01','2026-01-31');
 assert.equal(total.mes,10500);
 assert.equal(total.historialMensual.CFE[0].totalPagado,10500);
 assert.equal(total.conceptos.find(x=>x.categoria==='CFE').acumulado,10500);
 assert.equal(original.length,2);
});
test('ediciones sucesivas no se duplican y se rechaza la información desactualizada',()=>{
 const first=validarCambio({categoria:'CFE',periodo:'2026-01',totalAnterior:'11076',totalPagado:'10500'});
 const rows=[{monto:'5000'},{monto:'6076'}];
 const correction=prepararAjuste(first,rows);
 rows.push({monto:(correction.diferencia/100).toFixed(2)});
 assert.throws(()=>prepararAjuste(first,rows),e=>e.status===409&&/cambió/.test(e.message));
 const next=validarCambio({categoria:'CFE',periodo:'2026-01',totalAnterior:'10500',totalPagado:'11200'});
 assert.equal(prepararAjuste(next,rows).diferencia,70000);
 assert.equal(prepararAjuste(next,[...rows,{monto:'700'}]).diferencia,0);
});
test('importes negativos, exceso de decimales, categoría desconocida y meses inválidos se rechazan',()=>{
 const base={categoria:'CFE',periodo:'2026-11',totalAnterior:'100'};
 for(const totalPagado of ['-1','1.001','Infinity','NaN','','100000001']){
  assert.throws(()=>validarCambio({...base,totalPagado}),{status:400});
 }
 assert.throws(()=>validarCambio({...base,categoria:'LUZ',totalPagado:'100'}),{status:400});
 assert.throws(()=>validarCambio({...base,periodo:'2026-13',totalPagado:'100'}),{status:400});
 assert.throws(()=>validarCambio({...base,periodo:'2026-00',totalPagado:'100'}),{status:400});
 assert.throws(()=>validarCambio({...base,totalAnterior:'no',totalPagado:'100'}),{status:400});
});
test('el endpoint escribe asientos compensatorios en transacción, y no cambia gastos originales',async()=>{
 const source=root('backend/src/controllers/finanzas.controller.js');
 const from=source.indexOf('async function ajustarTotalEgresoMensual(');
 const to=source.indexOf('// Actualiza exclusivamente la tarifa futura',from);
 assert.ok(from>=0&&to>from);
 const tokenBetween=Symbol('between'),tokenIn=Symbol('in');
 const Op={between:tokenBetween,in:tokenIn};
 let transactions=0,creates=0;
 const items=[
  {id:1,categoria:'LUZ',fecha:'2026-01-02',monto:'5000.00',concepto:'Energía edificio'},
  {id:2,categoria:'CFE',fecha:'2026-01-10',monto:'6076.00',concepto:'Energía común'}
 ];
 const Egreso={
  async findAll({where,transaction,lock}){
   assert.equal(lock,'UPDATE');
   assert.ok(transaction);
   const [from,to]=where.fecha[tokenBetween],cats=where.categoria[tokenIn];
   return items.filter(x=>x.fecha>=from&&x.fecha<=to&&cats.includes(x.categoria));
  },
  async create(data,{transaction}){
   assert.ok(transaction);
   const id=items.length+1;
   const row={id,...data,async update(props){Object.assign(this,props);}};
   items.push(row);creates++;return row;
  }
 };
 const sequelize={async transaction(options,callback){
  transactions++;
  assert.equal(options.isolationLevel,'SERIALIZABLE');
  return callback({LOCK:{UPDATE:'UPDATE'}});
 }};
 const Transaction={ISOLATION_LEVELS:{SERIALIZABLE:'SERIALIZABLE'}};
 const fail=(status,message)=>Object.assign(new Error(message),{status});
 const sendErr=(res,e)=>res.status(e.status||503).json({ok:false,message:e.message});
 const fn=new Function('validarCambio','Transaction','sequelize','Egreso','Op',
  'categoriasEquivalentes','prepararAjuste','referenciaEgreso','sendErr','fail',
  source.slice(from,to)+'\nreturn ajustarTotalEgresoMensual;')(
   validarCambio,Transaction,sequelize,Egreso,Op,categoriasEquivalentes,prepararAjuste,
   referenciaEgreso,sendErr,fail);
 function response(){return {statusCode:200,headers:{},
  setHeader(k,v){this.headers[k]=v;return this;},
  status(n){this.statusCode=n;return this;},
  json(body){this.body=body;return this;}};}
 const req=amount=>({usuario:{usuarioId:5},body:{categoria:'CFE',periodo:'2026-01',
  totalAnterior:'11076',totalPagado:amount}});
 const res=response();
 await fn(req('10500'),res);
 assert.equal(res.body.ok,true);
 assert.equal(res.body.data.ajuste,-576);
 assert.equal(items[0].monto,'5000.00');
 assert.equal(items[1].monto,'6076.00');
 assert.equal(items[2].monto,'-576.00');
 assert.equal(items[2].registradoPor,5);
 assert.match(items[2].referencia,/^EGR-20260131-\d{6}$/);
 assert.equal(creates,1);
 const stale=response();
 await fn(req('10500'),stale);
 assert.equal(stale.statusCode,409);
 assert.equal(creates,1);
 const next=response();
 await fn({usuario:{usuarioId:5},body:{categoria:'CFE',periodo:'2026-01',
   totalAnterior:'10500',totalPagado:'11200'}},next);
 assert.equal(next.body.data.ajuste,700);
 assert.equal(creates,2);
 const jan=resumenEgresos(items,'2026-01-01','2026-01-31');
 assert.equal(jan.historialMensual.CFE[0].totalPagado,11200);
 assert.equal(transactions,3);
});
test('UI expone editar/guardar/cancelar en el modal y la API está protegida para admins',()=>{
 const html=root('docs/analisis-cuotas.html'),
  js=root('docs/assets/js/analisis-cuotas.js'),
  routes=root('backend/src/routes/finanzas.routes.js'),
  ctrl=root('backend/src/controllers/finanzas.controller.js');
 assert.match(js,/data-edit-expense-month/);
 assert.match(js,/data-save-expense-month/);
 assert.match(js,/data-cancel-expense-month/);
 assert.match(js,/request\('\/egresos\/resumen-mensual'/);
 assert.match(js,/'PUT'/);
 assert.match(js,/await load\(\)/);
 assert.match(js,/expenseMonthlySaving/);
 assert.match(js,/event\.key==='Tab'/);
 assert.match(ctrl,/isolationLevel:Transaction\.ISOLATION_LEVELS\.SERIALIZABLE/);
 assert.match(ctrl,/lock:transaction\.LOCK\.UPDATE/);
 assert.match(ctrl,/esAjusteMensual:esAjuste\(e\)/);
 assert.match(js,/!e\.esAjusteMensual/);
 assert.match(routes,/router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
 assert.match(routes,/router\.put\('\/egresos\/resumen-mensual',controller\.ajustarTotalEgresoMensual\)/);
 assert.match(html,/id="financeExpenseHistoryRows"/);
});
