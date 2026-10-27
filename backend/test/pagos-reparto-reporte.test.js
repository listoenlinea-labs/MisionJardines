'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'unused'});
const lector=require('../src/services/comprobante-lector.service');
const fields={referencia:'1234567',amount:'600.00',date:'2026-10-07',time:'12:00:00'};
lector.comprobarDestino=async opts=>{
 assert.equal(opts.exigirCampos,true);
 lector.validarCamposExtraidos(opts,fields,true);
 return {texto:'Referencia 1234567',extraido:fields};
};
require('../src/services/folios.service').generarSiguienteFolio=async()=> 'MJ-SINTETICO';
require('../src/services/pago-reportado-pdf.service').generarReciboPagoReportado=async()=>({buffer:Buffer.from('pdf'),fileName:'prueba.pdf',mimeType:'application/pdf'});
const controller=require('../src/controllers/pagos.controller');
const models=require('../src/models');
const db=require('../src/config/database');
function setup(t){
 let payment,commits=0,rollbacks=0;
 const tx={LOCK:{UPDATE:'UPDATE'},async commit(){commits++;this.finished=true;},async rollback(){rollbacks++;this.finished=true;}};
 t.mock.method(db,'transaction',async()=>tx);
 t.mock.method(models.UsuarioCasa,'findAll',async()=>[1,2].map(casaId=>({casaId})));
 t.mock.method(models.Casa,'findByPk',async id=>({id,calle:'Calle ficticia',numero:String(id),cuotaPorCobrar:300,exencionesRecargo:[{desde:'2026-01'}]}));
 t.mock.method(models.Usuario,'findByPk',async()=>({id:2,nombre:'Usuario sintético'}));
 t.mock.method(models.Cuota,'findOne',async({where})=>({casaId:where.casaId,anio:2026,mes:'SEPTIEMBRE',montoPagado:300,estatusPago:'PAGADO'}));
 t.mock.method(models.Cuota,'findAll',async()=>[]);
 t.mock.method(models.Cuota,'create',async()=>assert.fail('Reportar no acredita cuotas'));
 t.mock.method(models.PagoReportado,'findOne',async()=>null);
 t.mock.method(models.PagoReportado,'create',async values=>{payment={id:1,...values,async update(v){Object.assign(this,v);},toJSON(){return {...this};}};return payment;});
 t.mock.method(models.PagoReportado,'findByPk',async()=>payment);
 const req={usuario:{casaId:2,usuarioId:2,rol:'CONDOMINO'},headers:{},protocol:'https',get:()=>'prueba.invalid',
  body:{tipoPago:'MANTENIMIENTO',folioOperacion:'1234567',fechaOperacion:'2026-10-07',horaOperacion:'12:00:00',monto:600,
   comprobanteData:'data:image/png;base64,YQ==',reparto:[{casaId:1,monto:300},{casaId:2,monto:300}]}};
 const res={code:200,status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
 return {req,res,get payment(){return payment;},get commits(){return commits;},get rollbacks(){return rollbacks;}};
}
test('HTTP guarda un solo comprobante de 600 con dos asignaciones pendientes de 300',async t=>{
 const c=setup(t);await controller.reportarPago(c.req,c.res);
 assert.equal(c.res.code,201);assert.equal(c.payment.monto,600);assert.equal(c.payment.estatus,'PENDIENTE_VALIDACION');
 assert.equal(c.payment.aplicacionCuotas.version,3);assert.equal(c.payment.aplicacionCuotas.aplicado,false);assert.equal(c.commits,1);
 assert.equal(c.res.body.data.reparto.length,2);assert.equal(c.res.body.vigencia,null);
});
test('HTTP rechaza reparto que no suma el monto leído sin crear el reporte',async t=>{
 const c=setup(t);c.req.body.reparto[1].monto=299.99;await controller.reportarPago(c.req,c.res);
 assert.equal(c.res.code,400);assert.equal(c.payment,undefined);assert.equal(c.rollbacks,1);
});
test('HTTP no permite asignar a otra vivienda ni usar el total editado en vez del OCR',async t=>{
 const c=setup(t);c.req.body.reparto[1].casaId=88;await controller.reportarPago(c.req,c.res);
 assert.equal(c.res.code,400);assert.equal(c.payment,undefined);
});
test('HTTP rechaza monto del formulario diferente al de la imagen, incluso para admin',async t=>{
 const c=setup(t);c.req.usuario.rol='ADMINISTRADOR';c.req.body.monto=601;await controller.reportarPago(c.req,c.res);
 assert.equal(c.res.code,422);assert.equal(c.payment,undefined);assert.equal(c.commits,0);
});
