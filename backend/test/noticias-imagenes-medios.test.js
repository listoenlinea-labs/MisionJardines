'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {urlEditorialSegura,metadatosFoto,fotoDelArticuloOriginal}=
  require('../src/services/noticias-imagenes-medios.service');

test('sólo consulta una URL editorial HTTPS aprobada',()=>{
  assert.ok(urlEditorialSegura('https://www.infobae.com/mexico/noticia/'));
  assert.ok(urlEditorialSegura('https://informador.mx/jalisco/nota'));
  for(const url of [
    'https://127.0.0.1/secretos','http://informador.mx/nota',
    'https://informador.mx.evil.example/nota','https://informador.mx:8443/nota',
    'https://user:pass@informador.mx/nota','file:///etc/passwd'
  ]) assert.equal(urlEditorialSegura(url),null,url);
});

test('usa únicamente og:image de la página consultada, sin fotografías por título',()=>{
  const u='https://www.infobae.com/mexico/noticia/';
  assert.equal(metadatosFoto('<meta property="og:image" content="https://imagenes.infobae.com/foto-a.jpg">',u),
    'https://imagenes.infobae.com/foto-a.jpg');
  assert.equal(metadatosFoto("<meta content='/media/foto-b.jpg?x=1&amp;y=2' name='twitter:image'>",u),
    'https://www.infobae.com/media/foto-b.jpg?x=1&y=2');
  assert.equal(metadatosFoto('<meta property="og:image" content="javascript:alert(1)">',u),null);
  assert.equal(metadatosFoto('<title>Noticia sobre agua en Guadalajara</title>',u),null);
});

test('rescata foto de nota original y no consulta orígenes no permitidos',async()=>{
  let calls=0;
  const fetchImpl=async (url,opts)=>{
    calls++;
    assert.equal(url,'https://informador.mx/jalisco/noticia');
    assert.equal(opts.redirect,'error');
    return {ok:true,headers:{get:k=>k==='content-type'?'text/html; charset=UTF-8':null},
      arrayBuffer:async()=>Buffer.from('<meta property="og:image" content="https://imagenes.informador.mx/jalisco.jpg">')};
  };
  assert.equal(await fotoDelArticuloOriginal('https://informador.mx/jalisco/noticia',{fetchImpl}),
    'https://imagenes.informador.mx/jalisco.jpg');
  assert.equal(await fotoDelArticuloOriginal('https://127.0.0.1/admin',{fetchImpl}),null);
  assert.equal(calls,1);
});

test('no inventa foto cuando el sitio falla, no es HTML o no incluye metadatos',async()=>{
  const url='https://informador.mx/jalisco/noticia';
  const response=(type,body)=>({ok:true,headers:{get:k=>k==='content-type'?type:null},
    arrayBuffer:async()=>Buffer.from(body)});
  assert.equal(await fotoDelArticuloOriginal(url,{fetchImpl:async()=>response('application/json','{}')}),null);
  assert.equal(await fotoDelArticuloOriginal(url,{fetchImpl:async()=>response('text/html','<h1>Sin foto</h1>')}),null);
  assert.equal(await fotoDelArticuloOriginal(url,{fetchImpl:async()=>{throw new Error('timeout')}}),null);
});
