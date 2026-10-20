'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {esArticuloZmg,esDominioZmg,esImagenZmg,imagenDesdeMetadatos,
 imagenDesdeWordPress,descargarImagenWordPressZmg}=require('../src/services/noticias-imagenes-zmg.service');
test('sólo interpreta og:image de la noticia original, sin imágenes de otra nota',()=>{
 const u='https://traficozmg.com/choque-en-zapopan/';
 assert.equal(esArticuloZmg(u),true);
 assert.equal(esArticuloZmg('https://evil.example/choque'),false);
 assert.equal(esDominioZmg('traficozmg.com.evil.com'),false);
 assert.equal(esImagenZmg('https://i0.wp.com/traficozmg.com/wp-content/uploads/a.jpg'),true);
 assert.equal(esImagenZmg('https://i0.wp.com/otromedio.com/wp-content/uploads/a.jpg'),false);
 assert.equal(imagenDesdeMetadatos('<html><meta property="og:image" content="https://traficozmg.com/wp-content/uploads/choque.jpg"></html>',u),
  'https://traficozmg.com/wp-content/uploads/choque.jpg');
 assert.equal(imagenDesdeMetadatos('<meta content="/wp-content/uploads/otra.jpg" property="og:image">',u),
  'https://traficozmg.com/wp-content/uploads/otra.jpg');
 assert.equal(imagenDesdeMetadatos('<meta property="og:image" content="javascript:alert(1)">',u),null);
 assert.equal(imagenDesdeMetadatos('<meta property="og:title" content="Noticia sin foto">',u),null);
});

test('WordPress utiliza la miniatura de la noticia exacta y nunca otra imagen',()=>{
 const articulo='https://traficozmg.com/2026/10/choque-en-zapopan/';
 const imagen='https://traficozmg.com/wp-content/uploads/2026/10/choque-300x169.jpg';
 const post={id:20,slug:'choque-en-zapopan',link:articulo,featured_media:99,
  _embedded:{'wp:featuredmedia':[{id:99,source_url:'https://traficozmg.com/wp-content/uploads/2026/10/choque.jpg',
   media_details:{sizes:{medium:{source_url:imagen}}}}]}};
 assert.equal(imagenDesdeWordPress([post],articulo),imagen);
 assert.equal(imagenDesdeWordPress([{...post,link:'https://traficozmg.com/2026/10/otra-noticia/'}],articulo),null);
 assert.equal(imagenDesdeWordPress([{...post,featured_media:100}],articulo),null);
 assert.equal(imagenDesdeWordPress([{...post,_embedded:{'wp:featuredmedia':[{id:99,source_url:'https://evil.example/photo.jpg'}]}}],articulo),null);
 assert.equal(imagenDesdeWordPress([],articulo),null);
});

test('consulta únicamente la API oficial de WordPress usando el slug del artículo',async()=>{
 const articulo='https://traficozmg.com/2026/10/choque-en-zapopan/';
 const imagen='https://traficozmg.com/wp-content/uploads/2026/10/choque-300x169.jpg';
 const urls=[];
 const fetchImpl=async (url,opts)=>{
  urls.push(new URL(url));
  assert.equal(opts.redirect,'error');
  return {ok:true,headers:{get:name=>name==='content-type'?'application/json; charset=UTF-8':null},
   json:async()=>[{slug:'choque-en-zapopan',link:articulo,featured_media:2,
    _embedded:{'wp:featuredmedia':[{id:2,media_details:{sizes:{medium:{source_url:imagen}}}}]}}]};
 };
 assert.equal(await descargarImagenWordPressZmg(articulo,{fetchImpl}),imagen);
 assert.equal(urls.length,1);
 assert.equal(urls[0].origin,'https://traficozmg.com');
 assert.equal(urls[0].pathname,'/wp-json/wp/v2/posts');
 assert.equal(urls[0].searchParams.get('slug'),'choque-en-zapopan');
 assert.equal(await descargarImagenWordPressZmg('https://evil.example/choque',{fetchImpl}),null);
 assert.equal(urls.length,1);
});
