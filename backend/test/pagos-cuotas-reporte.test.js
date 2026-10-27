'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'unused'});
// Solo OCR y PDF se sustituyen: el reparto financiero y la cotización son reales.
require('../src/services/comprobante-lector.service').comprobarDestino=async()=>({
 texto:'Referencia\n1234567',extraido:{referencia:'1234567'}
});
require('../src/services/folios.service').generarSiguienteFolio=async()=> 'MJ-SINTETICO';
require('../src/services/pago-reportado-pdf.service').generarReciboPagoReportado=async()=>({buffer:Buffer.from('pdf'),fileName:'prueba.pdf',mimeType:'application/pdf'});
const controller=require('../src/controllers/pagos.controller');
const models=require('../src/models');
const db=require('../src/config/database');
const direct=require('../src/services/zkteco-direct.service');
function setup(t,monto='350.00'){
 let payment,commits=0,rollbacks=0;
 const tx={LOCK:{UPDATE:'UPDATE'},async commit(){commits++;this.finished=true;},async rollback(){rollbacks++;this.finished=true;}};
 t.mock.method(db,'transaction',async()=>tx);
 t.mock.method(models.Casa,'findByPk',async()=>({id:7,calle:'Calle sintética',numero:'1',cuotaPorCobrar:300}));
 t.mock.method(models.Usuario,'findByPk',async()=>({id:2,nombre:'Usuario sintético'}));
 t.mock.method(models.Cuota,'findAll',async()=>[{id:1,casaId:7,anio:2026,mes:'SEPTIEMBRE',montoPagado:300,estatusPago:'PAGADO'}]);
 t.mock.method(models.Cuota,'create',async()=>assert.fail('reportar no acredita cuotas'));
 t.mock.method(models.PagoReportado,'findOne',async()=>null);
 t.mock.method(models.PagoReportado,'create',async values=>{payment={id:1,...values,async update(v){Object.assign(this,v);},toJSON(){return {...this};}};return payment;});
 t.mock.method(models.PagoReportado,'findByPk',async()=>payment);
 t.mock.method(direct,'readUserValidity',async()=>assert.fail('cotizar/reportar no consulta C3'));
 const req={usuario:{casaId:7,usuarioId:2,rol:'CONDOMINO'},headers:{},protocol:'https',get:()=>'prueba.invalid',
  body:{tipoPago:'MANTENIMIENTO',folioOperacion:'1234567',fechaOperacion:'2026-10-15',horaOperacion:'12:00:00',monto,comprobanteData:'data:image/png;base64,YQ=='}};
 const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
 return {req,res,get payment(){return payment;},get commits(){return commits;},get rollbacks(){return rollbacks;}};
}
test('Reporte sin TAG: guarda reparto pendiente y conserva la validación bancaria obligatoria',async t=>{
 const c=setup(t);await controller.reportarPago(c.req,c.res);
 assert.equal(c.res.code,201);assert.equal(c.payment.estatus,'PENDIENTE_VALIDACION');
 assert.equal(c.payment.recargo,50);assert.equal(c.payment.aplicacionCuotas.meses,1);
 assert.equal(c.payment.aplicacionCuotas.fechaFinalObjetivo,'2026-11-10');
 assert.equal(c.payment.aplicacionCuotas.aplicado,undefined);assert.equal(c.commits,1);assert.equal(c.res.body.vigencia,null);
});
test('Abono parcial guarda el faltante de la cuota, sin conceder mensualidades',async t=>{
 const c=setup(t,'300.00');await controller.reportarPago(c.req,c.res);
 assert.equal(c.res.code,201);assert.equal(c.payment.aplicacionCuotas.meses,0);
 assert.equal(c.payment.aplicacionCuotas.faltante,50);assert.match(c.payment.concepto,/Faltan \$50.00/);
});
test('Reporte acepta abono inferior al recargo y lo guarda pendiente, sin acreditar ni activar TAGs',async t=>{
 const c=setup(t,'20.00');await controller.reportarPago(c.req,c.res);
 assert.equal(c.res.code,201);assert.equal(c.payment.estatus,'PENDIENTE_VALIDACION');
 assert.equal(c.payment.monto,20);assert.equal(c.payment.recargo,20);
 assert.equal(c.payment.aplicacionCuotas.recargoPendienteDespues,30);
 assert.equal(c.payment.aplicacionCuotas.meses,0);assert.equal(c.payment.aplicacionCuotas.aplicado,undefined);
 assert.equal(c.commits,1);assert.equal(c.res.body.vigencia,null);
});
