const test=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'unused',JWT_SECRET:'test-secret'});
require('../src/services/folios.service').generarSiguienteFolio=async()=> 'MJ-2026-TEST';
require('../src/services/pago-reportado-pdf.service').generarReciboPagoReportado=async()=>({buffer:Buffer.from('pdf'),fileName:'test.pdf',mimeType:'application/pdf'});
const controller=require('../src/controllers/pagos.controller');
const models=require('../src/models');
const db=require('../src/config/database');
const vigencia=require('../src/services/vigencia-mantenimiento.service');
const flags=require('../src/config/pagos-pruebas');
const pricing=require('../src/services/mensualidades-mantenimiento');
const recargos=require('../src/services/recargos-mantenimiento.service');
const respuesta=()=>({code:200,status(x){this.code=x;return this},json(v){this.body=v;return this}});
function setup(t,{date='2026-10-08',amount='300.00',tipo='MANTENIMIENTO'}={}){
 let payment=null;const events=[];
 const tx={async commit(){events.push('commit');this.finished=true},async rollback(){events.push('rollback');this.finished=true}};
 t.mock.method(db,'transaction',async()=>tx);
 t.mock.method(recargos,'cotizar',async(casa,date,monto)=>pricing.cotizar(date,monto,{fechaFinal:'2026-10-10'}));
 t.mock.method(models.PagoReportado,'findOne',async()=>null);
 t.mock.method(models.Casa,'findByPk',async()=>({id:5,calle:'Gardenias',numero:'5'}));
 t.mock.method(models.Usuario,'findByPk',async()=>({id:9,nombre:'Prueba'}));
 t.mock.method(models.CuotaExtraordinaria,'findOne',async()=>({id:1,monto:300,concepto:'Proyecto'}));
 t.mock.method(models.PagoReportado,'create',async values=>{
  payment={id:1,...values,async update(data){Object.assign(this,data)}};
  events.push('create');return payment;
 });
 t.mock.method(models.PagoReportado,'findByPk',async()=>payment);
 t.mock.method(vigencia,'actualizar',async()=>assert.fail('Nunca actualizar C3 por imagen sin validar'));
 const req={usuario:{casaId:5,usuarioId:9},headers:{},protocol:'https',get:()=>'test.local',
 body:{tipoPago:tipo,cuotaExtraordinariaId:1,folioOperacion:'TEST-1',fechaOperacion:date,
 horaOperacion:'12:00',monto:amount,comprobanteData:'data:image/png;base64,YQ=='}};
 return{req,res:respuesta(),events,get payment(){return payment;}};
}
test('subir imagen siempre deja el pago PENDIENTE_VALIDACION, sin activar accesos',async t=>{
 const x=setup(t);await controller.reportarPago(x.req,x.res);
 assert.equal(flags.VALIDAR_PAGOS_SIN_ADMIN,false);
 assert.equal(x.res.code,201);assert.equal(x.payment.estatus,'PENDIENTE_VALIDACION');
 assert.equal(x.payment.recargo,0);assert.deepEqual(x.events,['create','commit']);
});
test('8 de octubre: 300 cotiza una mensualidad sin imponer fecha al C3',()=>{
 assert.deepEqual(pricing.cotizar('2026-10-08','300.00',{hoy:'2026-11-30',fechaFinal:'2026-10-10'}).meses,1);
});
test('8 de noviembre: 300 cotiza una mensualidad sin fecha base',()=>{
 const x=pricing.cotizar('2026-11-08','300.00',{hoy:'2026-11-08',fechaFinal:'2026-11-10'});
});
test('adelantos: 600 y 900 cubren dos y tres mensualidades',()=>{
 for(const [amount,months,end]of [['600.00',2,'2026-12-10'],['900.00',3,'2027-01-10']]){
  assert.equal(pricing.cotizar('2026-10-08',amount,{hoy:'2026-10-08',fechaFinal:'2026-10-10'}).meses,months);
 }
});
test('un adelanto después del día 10 no lleva recargo',()=>{
 const one=pricing.cotizar('2026-11-11','300.00',{hoy:'2026-11-11',fechaFinal:'2026-12-10'});
 assert.equal(one.recargo,0);assert.equal(one.meses,1);
});
test('el backend rechaza menos de la tarifa sin registrar el comprobante',async t=>{
 const x=setup(t,{date:'2026-10-08',amount:'299.99'});
 await controller.reportarPago(x.req,x.res);
 assert.equal(x.res.code,400);assert.deepEqual(x.events,['rollback']);
});
test('pago extraordinario no activa los accesos del C3',async t=>{
 const x=setup(t,{tipo:'EXTRAORDINARIO'});await controller.reportarPago(x.req,x.res);
 assert.equal(x.res.code,201);assert.equal(x.payment.estatus,'PENDIENTE_VALIDACION');assert.equal(x.res.body.vigencia,null);
});
test('no se puede dar doble ingreso al mismo folio bancario',async t=>{
 const x=setup(t);models.PagoReportado.findOne=async()=>({id:1});
 await controller.reportarPago(x.req,x.res);
 assert.equal(x.res.code,409);assert.deepEqual(x.events,[]);
});
