'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {esArticuloZmg,esDominioZmg,esImagenZmg,imagenDesdeMetadatos}=require('../src/services/noticias-imagenes-zmg.service');
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
