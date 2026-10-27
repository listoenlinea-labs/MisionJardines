'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(count=2,quoteHook){
 const ids=new Map();
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.handlers={};this.classList={toggle(){}};}
  set id(v){this._id=v;ids.set(v,this);}get id(){return this._id;}
  append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}
  setAttribute(){}addEventListener(name,fn){this.handlers[name]=fn;}
  querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tagName===tag?[c]:[]),...c.querySelectorAll(tag)]);}
 }
 const document={getElementById:id=>ids.get(id),createElement:tag=>new Element(tag)};
 for(const id of ['paymentAllocation','allocationHouses','allocationStatus','residentAddress']){const e=new Element('div');e.id=id;}
 const window={MJReparto:require('../../docs/assets/js/pagos-reparto-calculo')};
 vm.runInNewContext(fs.readFileSync(require.resolve('../../docs/assets/js/pagos-reparto-ui'),'utf8'),{window,document});
 let latest;
 const api=async(path,opts)=>{
  if(path==='/pagos/reparto')return {data:{habilitado:count>=2,fecha:'2026-10-26',viviendas:[1,2,3].slice(0,count).map(casaId=>({casaId,calle:'Calle ficticia',numero:String(casaId),adeudo:600}))}};
  latest=JSON.parse(opts.body);if(quoteHook)return quoteHook(latest);return {data:{distribuciones:latest.reparto.map(d=>({...d,plan:{recargo:0,meses:1,fechaFinalObjetivo:'2026-11-10'}}))}};
 };
 const ui=window.MJRepartoUI.crear({api,headers:()=>({}),changed(){},money:v=>String(v)});
 return {ui,ids,get latest(){return latest;}};
}
test('UI oculta reparto para una casa y conserva el domicilio',async()=>{
 for(const n of [1]){const c=setup(n);await c.ui.cargar();await c.ui.actualizar('MANTENIMIENTO',true,'600','2026-10-26');
 assert.equal(c.ids.get('paymentAllocation').hidden,true);assert.equal(c.ids.get('residentAddress').hidden,false);}
});
test('UI muestra adeudos, bloquea suma incorrecta, acepta suma exacta y reinicia al quitar imagen',async()=>{
 const c=setup();await c.ui.cargar();await c.ui.actualizar('MANTENIMIENTO',true,'600','2026-10-26');
 assert.equal(c.ids.get('paymentAllocation').hidden,false);assert.equal(c.ids.get('residentAddress').hidden,true);assert.equal(c.ui.valido(),false);
 const a=c.ids.get('allocationAmount1');a.value='300';await a.handlers.input();assert.equal(c.ui.valido(),false);
 const b=c.ids.get('allocationAmount2');b.value='299.99';await b.handlers.input();assert.equal(c.ui.valido(),false);
 b.value='300';await b.handlers.input();assert.equal(c.ui.valido(),true);assert.equal(c.latest.monto,'600');assert.equal(c.ui.datos().length,2);
 c.ui.reset();await c.ui.actualizar('MANTENIMIENTO',false,'','');assert.equal(c.ui.valido(),false);
 await c.ui.actualizar('EXTRAORDINARIO',true,'600','2026-10-26');assert.equal(c.ids.get('paymentAllocation').hidden,true);
});

test('respuesta de cotización tardía no habilita un reparto después de quitar el comprobante',async()=>{
 let resolve;
 const c=setup(3,()=>new Promise(r=>{resolve=r}));await c.ui.cargar();
 await c.ui.actualizar('MANTENIMIENTO',true,'600','2026-10-26');
 const a=c.ids.get('allocationAmount1');a.value='600';const pending=a.handlers.input();
 assert.equal(c.ui.valido(),false);c.ui.reset();await c.ui.actualizar('MANTENIMIENTO',false,'','');
 resolve({data:{distribuciones:[{casaId:1,monto:600,plan:{recargo:0,meses:2}}]}});await pending;
 assert.equal(c.ui.valido(),false);
});
