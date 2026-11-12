'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../../docs');
const html=()=>fs.readFileSync(path.join(root,'casa-club.html'),'utf8');
const js=()=>fs.readFileSync(path.join(root,'assets/js/casa-club.js'),'utf8');
const css=()=>fs.readFileSync(path.join(root,'assets/css/casa-club.css'),'utf8');

test('filtrar por mes de evento sin perder los filtros de calle y número',()=>{
 const source=js();
 const start=source.indexOf(' function coincideFiltrosReserva(');
 const end=source.indexOf(' function aplicarFiltroReservas(){',start);
 assert.ok(start>=0&&end>start);
 const coincide=new Function(source.slice(start,end)+'\nreturn coincideFiltrosReserva;')();
 const nov={id:1,fecha:'2026-11-21',casa:{calleCorrecta:'Gardenias',numero:'20'}};
 const dic={id:2,fecha:'2026-12-13',casa:{calle:'Jardines',numero:'336'}};
 assert.equal(coincide(nov,{calle:'',numero:'',mes:'2026-11'}),true);
 assert.equal(coincide(dic,{calle:'',numero:'',mes:'2026-11'}),false);
 assert.equal(coincide(dic,{calle:'jardines',numero:'33',mes:'2026-12'}),true);
 assert.equal(coincide(dic,{calle:'jardines',numero:'33',mes:'2026-11'}),false);
 assert.equal(coincide(nov,{calle:'gardenias',numero:'20',mes:'2026-11'}),true);
 assert.equal(coincide(nov,{calle:'rosas',numero:'20',mes:'2026-11'}),false);
 assert.equal(coincide(nov,{calle:'gardenias',numero:'5',mes:'2026-11'}),false);
 assert.equal(coincide(dic,{calle:'',numero:'',mes:''}),true);
});

test('meses disponibles por año se actualizan y Limpiar filtros incluye el mes',()=>{
 const page=html(),script=js();
 assert.match(page,/<select id="clubFilterMonth"/);
 assert.match(page,/Todos los meses/);
 assert.match(script,/meses\.includes\(previo\)\?previo:''/);
 assert.match(script,/filterMonth\.addEventListener\('change',aplicarFiltroReservas\)/);
 assert.match(script,/filterMonth\.value='';aplicarFiltroReservas\(\)/);
 assert.match(script,/actualizarOpcionesCalle\(\);actualizarOpcionesMes\(\);aplicarFiltroReservas\(\)/);
 assert.match(script,/String\(row\.fecha\|\|''\)\.slice\(0,7\)===mes/);
});

test('acciones Ver detalles/Eliminar/Cancelar se muestran en fila horizontal',()=>{
 const script=js(),styles=css();
 assert.match(script,/class="club-actions-inline"/);
 assert.match(styles,/\.club-actions-inline\{display:flex;flex-flow:row nowrap/);
 assert.match(styles,/\.club-actions-inline button\{flex:0 0 auto/);
 assert.match(styles,/white-space:nowrap/);
 assert.match(html(),/casa-club\.js\?v=20261112-filtro-mes-acciones-fila/);
 assert.match(html(),/casa-club\.css\?v=20261112-filtro-mes-acciones-fila/);
});
