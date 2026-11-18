'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const calendario=require('../src/services/whatsapp-casa-club-calendario.service');
const free=require('../src/services/whatsapp-presupuesto-cero.service');
const hash=v=>createHash('sha256').update(v).digest('hex');

test('el calendario envía solo disponibilidad pública y nonce de sesión, no datos del residente',async t=>{
 const original=process.env.WHATSAPP_CASA_CLUB_FLOW_ID;
 process.env.WHATSAPP_CASA_CLUB_FLOW_ID='1234567890123456';
 t.after(()=>{if(original===undefined)delete process.env.WHATSAPP_CASA_CLUB_FLOW_ID;
  else process.env.WHATSAPP_CASA_CLUB_FLOW_ID=original;});
 let sent,context;
 const today=calendario.hoyMexico();
 const min=calendario.sumarDias(today,1),max=calendario.sumarDias(today,365);
 t.mock.method(globalThis,'fetch',async url=>{
  const parsed=new URL(url);
  assert.equal(parsed.pathname,'/api/casa-club/publico/fechas');
  assert.equal(parsed.searchParams.get('desde'),min);
  assert.equal(parsed.searchParams.get('hasta'),max);
  return {ok:true,json:async()=>({ok:true,disponibilidadVerificada:true,ocupadas:[
   {fecha:min,estatus:'PENDIENTE'},{fecha:max,estatus:'APROBADA'},{fecha:min,estatus:'APROBADA'}
  ]})};
 });
 t.mock.method(free,'sendPayload',async(_phone,message)=>{sent=message;return true;});
 const result=await calendario.enviar('5213312345678',async(phone,state,ctx)=>{
  assert.equal(phone,'5213312345678');assert.equal(state,'FECHA');context=ctx;
 });
 assert.equal(result,true);
 assert.equal(sent.interactive.type,'flow');
 assert.equal(sent.interactive.action.parameters.flow_id,'1234567890123456');
 assert.deepEqual(sent.interactive.action.parameters.flow_action_payload.data.unavailable_dates,[min,max]);
 const token=sent.interactive.action.parameters.flow_token;
 assert.equal(token.length,64);
 assert.equal(context.flowTokenHash,hash(token));
 assert.ok(!JSON.stringify(sent).includes('correo'));
 const reply={type:'interactive',interactive:{type:'nfm_reply',
  nfm_reply:{response_json:JSON.stringify({flow_token:token,fecha:min})}}};
 assert.equal(calendario.fechaRespuesta(reply,context),min);
 assert.equal(calendario.fechaRespuesta(reply,{flowTokenHash:hash('bad')}),null);
 assert.equal(calendario.fechaRespuesta({...reply,interactive:{...reply.interactive,
  nfm_reply:{response_json:'{invalid'}}},context),null);
});
test('no presenta fechas como libres si falla la sincronización del calendario',async t=>{
 t.mock.method(globalThis,'fetch',async()=>({
  ok:true,json:async()=>({ok:true,disponibilidadVerificada:false,ocupadas:[]})
 }));
 await assert.rejects(calendario.consultarDisponibilidad(),/Disponibilidad incompleta/);
});
test('Flow JSON genera payload válido y rechaza configuración incompleta',()=>{
 const data={min_date:'2026-11-18',max_date:'2027-11-17',unavailable_dates:[]};
 const token='a'.repeat(64);
 const message=calendario.payload({id:'123456',token,data});
 assert.equal(message.interactive.action.parameters.flow_action,'navigate');
 assert.equal(message.interactive.action.parameters.flow_action_payload.screen,'FECHA_CASA_CLUB');
 assert.deepEqual(message.interactive.action.parameters.flow_action_payload.data,data);
 assert.throws(()=>calendario.payload({id:'',token,data}),/Flow ID/);
});
test('valida fechas ISO ocupadas, sin nombres, viviendas ni fechas fuera de rango',()=>{
 const days=calendario.datosValidos([
  {fecha:'2026-11-20',usuario:'NO MOSTRAR'}, {fecha:'2026-11-20'},
  {fecha:'2026-11-21'}, {fecha:'2027-01-01'}
 ],'2026-11-18','2026-11-30');
 assert.deepEqual(days,['2026-11-20','2026-11-21']);
});
