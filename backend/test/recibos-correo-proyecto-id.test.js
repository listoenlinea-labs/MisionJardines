'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-cuotas.js'),'utf8');
const html=fs.readFileSync(path.resolve(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
// Ejecutar la expresión real del botón; una variable libre como "proyectoId"
// (cuando solo existe "projectId") provoca ReferenceError y falla la prueba.
const match=source.match(/const response=await request\('\/pagos-vivienda\/'\+houseId\+'\/recibo\/enviar-correo',\{[\s\S]*?\}\);/);
assert.ok(match,'Debe existir la solicitud autenticada de correo de recibos');
const invoke=new Function('request','houseId','concept','projectId','referencia','correoDestino',
 'return (async()=>{ '+match[0]+' return response; })();');

test('recibo mantenimiento envía proyectoId null, nunca una variable sin declarar',async()=>{
 const called=[];
 const answer=await invoke((url,payload)=>{
  called.push({url,payload});return Promise.resolve({data:{enviado:true}});
 },5,'MANTENIMIENTO',null,'MJ-NOV-2026-G5-M','residente@example.com');
 assert.equal(called.length,1);
 assert.equal(called[0].url,'/pagos-vivienda/5/recibo/enviar-correo');
 assert.deepEqual(called[0].payload,{concepto:'MANTENIMIENTO',proyectoId:null,
  referencia:'MJ-NOV-2026-G5-M',correoDestino:'residente@example.com'});
 assert.equal(answer.data.enviado,true);
});
test('recibo extraordinario conserva proyecto seleccionado y folio de aportación',async()=>{
 let received;
 await invoke((url,payload)=>{
  received=payload;return Promise.resolve({data:{enviado:true}});
 },7,'EXTRAORDINARIO',19,'APORTACION-78','contacto@example.com');
 assert.deepEqual(received,{concepto:'EXTRAORDINARIO',proyectoId:19,
  referencia:'APORTACION-78',correoDestino:'contacto@example.com'});
});
test('frontend sigue enviando solo a correo confirmado, sin tocar variables SMTP',()=>{
 assert.match(source,/const concept=activeConcept,projectId=concept==='EXTRAORDINARIO'\?Number\(activeProyectoId\):null/);
 assert.match(source,/proyectoId:projectId,referencia,correoDestino/);
 assert.match(html,/analisis-cuotas\.js\?v=20261104-correo-proyectoid-hotfix-v1/);
 assert.doesNotThrow(()=>new Function(source));
});
