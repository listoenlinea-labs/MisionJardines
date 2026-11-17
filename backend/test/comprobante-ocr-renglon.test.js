const test = require('node:test');
const assert = require('node:assert/strict');
const { leerNumero, localizarRenglon } = require('../src/services/comprobante-ocr-renglon');

const line = (text, y0, x0=35) => ({ text, bbox: { x0, x1: 297, y0, y1: y0+24 } });
const blocks = (...lines) => [{ paragraphs: [{ lines }] }];
test('localiza solo la línea inmediatamente debajo de la etiqueta Comprobante', () => {
  const area = localizarRenglon(blocks(
    line('Comprobante de transferencia', 100), line('Comprobante', 240),
    line('4123456789012', 280), line('Aviso de seguridad', 385)));
  assert.ok(area.top > 264 && area.top < 280);
  assert.ok(area.top + area.height > 304 && area.top + area.height < 385);
  assert.equal(localizarRenglon(blocks(line('Comprobante', 100), line('Cuenta 123456789012', 135))), null);
  assert.equal(localizarRenglon(blocks(line('Comprobante', 100), line('123456789012', 310))), null);
  assert.equal(localizarRenglon(blocks(line('Comprobante', 100), line('123456789012', 135), line('Comprobante', 210))), null);
});
test('el separador # se ignora pero los dígitos iniciales se preservan', () => {
  assert.equal(leerNumero('#123456789012'), '123456789012');
  assert.equal(leerNumero('4123456789012'), '4123456789012');
  assert.equal(leerNumero('4123456789012\n123456789012'), '');
  assert.equal(leerNumero('CLABE 123456789012'), '');
});

test('Titan reintenta automáticamente una vez y solo acredita un aviso exacto y único', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const ids = require('../src/services/identificadores-bancarios.service');
  const src = fs.readFileSync(require.resolve('../src/services/banco-correo-worker.service'), 'utf8');
  for (const [lectura, copias, aprobados] of [
    ['123456789012', 1, 1], ['4123456789012', 1, 0], ['123456789012', 2, 0]
  ]) {
    let llamadas=0, confirmaciones=0;
    const pago={ id:1, monto:350, folioOperacion:'4123456789012', textoOcr:'Comprobante\n4123456789012',
      setDataValue(key,value){ this[key]=value; } };
    const avisos=Array.from({length:copias},(_,i)=>({id:'aviso-'+i,tracking:'CPO123456789012',autorizado:true,reciente:true}));
    const coincidenciasCompletas=(p,rows)=>rows.filter(a=>ids.coinciden(p,a));
    const stubs={
      '../models':{Casa:{},PagoReportado:{
        findAll:async()=>[pago], findByPk:async()=>({comprobanteData:'original'}),
        findOne:async()=>null, update:async v=>Object.assign(pago,v)
      }},
      './banco-correo.service':{configurado:()=>true,obtenerAvisos:async()=>avisos,
        chequeosAviso:()=>({cuenta:true,importe:true,fecha:true}),huellaMensaje:id=>id},
      './banco-diagnostico.service':{coincidenciasCompletas,evaluar:(p,_,rows)=>coincidenciasCompletas(p,rows).length===1
        ?{etapa:'COINCIDENCIA_VERIFICADA'}:{etapa:'SIN_COINCIDENCIA',cotejoAvisos:{filtroBloqueante:'IDENTIFICADOR',avisosRastreoCpo:copias}}},
      './identificadores-bancarios.service':ids,
      './comprobante-lector.service':{reconocerImagen:async (image,options)=>{
        assert.equal(image,'original'); assert.equal(options.renglonComprobante,true); llamadas++; return lectura;
      }},
      '../controllers/pagos.controller':{confirmarPagoDesdeBanco:async()=>{confirmaciones++;}}
    };
    const ctx={require:key=>{assert.ok(stubs[key],key);return stubs[key];},module:{exports:{}},
      console:{info(){},warn(){},error(){}},process:{env:{}}};
    vm.runInNewContext(src,ctx);
    await ctx.module.exports.ejecutarRevision();
    if(!aprobados) await ctx.module.exports.ejecutarRevision();
    assert.equal(llamadas,1);
    assert.equal(confirmaciones,aprobados);
    assert.equal(pago.folioOperacion,'4123456789012');
  }
});
