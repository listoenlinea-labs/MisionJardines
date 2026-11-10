'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function fixture(){
 const queries=[],records=[];
 const moduleShim={exports:{}};
 const fake={
  'node:crypto':{randomBytes:()=>({toString:()=> '20E07DA986'}),randomUUID:()=> '00000000-0000-4000-8000-000000000001'},
  sequelize:{QueryTypes:{INSERT:'INSERT',SELECT:'SELECT'}},
  '../config/database':{query:async(sql,{replacements={}}={})=>{
   queries.push(sql);
   if(sql.startsWith('CREATE TABLE'))return [];
   if(sql.includes('INSERT INTO')){
    records.push({
     id:1,folio:replacements.folio,referencia:replacements.referencia,casa_id:replacements.casaId,
     calle:replacements.calle,inicial_calle:replacements.inicialCalle,numero_casa:replacements.numeroCasa,
     nombre:replacements.nombre,mes_folio:replacements.mesFolio,anio_folio:replacements.anioFolio,
     concepto_pago:replacements.conceptoPago,mes_cubierto:replacements.mesCubierto,
     anio_cubierto:replacements.anioCubierto,concepto_detalle:replacements.conceptoDetalle,
     monto:replacements.monto,forma_pago:replacements.formaPago,sello:replacements.sello,
     fecha_emision:replacements.fecha,creado_en:'2026-11-09 17:55:00'
    });
    return [1,1];
   }
   if(sql.includes('WHERE folio'))return records.filter(r=>r.folio===replacements.folio);
   if(sql.includes('WHERE id'))return records.filter(r=>r.id===replacements.id);
   if(sql.includes('ORDER BY'))return records.slice();
   throw Error('Unexpected SQL '+sql);
  }},
  './vigencia-calculo':{fechaMexico:()=> '2026-11-09'}
 };
 new Function('require','module',read('backend/src/services/recibos-manuales.service.js'))(
  name=>{if(!Object.hasOwn(fake,name))throw Error('unexpected dependency '+name);return fake[name]},
  moduleShim
 );
 return {service:moduleShim.exports,queries,records};
}
const sample={
 mesFolio:11,anioFolio:2026,mesCubierto:11,anioCubierto:2026,
 calle:'Atotonilco',inicialCalle:'A',numeroCasa:'752',nombre:'Saida Teresa Aguilar',
 conceptoPago:'APORTACIÓN',conceptoDetalle:'Aportación al parque',
 monto:300,formaPago:'EFECTIVO',sello:'PAGADO CON ADEUDO',casaId:752
};
test('El generador usa folio MJ-MES-AÑO-ALEATORIO-CASA-M y referencia automáticos',async()=>{
 const {service}=fixture();
 const r=await service.crear(sample,9);
 assert.equal(r.folio,'MJ-NOV-2026-20E07DA986-A752-M');
 assert.equal(r.referencia,'MJMANUAL:00000000-0000-4000-8000-000000000001');
 assert.equal(r.fechaEmision,'2026-11-09');
 assert.equal(r.conceptoPago,'APORTACIÓN');
 assert.equal(r.sello,'PAGADO CON ADEUDO');
});
test('La persistencia y el historial consultan EXCLUSIVAMENTE recibos_manuales',async()=>{
 const {service,queries}=fixture();
 await service.crear(sample,9);
 const list=await service.listar(30,0);
 const selected=await service.buscar(1);
 assert.equal(list.length,1);
 assert.equal(selected.folio,list[0].folio);
 for(const sql of queries){
  assert.match(sql,/recibos_manuales/);
  assert.doesNotMatch(sql,/\b(?:cuotas|pagos_reportados|cargos_cuenta|zkteco|egresos|ingresos)\b/i);
  assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i);
 }
});
test('Rechaza datos inválidos, permite sellos de texto libre y conserva importes enteros',()=>{
 const {service}=fixture();
 for(const [key,value] of [['monto',300.50],['monto',0],['sello',''],
   ['mesFolio',13],['anioCubierto',1999],['numeroCasa','18 / ?'],['formaPago','TARJETA']]){
  assert.throws(()=>service.validar({...sample,[key]:value}),e=>e.status===400);
 }
 assert.equal(service.validar({...sample,formaPago:'TRANSFERENCIA'}).formaPago,'TRANSFERENCIA');
 assert.equal(service.validar({...sample,sello:'ABONO CON ADEUDO'}).sello,'ABONO CON ADEUDO');
 assert.equal(service.validar({...sample,sello:'Se recibió efectivo'}).sello,'Se recibió efectivo');

});
test('El botón está siempre visible; modal tiene los campos editables y su historial',()=>{
 const html=read('docs/analisis-cuotas.html');
 const js=read('docs/assets/js/recibos-manuales.js');
 for(const id of ['financeManualReceiptOpen','manualReceiptsModal','manualReceiptNumberOptions',
  'manualReceiptName','manualReceiptFolioMonth','manualReceiptFolioYear','manualReceiptInitial',
  'manualReceiptDate','manualReceiptStreet','manualReceiptNumber','manualReceiptOtherStreet',
  'manualReceiptConceptTitle','manualReceiptCoveredMonth','manualReceiptCoveredYear',
  'manualReceiptConceptDetail','manualReceiptAmount','manualReceiptMethod','manualReceiptSeal',
  'manualReceiptSave','manualReceiptTabHistory','manualReceiptHistoryList','manualReceiptPdfPreview'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/<button type="button" id="financeManualReceiptOpen"/);
 assert.match(js,/MJManualReceiptContext/);
 assert.match(js,/await json\('',params\)/);
 assert.match(js,/await read\('\/'\+row.id\+'\/pdf'\)/);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.doesNotThrow(()=>new vm.Script(read('backend/src/services/recibos-manuales-pdf.service.js')));
});
test('El acceso de recibos manuales está bajo el router de administradores',()=>{
 const routes=read('backend/src/routes/finanzas.routes.js');
 assert.match(routes,/router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
 assert.match(routes,/router\.get\('\/recibos-manuales'/);
 assert.match(routes,/router\.post\('\/recibos-manuales'/);
 assert.match(routes,/router\.get\('\/recibos-manuales\/:id\/pdf'/);
 assert.match(routes,/router\.delete\('\/recibos-manuales\/:id',recibosManuales\.eliminar\)/);
 assert.match(read('backend/src/services/recibos-manuales-pdf.service.js'),
  /Sin movimiento contable automático/);
});
test('La consulta de Rosas 18 exige referencia, origen y monto exactos y termina con ROLLBACK',()=>{
 const sql=read('backend/sql/2026-11-09-revertir-abono-rosas18-SOLO-PRUEBA.sql');
 assert.match(sql,/MJABONO:7fb22c0b-71a8-4632-b4dd-b08215b5e146/);
 assert.match(sql,/origen_importacion = 'MANUAL_ABONO_ADEUDO'/);
 assert.match(sql,/monto_pagado = 300/);
 assert.match(sql,/ROLLBACK;\s*$/);
});

test('El generador ofrece calle LOV y número editable con lista filtrada, sin el selector masivo previo',()=>{
 const html=read('docs/analisis-cuotas.html');
 const js=read('docs/assets/js/recibos-manuales.js');
 assert.doesNotMatch(html,/id="manualReceiptHouse"/);
 assert.match(html,/<select id="manualReceiptStreet" required>/);
 assert.match(html,/id="manualReceiptNumber"[^>]*role="combobox"/);
 assert.match(html,/id="manualReceiptNumberOptions"[^>]*role="listbox"/);
 assert.match(html,/id="manualReceiptOtherStreetWrap"[^>]*hidden/);
 assert.match(js,/function showNumberChoices\(\)/);
 assert.match(js,/function exactHouse\(\)/);
 assert.match(js,/houseNumberKey\(h\.numero\)\.includes\(query\)/);
 assert.match(js,/if\(house\)prefill\(house\)/);
 assert.match(js,/streetSelect\.add\(new Option\('Otra calle \/ captura manual','__OTHER__'\)\)/);
 assert.match(js,/selection=house/);
 assert.match(js,/nameEdited=true/);
 assert.match(js,/calle:streetValue\(\)\.trim\(\)/);
});

test('La eliminación sólo afecta la tabla documental y exige ID y folio',async()=>{
 const {service,queries}=fixture();
 const row=await service.crear(sample,9);
 const removed=await service.eliminar(row.id,row.folio);
 assert.equal(removed.id,row.id);
 assert.equal(removed.folio,row.folio);
 const deleteQueries=queries.filter(q=>q.trim().startsWith('DELETE'));
 assert.equal(deleteQueries.length,1);
 assert.match(deleteQueries[0],/^DELETE FROM recibos_manuales WHERE id=:id AND folio=:folio LIMIT 1$/);
 assert.doesNotMatch(deleteQueries[0],/\bcuotas\b|\bpagos_reportados\b|\bzkteco\b/i);
});
test('La interfaz ofrece Eliminar con confirmación y ya no exige que el sello diga PAGADO',()=>{
 const html=read('docs/analisis-cuotas.html');
 const js=read('docs/assets/js/recibos-manuales.js');
 assert.match(html,/Sello del recibo \(texto libre\)/);
 assert.doesNotMatch(html,/debe empezar con PAGADO/i);
 assert.doesNotMatch(html,/Escribe o selecciona una vivienda de las sugerencias/);
 assert.doesNotMatch(js,/El sello debe empezar con PAGADO/);
 assert.match(js,/className='manual-receipt-delete'/);
 assert.match(js,/window\.confirm\(/);
 assert.match(js,/method:'DELETE'/);
 assert.match(js,/JSON\.stringify\(\{folio:row\.folio\}\)/);
 assert.match(html,/@media\(max-width:640px\)/);
});
