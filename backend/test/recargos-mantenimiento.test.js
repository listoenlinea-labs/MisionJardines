const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'unused'});
const pricing = require('../src/services/mensualidades-mantenimiento');
const service = require('../src/services/recargos-mantenimiento.service');
const Casa = require('../src/models/Casa');
const Tags = require('../src/models/ZkTarjeta');
const Pago = require('../src/models/PagoReportado');
const Eventos = require('../src/models/PagoAccesoC3');
const Recargos = require('../src/models/RecargoMantenimiento');
const direct = require('../src/services/zkteco-direct.service');
const tx = { LOCK: { UPDATE:'UPDATE' } };
const quote = (date, amount, end, extra={}) => pricing.cotizar(date,amount,{hoy:'2027-12-31',fechaFinal:end,...extra});
test('pago el 8 avanza octubre y un adelanto el 12 sin recargo avanza diciembre',()=>{
 const first=quote('2026-10-08','300','2026-10-10');
 assert.equal(first.recargo,0);assert.equal(first.meses,1);
 const second=quote('2026-10-12','300','2026-11-10');
 assert.equal(second.recargo,0);assert.equal(second.meses,1);
});
test('corte inclusive, atrasos entre meses y años, sin recargo sobre meses adelantados',()=>{
 assert.deepEqual(pricing.cortesVencidos('2026-10-10','2026-10-10'),[]);
 assert.deepEqual(pricing.cortesVencidos('2026-10-10','2026-10-11'),['2026-10-10']);
 assert.deepEqual(pricing.cortesVencidos('2026-10-11','2026-10-11'),['2026-10-10']);
 assert.deepEqual(pricing.cortesVencidos('2026-09-10','2026-10-12'),['2026-09-10','2026-10-10']);
 assert.deepEqual(pricing.cortesVencidos('2026-12-10','2027-02-10'),['2026-12-10','2027-01-10']);
 const x=quote('2026-10-12','950','2026-10-10');assert.equal(x.meses,3);assert.equal(x.recargo,50);
});
test('recargos cubiertos no se repiten cuando el primer pago deja la fecha vencida',()=>{
 const first=quote('2026-10-12','400','2026-09-10');
 assert.equal(first.recargo,100);assert.equal(first.meses,1);
 const second=quote('2026-10-12','300','2026-10-10',{cortesPagados:first.cortesRecargo});
 assert.equal(second.recargo,0);assert.equal(second.meses,1);
 const next=quote('2026-11-12','350','2026-11-10',{cortesPagados:first.cortesRecargo});
 assert.equal(next.recargo,50);
});
test('importe neto, remanentes y saldo a favor usan centavos; sin redondear meses hacia arriba',()=>{
 const x=quote('2026-10-12','1500','2026-10-10');assert.equal(x.recargo,50);assert.equal(x.meses,4);assert.equal(x.saldoParcial,250);
 const y=quote('2026-10-12','50','2027-02-10',{saldoParcial:250});assert.equal(y.meses,1);assert.equal(y.saldoParcial,0);
 assert.throws(()=>quote('2026-10-12','50','2026-10-10'));
 assert.throws(()=>quote('2026-10-12','300.001','2026-11-10'));
 assert.throws(()=>quote('2026-10-12','11100','2026-11-10'));
 assert.throws(()=>quote('2026-02-30','300','2026-11-10'));
 assert.throws(()=>quote('2026-10-12','300',null));
});
function setup(t) {
 let dates=['2026-11-10'], pendingProof=null,pendingEvent=null,saldo=0;
 const rows=[];
 t.mock.method(Casa,'findByPk',async()=>({id:7}));
 t.mock.method(Pago,'findOne',async()=>pendingProof);
 t.mock.method(Eventos,'findOne',async options=>options.order?{saldoDespues:saldo}:pendingEvent);
 t.mock.method(Tags,'findAll',async()=>dates.map((_,i)=>({numeroTarjeta:String(i)})));
 t.mock.method(direct,'readUserValidity',async card=>({fechaFinal:dates[Number(card)]}));
 t.mock.method(Recargos,'findAll',async()=>rows);
 t.mock.method(Recargos,'findOne',async options=>rows.find(r=>r.casaId===options.where.casaId&&r.corte===options.where.corte));
 t.mock.method(Recargos,'create',async v=>{rows.push(v);return v;});
 return { rows, dates(v){dates=v},pendingProof(v){pendingProof=v},pendingEvent(v){pendingEvent=v},saldo(v){saldo=v} };
}
test('contexto consulta fecha física, saldo financiero y cortes pagados, no el espejo SQL',async t=>{
 const c=setup(t);c.saldo(25000);
 const x=await service.cotizar(7,'2026-10-08','50',tx);
 assert.equal(x.recargo,0);assert.equal(x.meses,1);assert.equal(x.fechaFinalC3,'2026-11-10');
});
test('cotización bloquea sin TAG, fechas físicas distintas, pendientes y fecha física inválida',async t=>{
 const c=setup(t);
 for(const dates of [[],['2026-10-10','2026-11-10'],[null]]) {
  c.dates(dates);await assert.rejects(()=>service.contexto(7,'2026-10-08',tx));
 }
 c.dates(['2026-11-10']);c.pendingProof({id:1});await assert.rejects(()=>service.contexto(7,'2026-10-08',tx),/comprobante/);
 c.pendingProof(null);c.pendingEvent({id:2});await assert.rejects(()=>service.contexto(7,'2026-10-08',tx),/incremento/);
});
test('confirmación reserva cada corte una vez; reintento propio permite y otro pago rechaza',async t=>{
 const c=setup(t);const p={id:1,casaId:7,recargo:100,fechaOperacion:'2026-10-12',cortesRecargo:['2026-09-10','2026-10-10']};
 await service.confirmar(p,tx);await service.confirmar(p,tx);assert.equal(c.rows.length,2);
 await assert.rejects(()=>service.confirmar({...p,id:2},tx),/ya tiene/);
 await service.confirmar({id:3,casaId:7},tx);assert.equal(c.rows.length,2);
});
test('aprobar registra los cortes junto al pago y revierte ambos si falla el diario de acceso',async t=>{
 const c=setup(t);
 const db=require('../src/config/database');
 const controller=require('../src/controllers/pagos.controller');
 const vigencia=require('../src/services/vigencia-mantenimiento.service');
 const payment={id:9,casaId:7,tipoPago:'MANTENIMIENTO',estatus:'PENDIENTE_VALIDACION',
   monto:'400.00',recargo:'100.00',fechaOperacion:'2026-10-12',cortesRecargo:['2026-09-10','2026-10-10'],
   async update(v){Object.assign(this,v);return this;}};
 t.mock.method(Pago,'findByPk',async()=>payment);
 t.mock.method(db,'transaction',async(options,callback)=>{
   const snapshot={...payment}, ledger=c.rows.map(r=>({...r}));
   try{return await callback(tx);}catch(e){Object.assign(payment,snapshot);c.rows.splice(0,c.rows.length,...ledger);throw e;}
 });
 let fail=true;
 t.mock.method(vigencia,'actualizar',async()=>{if(fail)throw Error('failed outbox');return {meses:1};});
 t.mock.method(vigencia,'estadoCasa',async()=>({fuente:'C3'}));
 const req={params:{id:9},usuario:{usuarioId:2},body:{estatus:'VALIDADO'},headers:{},protocol:'https',get:()=> 'test'};
 const response=()=>({code:200,status(v){this.code=v;return this;},json(v){this.body=v;return this;}});
 const bad=response();await controller.revisarPago(req,bad);
 assert.equal(bad.code,503);assert.equal(payment.estatus,'PENDIENTE_VALIDACION');assert.equal(c.rows.length,0);
 fail=false;
 for(let i=0;i<2;i++){const res=response();await controller.revisarPago(req,res);assert.equal(res.code,200);}
 assert.equal(c.rows.length,2);assert.equal(payment.estatus,'VALIDADO');
});
