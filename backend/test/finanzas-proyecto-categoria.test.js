'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=p=>fs.readFileSync(path.resolve(__dirname,'../../',p),'utf8');
const {categorias,etiquetas,canonica,resumenEgresos}=require('../src/services/categorias-egresos.service');
const {validarCambio,categoriasEquivalentes,prepararAjuste}=require('../src/services/ajuste-egresos-mensuales.service');

test('Proyecto es una novena categoría de egresos, distinta de cuota extraordinaria',()=>{
 assert.equal(categorias.length,9);
 assert.ok(categorias.includes('PROYECTO'));
 assert.equal(etiquetas.PROYECTO,'Proyecto');
 assert.equal(canonica('PROYECTO'),'PROYECTO');
 assert.equal(canonica('CUOTA_EXTRAORDINARIA'),'CUOTA_EXTRAORDINARIA');
 // NO reclasificar gastos del catálogo antiguo en esta nueva categoría.
 assert.equal(canonica('PROYECTOS'),'CUOTA_EXTRAORDINARIA');
 assert.equal(categoriasEquivalentes('PROYECTO').length,1);
 assert.deepEqual(categoriasEquivalentes('PROYECTO'),['PROYECTO']);
});

test('Proyecto se separa de extraordinarias y acumula por mes e histórico sin duplicar',()=>{
 const rows=[
  {fecha:'2026-09-10',categoria:'PROYECTO',monto:'500.00'},
  {fecha:'2026-11-02',categoria:'PROYECTO',monto:'1200.00'},
  {fecha:'2026-11-04',categoria:'CUOTA_EXTRAORDINARIA',monto:'250.00'},
  {fecha:'2026-11-05',categoria:'PROYECTOS',monto:'100.00'},
  {fecha:'2026-11-10',categoria:'INTERNET',monto:'499.00'},
  {fecha:'2026-12-01',categoria:'PROYECTO',monto:'700.00'}
 ];
 const result=resumenEgresos(rows,'2026-11-01','2026-11-30');
 const proyecto=result.conceptos.find(x=>x.categoria==='PROYECTO');
 const extra=result.conceptos.find(x=>x.categoria==='CUOTA_EXTRAORDINARIA');
 assert.equal(proyecto.concepto,'Proyecto');
 assert.equal(proyecto.mes,1200);
 assert.equal(proyecto.acumulado,1700);
 assert.equal(extra.mes,350);
 assert.equal(extra.acumulado,350);
 assert.equal(result.mes,1200+350+499);
 assert.equal(result.acumulado,1700+350+499);
 assert.equal(result.historialMensual.PROYECTO.length,11);
 assert.equal(result.historialMensual.PROYECTO[8].totalPagado,500);
 assert.equal(result.historialMensual.PROYECTO[9].totalPagado,0);
 assert.equal(result.historialMensual.PROYECTO[10].totalPagado,1200);
 assert.equal(result.historialMensual.CUOTA_EXTRAORDINARIA[10].totalPagado,350);
});

test('el editor histórico también admite proyectos sin mezclar categorías',()=>{
 const cambio=validarCambio({categoria:'PROYECTO',periodo:'2026-11',
  totalAnterior:'1200',totalPagado:'1000'});
 assert.equal(cambio.categoria,'PROYECTO');
 const ajuste=prepararAjuste(cambio,[{monto:'1200'}]);
 assert.equal(ajuste.diferencia,-20000);
 assert.match(ajuste.concepto,/PROYECTO/);
});

test('MySQL enum admite PROYECTO manteniendo las categorías anteriores',()=>{
 const model=root('backend/src/models/Egreso.js');
 const schema=root('backend/src/services/finanzas-schema.service.js');
 for(const cat of [...categorias,'LUZ','AGUA','PROYECTOS']){
  assert.ok(model.includes("'"+cat+"'"),cat+' en modelo');
  assert.ok(schema.includes("'"+cat+"'"),cat+' en ajuste de tabla');
 }
 assert.match(schema,/if\(opciones\.every\(c=>columnType\.includes/);
 assert.match(schema,/ALTER TABLE egresos_fraccionamiento MODIFY COLUMN categoria ENUM/);
});

test('el formulario, filtro y gráfico admiten Proyecto con los mismos controles que otros egresos',()=>{
 const html=root('docs/analisis-cuotas.html');
 const js=root('docs/assets/js/analisis-cuotas.js');
 assert.equal(html.split('<option value="PROYECTO">Proyecto</option>').length-1,2);
 assert.match(html,/Cuota extraordinaria, Proyecto, Internet, Servicios/);
 assert.match(js,/PROYECTO:'Proyecto'/);
 assert.match(js,/egresos\.conceptos\.map\(c=>/);
 assert.match(js,/selectedExpenseCategory=categoria/);
 assert.match(js,/canonicalExpenseCategory\(e\.categoria\)===category/);
 assert.match(js,/body\.categoria==='CUOTA_EXTRAORDINARIA'/);
 assert.match(js,/const extra=\$\('expenseCategory'\)\.value==='CUOTA_EXTRAORDINARIA'/);
 const controller=root('backend/src/controllers/finanzas.controller.js');
 assert.match(controller,/const extraordinaria=categoria==='CUOTA_EXTRAORDINARIA'/);
 assert.match(controller,/!categorias\.includes\(categoria\)/);
 assert.match(controller,/const cuota=extraordinaria\?await crearPorEgreso/);
 // Proyecto NO puede convertirse desde "Configurar cobro" en deuda de residentes.
 assert.match(controller,/!\['CUOTA_EXTRAORDINARIA','PROYECTOS'\]\.includes\(egreso\.categoria\)/);
 assert.match(js,/e\.categoria==='CUOTA_EXTRAORDINARIA'\|\|e\.categoria==='PROYECTOS'/);
});

test('actualiza scripts y shell para evitar JS antiguo en caché',()=>{
 const html=root('docs/analisis-cuotas.html'),
  shell=root('docs/assets/js/app-shell.js'),app=root('docs/app.html');
 assert.match(html,/analisis-cuotas\.js\?v=20261103-proyectos-extraordinarios/);
 assert.match(shell,/_mjVersion.*proyectos-extraordinarios-20261103/);
 assert.match(app,/app-shell\.js\?v=20261103-proyectos-extraordinarios/);
});
