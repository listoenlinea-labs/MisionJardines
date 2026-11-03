'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=p=>fs.readFileSync(path.resolve(__dirname,'../../',p),'utf8');

function service(){
 const src=root('backend/src/services/saldo-aportaciones-extraordinarias.service.js');
 const mod={exports:{}},deps={
  sequelize:{Op:{in:Symbol('in')}},'../models':{}
 };
 new Function('module','exports','require',src)(mod,mod.exports,name=>{
  if(!(name in deps))throw Error('dependencia inesperada '+name);
  return deps[name];
 });
 return mod.exports;
}
const {calcularSaldo,centavos}=service();
const cargo={id:17,monto:'1000.00'};
const a=(m,fecha)=>({cargoExtraordinarioId:17,monto:m,fecha});
const bank=(m,estatus)=>({cargoExtraordinarioId:17,monto:m,estatus});

test('la vivienda acumula abonos de cualquier fecha y origen sin imponer mensualidades',()=>{
 const x=calcularSaldo(cargo,
  [bank(300,'VALIDADO')],
  [a(150,'2026-11-04')],
  [a('200.00','2026-11-03'),a('100.00','2026-11-10')]);
 assert.equal(x.meta,1000);
 assert.equal(x.abonado,750);
 assert.equal(x.restante,250);
 assert.equal(x.disponible,250);
 assert.equal(x.estado,'PAGO_PARCIAL');
});
test('el primer depósito validado no liquida una meta de $1000',()=>{
 const x=calcularSaldo(cargo,[bank(200,'VALIDADO')],[],[]);
 assert.equal(x.estado,'PAGO_PARCIAL');
 assert.equal(x.restante,800);
});
test('los comprobantes pendientes reservan cupo pero no se cuentan como ingresos recibidos',()=>{
 const x=calcularSaldo(cargo,[bank(300,'VALIDADO'),bank(150,'PENDIENTE_VALIDACION'),bank(200,'PENDIENTE_VALIDACION')],[],[a(100)]);
 assert.equal(x.abonado,400);
 assert.equal(x.pendienteValidacion,350);
 assert.equal(x.restante,600);
 assert.equal(x.disponible,250);
 assert.equal(x.estado,'EN_REVISION');
});
test('múltiples abonos validan la meta exacta y eliminan saldo disponible',()=>{
 const x=calcularSaldo(cargo,[bank(500,'VALIDADO'),bank(300,'VALIDADO')],[],[a(200)]);
 assert.equal(x.estado,'PAGADO');
 assert.equal(x.restante,0);
 assert.equal(x.disponible,0);
});
test('un rechazo bancario no se contabiliza',()=>{
 const x=calcularSaldo(cargo,[bank(900,'RECHAZADO'),bank(300,'VALIDADO')],[],[]);
 assert.equal(x.abonado,300);
 assert.equal(x.restante,700);
});
test('sin contribuciones no hay vencimiento ni intereses implícitos',()=>{
 const x=calcularSaldo(cargo,[],[],[]);
 assert.equal(x.estado,'PENDIENTE');
 assert.equal(x.meta,1000);
 assert.equal(x.restante,1000);
 assert.equal(x.pendienteValidacion,0);
 assert.equal(centavos('0.01'),1);
 assert.throws(()=>centavos(-1));
});
test('residente puede reportar varias transferencias; sólo Casa Club exige importe exacto',()=>{
 const src=root('backend/src/controllers/pagos.controller.js');
 assert.match(src,/tipoPago === 'CASA_CLUB' && Math\.abs\(monto - requerido\)/);
 assert.doesNotMatch(src,/tipoPago !== 'MANTENIMIENTO' && Math\.abs\(monto - requerido\)/);
 assert.match(src,/consultarSaldoCargo\(locked,\{transaction\}\)/);
 assert.match(src,/centavos\(monto\)>centavos\(saldo\.disponible\)/);
 assert.match(src,/if\(reservaCasaClub&&\(existenteConcepto\|\|manual\)\)/);
 assert.match(src,/cargoExtraordinarioId:cargoExtraordinario\?\.id/);
 assert.match(src,/monto,\s*montoRequerido:\s*requerido/);
});
test('administrador puede registrar aportaciones sucesivas; los pagos bancarios se respetan',()=>{
 const src=root('backend/src/controllers/pagos-manuales-analisis.controller.js');
 assert.match(src,/consultarSaldoCargo\(cargo,\{transaction\}\)/);
 assert.match(src,/if\(importe>cents\(saldo\.disponible\)\)/);
 assert.match(src,/AportacionExtraordinaria\.create/);
 assert.match(src,/metaAlcanzada:restante===0/);
});
test('el residente ve meta, aportado, disponible y permite cantidad libre',()=>{
 const js=root('docs/assets/js/pagos.js'),html=root('docs/pagos.html');
 assert.match(js,/Meta:.*Aportado:/);
 assert.match(js,/montoDisponible/);
 assert.match(js,/readOnly=false/);
 assert.match(js,/Math\.round\(amount\*100\)>Math\.round\(required\*100\)/);
 assert.match(html,/sin periodicidad/);
 assert.match(html,/pagos\.js\?v=20261103-aportaciones-libres/);
 new Function(js);
});
test('la vista administrativa identifica la meta sin llamar deudor al residente',()=>{
 const js=root('docs/assets/js/analisis-cuotas.js');
 assert.match(js,/META ALCANZADA/);
 assert.match(js,/SIN APORTES/);
 assert.match(js,/ABONANDO/);
 assert.match(js,/Falta para la meta/);
 assert.match(js,/montoDisponible/);
 new Function(js);
});
test('los servicios de cuotas y deuda no modifican vigencias ni bloquean TAGs',()=>{
 const svc=root('backend/src/services/saldo-aportaciones-extraordinarias.service.js');
 assert.doesNotMatch(svc,/ZkTarjeta|PagoAccesoC3|zkteco-vigencias/);
 const cargos=root('backend/src/services/cargos-extraordinarios.service.js');
 assert.match(cargos,/calcularSaldo\(c,reportados,manuales,aportaciones\)/);
 const resumen=root('backend/src/services/resumen-conceptos-analisis.service.js');
 assert.match(resumen,/acumulados\.get\(id\(cargo\.id\)\)/);
 const deudas=root('backend/src/services/adeudos-comunidad.service.js');
 assert.match(deudas,/esAportacionVoluntaria:true/);
});
