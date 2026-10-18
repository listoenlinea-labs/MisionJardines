'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {resumenConceptos}=require('../src/services/resumen-conceptos-analisis.service');

const viviendas=[{casaId:10},{casaId:20},{casaId:30}];
const base={viviendas,anio:2026,mes:10,cargos:[],reportados:[],manuales:[],reservas:[]};
const summary=extra=>resumenConceptos({...base,...extra});
const byId=(rows,id)=>rows.find(h=>h.casaId===id);

test('Sin proyectos distribuidos ni reservas aprobadas, todas las casas deben $0 en ambos conceptos',()=>{
  const result=summary({});
  for(const rows of Object.values(result)){
    assert.equal(rows.length,3);
    rows.forEach(h=>assert.deepEqual({estatus:h.estatus,pagado:h.montoPagado,saldo:h.saldoPendiente,ultimo:h.ultimoMesPagado},
      {estatus:'SIN CARGOS',pagado:0,saldo:0,ultimo:null}));
  }
});

test('Los cargos extraordinarios solo se pagan con validación bancaria o asiento manual propio',()=>{
  const result=summary({cargos:[
    {id:1,casaId:10,periodo:'2026-10-01',monto:'12.99'},
    {id:2,casaId:10,periodo:'2026-10-01',monto:'20.01'},
    {id:3,casaId:20,periodo:'2026-10-01',monto:'11.00'},
    {id:4,casaId:10,periodo:'2026-11-01',monto:'13.00'}
  ],reportados:[
    {tipoPago:'EXTRAORDINARIO',cargoExtraordinarioId:1,estatus:'PENDIENTE_VALIDACION'},
    {tipoPago:'EXTRAORDINARIO',cargoExtraordinarioId:2,estatus:'VALIDADO'},
    {tipoPago:'MANTENIMIENTO',cargoExtraordinarioId:3,estatus:'VALIDADO'}
  ],manuales:[{tipoPago:'EXTRAORDINARIO',cargoExtraordinarioId:4}]});
  assert.deepEqual(byId(result.EXTRAORDINARIO,10),{casaId:10,estatus:'PENDIENTE',montoPagado:20.01,
    saldoPendiente:12.99,ultimoMesPagado:{mes:'NOVIEMBRE',anio:2026}});
  assert.equal(byId(result.EXTRAORDINARIO,20).saldoPendiente,11);
  assert.equal(byId(result.EXTRAORDINARIO,30).estatus,'SIN CARGOS');
});

test('Casa club requiere aprobación y usa fecha límite de pago, no fecha del evento',()=>{
  const result=summary({reservas:[
    {casaId:10,fecha:'2026-12-20',fechaLimitePago:'2026-10-25',estatus:'APROBADA',pagado:false,
      cuotaRecuperacion:'500.00',depositoGarantia:'300.00',limpieza:'50.00'},
    {casaId:20,fecha:'2026-10-24',estatus:'PENDIENTE',pagado:false,cuotaRecuperacion:'700.00'},
    {casaId:30,fecha:'2026-10-15',estatus:'CANCELADA',pagado:false,cuotaRecuperacion:'900.00'}
  ]});
  assert.equal(byId(result.CASA_CLUB,10).saldoPendiente,850);
  assert.equal(byId(result.CASA_CLUB,10).estatus,'PENDIENTE');
  assert.equal(byId(result.CASA_CLUB,20).estatus,'SIN CARGOS');
  assert.equal(byId(result.CASA_CLUB,30).saldoPendiente,0);
  assert.equal(byId(result.EXTRAORDINARIO,10).saldoPendiente,0);
});

test('Reservas pagadas no deben saldo, muestran el ingreso en el mes de vencimiento',()=>{
  const result=summary({reservas:[
    {casaId:10,fecha:'2026-11-18',fechaLimitePago:'2026-10-27',estatus:'APROBADA',pagado:true,
      cuotaRecuperacion:'300.00',depositoGarantia:'100.00',limpieza:'0.00'}
  ]});
  assert.deepEqual(byId(result.CASA_CLUB,10),{casaId:10,estatus:'PAGADO',montoPagado:400,
    saldoPendiente:0,ultimoMesPagado:{mes:'OCTUBRE',anio:2026}});
});

test('Un comprobante de Casa club validado cuenta como pagado; uno en revisión no',()=>{
  const reservas=[
    {id:1,casaId:10,fecha:'2026-11-18',fechaLimitePago:'2026-10-27',estatus:'APROBADA',pagado:false,cuotaRecuperacion:300},
    {id:2,casaId:20,fecha:'2026-11-19',fechaLimitePago:'2026-10-27',estatus:'APROBADA',pagado:false,cuotaRecuperacion:200}
  ];
  const result=summary({reservas,reportados:[
    {tipoPago:'CASA_CLUB',reservaCasaClubId:1,estatus:'VALIDADO'},
    {tipoPago:'CASA_CLUB',reservaCasaClubId:2,estatus:'PENDIENTE_VALIDACION'}
  ]});
  assert.equal(byId(result.CASA_CLUB,10).saldoPendiente,0);
  assert.equal(byId(result.CASA_CLUB,10).montoPagado,300);
  assert.equal(byId(result.CASA_CLUB,20).saldoPendiente,200);
  assert.equal(byId(result.CASA_CLUB,20).montoPagado,0);
});

test('El futuro no genera saldo anticipado, pero muestra el último mes efectivamente pagado',()=>{
  const result=summary({cargos:[
    {id:1,casaId:10,periodo:'2027-01-01',monto:'10.00'},
    {id:2,casaId:20,periodo:'2027-01-01',monto:'10.00'}
  ],manuales:[{tipoPago:'EXTRAORDINARIO',cargoExtraordinarioId:1}]});
  assert.deepEqual(byId(result.EXTRAORDINARIO,10),{casaId:10,estatus:'SIN CARGOS',montoPagado:0,
    saldoPendiente:0,ultimoMesPagado:{mes:'ENERO',anio:2027}});
  assert.equal(byId(result.EXTRAORDINARIO,20).saldoPendiente,0);
});

test('La interfaz comparte tabla y filtros; pestañas horizontales y cobro por concepto',()=>{
  const read=p=>fs.readFileSync(path.resolve(__dirname,'../../'+p),'utf8');
  const html=read('docs/analisis-cuotas.html'),js=read('docs/assets/js/analisis-cuotas.js');
  const css=read('docs/assets/css/analisis-cuotas.css');
  assert.equal((html.match(/id="financeHouseRows"/g)||[]).length,1);
  assert.deepEqual([...html.matchAll(/data-finance-concept="([^"]+)"/g)].map(x=>x[1]),['MANTENIMIENTO','EXTRAORDINARIO','CASA_CLUB']);
  assert.match(css,/\.finance-concept-tabs\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:700px\)\{[\s\S]*?\.finance-concept-tabs\{display:grid!important;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(js,/data\.viviendasMantenimiento\.map\(h=>concepto==='MANTENIMIENTO'\?h:/);
  assert.match(js,/\$\('housePaymentType'\)\.value=activeConcept/);
  assert.match(js,/Casa club cobrado/);
});
