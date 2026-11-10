'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../../docs');
const html=fs.readFileSync(path.join(root,'analisis-cuotas.html'),'utf8');
const source=fs.readFileSync(path.join(root,'assets/js/recibos-manuales.js'),'utf8');

function setup(selectedHouseId=null){
 const elements={};
 let activeElement=null;
 function el(id=''){
  const node={
   id,value:'',required:false,disabled:false,hidden:false,attributes:{},children:[],listeners:{},
   classList:{toggle(){},add(){},remove(){}},
   addEventListener(type,fn){this.listeners[type]=fn;},
   emit(type,props={}){return this.listeners[type]?.({type,target:this,
    preventDefault(){},...props});},
   setAttribute(key,value){this.attributes[key]=String(value);},
   removeAttribute(key){delete this.attributes[key];},
   replaceChildren(){this.children=[];},
   add(child){this.children.push(child);},
   append(...children){this.children.push(...children);},
   appendChild(child){this.children.push(child);},
   querySelectorAll(){return this.children.filter(n=>n.attributes?.role==='option');},
   focus(){if(activeElement!==this){activeElement=this;this.emit('focus');}},
   scrollIntoView(){},reset(){},closest(){return null;},
   getClientRects(){return [{width:100}];}
  };
  return node;
 }
 for(const [,id] of html.matchAll(/\bid="([^"]+)"/g))elements[id]=el(id);
 elements.manualReceiptsModal.hidden=true;
 const document={getElementById:id=>elements[id],createElement:tag=>el(tag),
  addEventListener(){},get activeElement(){return activeElement;}};
 const list=[
  {casaId:5,calle:'Gardenias',numero:'5',nombre:'Ana'},
  {casaId:1,calle:'Rosas',numero:'1',nombre:'Primera'},
  {casaId:18,calle:'Rosas',numero:'18',nombre:'Julissa'},
  {casaId:19,calle:'Rosas',numero:'19',nombre:'Juan'}
 ];
 const window={MJManualReceiptContext:()=>({viviendas:list,selectedHouseId})};
 class Option{constructor(text,value){this.text=text;this.value=value;}}
 vm.runInNewContext(source,{document,window,Option,
  localStorage:{getItem(){return null;}},sessionStorage:{getItem(){return null;}},
  setTimeout,Intl,URL,location:{replace(){}},fetch:()=>{throw Error('No backend call expected');}});
 elements.financeManualReceiptOpen.emit('click');
 return {elements,list};
}

test('Calle muestra las opciones únicas y no expone el selector grande de todas las viviendas',()=>{
 const {elements:e}=setup();
 assert.deepEqual(e.manualReceiptStreet.children.map(option=>option.value),
  ['','Gardenias','Rosas','__OTHER__']);
 assert.equal(html.includes('id="manualReceiptHouse"'),false);
 assert.equal(e.manualReceiptsModal.hidden,false);
});
test('Al escribir el número se despliegan SOLO las casas de la calle elegida y autollenan el nombre',()=>{
 const {elements:e}=setup();
 e.manualReceiptStreet.value='Rosas';
 e.manualReceiptStreet.emit('change');
 assert.equal(e.manualReceiptNumberOptions.hidden,false);
 assert.deepEqual(e.manualReceiptNumberOptions.children.map(button=>button.children[0].textContent),
  ['1','18','19']);
 e.manualReceiptNumber.value='18';
 e.manualReceiptNumber.emit('input');
 assert.equal(e.manualReceiptName.value,'Julissa');
 assert.deepEqual(e.manualReceiptNumberOptions.children.map(b=>b.children[0].textContent),['18']);
 assert.equal(e.manualReceiptNumber.attributes['aria-expanded'],'true');
});
test('Elegir una sugerencia con el teclado actualiza el nombre y conserva el número',()=>{
 const {elements:e}=setup();
 e.manualReceiptStreet.value='Rosas';
 e.manualReceiptStreet.emit('change');
 e.manualReceiptNumber.value='1';
 e.manualReceiptNumber.emit('input');
 e.manualReceiptNumber.emit('keydown',{key:'ArrowDown'});
 e.manualReceiptNumber.emit('keydown',{key:'ArrowDown'});
 e.manualReceiptNumber.emit('keydown',{key:'Enter'});
 assert.equal(e.manualReceiptNumber.value,'18');
 assert.equal(e.manualReceiptName.value,'Julissa');
 assert.equal(e.manualReceiptNumberOptions.hidden,true);
});
test('El nombre modificado manualmente no se pierde mientras se escribe, pero una sugerencia explícita lo completa',()=>{
 const {elements:e}=setup();
 e.manualReceiptStreet.value='Rosas';
 e.manualReceiptStreet.emit('change');
 e.manualReceiptNumber.value='18';
 e.manualReceiptNumber.emit('input');
 e.manualReceiptName.value='Nombre personalizado';
 e.manualReceiptName.emit('input');
 e.manualReceiptNumber.value='19';
 e.manualReceiptNumber.emit('input');
 assert.equal(e.manualReceiptName.value,'Nombre personalizado');
 e.manualReceiptNumberOptions.children[0].emit('click');
 assert.equal(e.manualReceiptName.value,'Juan');
});
test('Permite captura libre cuando el número no existe y otra calle sin alterar los pagos',()=>{
 const {elements:e}=setup();
 e.manualReceiptStreet.value='Rosas';
 e.manualReceiptStreet.emit('change');
 e.manualReceiptNumber.value='999';
 e.manualReceiptNumber.emit('input');
 assert.match(e.manualReceiptNumberOptions.children[0].textContent,/Puedes escribir/);
 e.manualReceiptStreet.value='__OTHER__';
 e.manualReceiptStreet.emit('change');
 assert.equal(e.manualReceiptOtherStreetWrap.hidden,false);
 assert.equal(e.manualReceiptOtherStreet.required,true);
 e.manualReceiptOtherStreet.value='Nueva Calle';
 e.manualReceiptOtherStreet.emit('input');
 assert.equal(e.manualReceiptInitial.value,'N');
 e.manualReceiptName.value='Visitante';
 e.manualReceiptNumber.value='20';
 e.manualReceiptNumber.emit('input');
 e.manualReceiptReview.emit('click');
 assert.equal(e.manualDraftStreet.textContent,'Nueva Calle');
 assert.equal(e.manualDraftNumber.textContent,'20');
});
test('Si una vivienda estaba seleccionada en Análisis se autocompletan calle, número y residente',()=>{
 const {elements:e}=setup(18);
 assert.equal(e.manualReceiptStreet.value,'Rosas');
 assert.equal(e.manualReceiptNumber.value,'18');
 assert.equal(e.manualReceiptName.value,'Julissa');
 assert.equal(e.manualReceiptInitial.value,'R');
});
