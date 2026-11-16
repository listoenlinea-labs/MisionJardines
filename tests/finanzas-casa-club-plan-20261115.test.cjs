'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const balance=require('../docs/assets/js/analisis-balance.js');
const costos=require('../docs/assets/js/costos-presupuesto-proyecto.js');
const content=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('los egresos son conceptos reales, no la meta estimada',()=>{
 const project={recaudado:62700,presupuestoBase:138600,
  gastosConceptos:[
   {monto:24432,pagado:true,incluidoPresupuesto:true},
   {monto:29300,pagado:true,incluidoPresupuesto:true}
  ],egresosReales:53732};
 assert.equal(costos.resumen(project).metaEstimada,138600);
 assert.equal(costos.resumen(project).gastosReales,53732);
 assert.equal(balance.proyecto(project).egresos,53732);
 assert.equal(balance.proyecto(project).diferencia,8968);
 assert.equal(costos.resumen(project).metaRestante,84868);
});
test('el calendario público permite el día actual y no bloquea rechazadas futuras',()=>{
 const script=content('docs/assets/js/casa-club.js');
 assert.match(script,/date<today\(\)\|\|date>lastDay\(\)/);
 assert.match(script,/r\.fecha<today\(\)&&\['RECHAZADA','CANCELADA'\]/);
 assert.doesNotMatch(script,/date<tomorrow\(\)\|\|date>lastDay\(\)/);
});
test('el cambio de folios detiene espejos y coincidencias de vivienda por fecha',()=>{
 const script=content('backend/src/services/casa-club-google-sync.service.js');
 assert.match(script,/const exportedByFolio=/);
 assert.match(script,/const sheetHouseDates=/);
 assert.match(script,/folioExterno\(r\)/);
 assert.match(script,/sheetHouseDates\.has\(houseDate\(/);
});
