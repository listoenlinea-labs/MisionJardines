'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sequelize=require('../src/config/database');
const {PagoReportado}=require('../src/models');
const banco=require('../src/services/banco-correo.service');
const relectura=require('../src/services/pagos-relectura-ocr.service');
const {solicitarReintento,elegible}=require('../src/services/pagos-reintento-validacion.service');

const asset=p=>fs.readFileSync(path.join(__dirname,'../..',p),'utf8');
const stub=t=>{
  t.mock.method(banco,'configurado',()=>true);
  t.mock.method(sequelize,'transaction',async (_options,action)=>action({LOCK:{UPDATE:'UPDATE'}}));
  t.mock.method(relectura,'programarRelectura',()=>{});
};
const row=(overrides={})=>({
  id:32,casaId:738,estatus:'RECHAZADO',
  correoBancarioHash:null,fechaValidacion:null,reciboFolio:null,reciboPdfData:null,
  aplicacionCuotas:{version:2},verificacionBancaria:{etapa:'FALLIDO',detalle:'No coincide vivienda',fechaRevision:'2026-10-26T23:00:00Z'},
  observacionesRevision:'No coincide vivienda',
  async update(data){Object.assign(this,data);this._writes=(this._writes||0)+1;},
  ...overrides
});

test('el usuario propietario puede reintentar el mismo registro fallido sin cambiar importes ni aprobarlo',async t=>{
  stub(t);
  const pago=row({monto:'10.00',folioOperacion:'COMPROBANTE_EXISTENTE'});
  t.mock.method(PagoReportado,'findOne',async ({where})=>{
    assert.deepEqual(where,{id:32,casaId:738});
    return pago;
  });
  const result=await solicitarReintento({pagoId:32,casaId:738,ahora:new Date('2026-10-26T23:02:00Z')});
  assert.deepEqual(result,{id:32,estatus:'PENDIENTE_VALIDACION',reintentos:1});
  assert.equal(pago.estatus,'PENDIENTE_VALIDACION');
  assert.equal(pago.verificacionBancaria.etapa,'REINTENTO_OCR');
  assert.equal(pago.monto,'10.00');
  assert.equal(pago.folioOperacion,'COMPROBANTE_EXISTENTE');
  assert.equal(pago.verificacionBancaria.historialReintentos[0].detalle,'No coincide vivienda');
  assert.equal(relectura.programarRelectura.mock.callCount(),1);
});
test('tener folio y PDF de reporte no impide reintentar',()=>{
  assert.equal(elegible(row({reciboFolio:'MJ-2026-0032',reciboPdfData:Buffer.from('RECIBO')})),true);
});
test('ni un VALIDADO ni uno con evidencia ya aplicada puede regresar a pendiente',async t=>{
  stub(t);
  for(const overrides of [
    {estatus:'VALIDADO'}, {correoBancarioHash:'abc'}, {aplicacionCuotas:{aplicado:true}},
    {fechaValidacion:new Date()}
  ]){
    const pago=row(overrides);
    assert.equal(elegible(pago),false);
    t.mock.method(PagoReportado,'findOne',async()=>pago);
    await assert.rejects(solicitarReintento({pagoId:32,casaId:738}),{status:409});
    PagoReportado.findOne.mock.restore();
  }
});
test('si no pertenece a la vivienda activa responde 404, sin filtrar datos',async t=>{
  stub(t);
  t.mock.method(PagoReportado,'findOne',async({where})=>{
    assert.equal(where.casaId,900);
    return null;
  });
  await assert.rejects(solicitarReintento({pagoId:32,casaId:900}),{status:404});
  assert.equal(relectura.programarRelectura.mock.callCount(),0);
});
test('respeta cooldown y máximo de reintentos',async t=>{
  stub(t);
  const pago=row({verificacionBancaria:{reintentos:1,ultimoReintentoEn:'2026-10-26T23:01:45Z'}});
  t.mock.method(PagoReportado,'findOne',async()=>pago);
  await assert.rejects(solicitarReintento({pagoId:32,casaId:738,ahora:new Date('2026-10-26T23:02:00Z')}),{status:429});
  pago.verificacionBancaria.reintentos=3;
  await assert.rejects(solicitarReintento({pagoId:32,casaId:738,ahora:new Date('2026-10-26T23:12:00Z')}),{status:429});
  assert.equal(pago._writes||0,0);
});
test('el navegador solo ofrece reintentar a pagos fallidos y usa API de la casa autenticada',()=>{
  const js=asset('docs/assets/js/pagos.js');
  const routes=asset('backend/src/routes/pagos.routes.js');
  const background=asset('backend/src/services/banco-correo-worker.service.js');
  assert.match(js,/fallido\?'<button type="button" class="receipt-bank-retry" data-bank-retry>/);
  assert.match(js,/method:'POST',headers:headers\(true\)/);
  assert.match(routes,/post\('\/:id\/reintentar-validacion', lecturaPagos, reintentarValidacion/);
  assert.match(background,/historialReintentos/);
  assert.match(js,/renderReceiptStatus\(actualizado\)/);
});
