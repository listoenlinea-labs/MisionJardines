'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, {DB_HOST:'localhost', DB_NAME:'test', DB_USER:'test', DB_PASSWORD:'test', JWT_SECRET:'test'});
delete process.env.FREENEWSAPI_KEY;
delete process.env.FNA_KEY;
const router = require('../src/routes/entorno.routes');
const handler = router.stack.find(layer=>layer.route?.path==='/noticias').route.stack.at(-1).handle;
const respond = () => ({
  statusCode:200,
  status(code){this.statusCode=code;return this;},
  json(payload){this.payload=payload;return this;}
});
test('Sin API key se muestran noticias locales vía RSS y no se llama FreeNewsApi',async t=>{
  const requests = [];
  const now = new Date().toUTCString();
  const rss = '<rss version="2.0"><channel><item>' +
    '<title>Choque en Zapopan sobre avenida Aviación</title>' +
    '<link>https://news.google.com/rss/articles/123</link>' +
    '<pubDate>'+now+'</pubDate>' +
    '<source>Periódico de Jalisco</source>' +
    '<description>Accidente vial en Zapopan</description>' +
    '</item></channel></rss>';
  t.mock.method(global,'fetch',async input=>{
    requests.push(String(input));
    return {ok:true,text:async()=>rss};
  });
  const res = respond();
  await handler({query:{}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.payload.provider,'Google Noticias RSS');
  assert.equal(res.payload.data.length,1);
  assert.match(res.payload.data[0].title,/Choque en Zapopan/);
  assert.equal(requests.filter(url=>url.includes('freenewsapi.ai')).length,0);
  assert.equal(requests.filter(url=>url.includes('news.google.com')).length,3);
});
test('El proveedor externo sin respuesta no expone error de credenciales al cliente',async t=>{
  t.mock.method(global,'fetch',async ()=>{throw Error('Fetch error');});
  const res=respond();
  await handler({query:{q:'Aviación sin noticias exclusivas'}},res);
  assert.equal(res.statusCode,502);
  assert.match(res.payload.message,/No fue posible consultar noticias/);
});
