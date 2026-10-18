'use strict';
const { Op } = require('sequelize');
const { Casa, Cuota, CargoExtraordinario, CuotaExtraordinaria, PagoReportado, PagoManualConcepto } = require('../models');
const { seleccionarPadronAnalisis } = require('./padron-finanzas.service');
const { fechaMexico } = require('./vigencia-calculo');

const NUM_VIVIENDAS = 231;
const error = (status, message) => Object.assign(new Error(message), { status });
const centavos = amount => Math.round(Number(amount) * 100);

// Reparto en centavos de TODO el proyecto: sin pérdidas por redondeo.
function distribuir(total, casas, meses, inicio) {
  const cents = centavos(total), cantidad = casas.length * meses;
  if (!Number.isSafeInteger(cents) || cents < cantidad) throw error(400, 'El importe no alcanza para repartir al menos $0.01 por vivienda y mes');
  const base = Math.floor(cents / cantidad), residuo = cents % cantidad;
  const sorted = [...casas].sort((a,b) => Number(a.id) - Number(b.id));
  const [year,month] = inicio.split('-').map(Number);
  const cargos = [];
  for (let i=0;i<meses;i++) {
    const periodo = new Date(Date.UTC(year, month - 1 + i, 1)).toISOString().slice(0,10);
    sorted.forEach((casa,j) => cargos.push({casaId:casa.id,periodo,monto:(base + (i * sorted.length + j < residuo ? 1 : 0))/100}));
  }
  return cargos;
}

async function padronOficial(transaction) {
  const hoy=fechaMexico(),meses=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const [casas,cuotas]=await Promise.all([
    Casa.findAll({attributes:['id','calle','calleCorrecta','numero'],transaction}),
    Cuota.findAll({where:{anio:Number(hoy.slice(0,4)),mes:meses[Number(hoy.slice(5,7))-1]},attributes:['casaId','montoPagado','estatusPago'],transaction})
  ]);
  const padron = seleccionarPadronAnalisis(casas, cuotas).casas;
  if (padron.length !== NUM_VIVIENDAS) throw error(409, `El padrón actual tiene ${padron.length} viviendas y el reparto requiere exactamente ${NUM_VIVIENDAS}. Corrige o confirma el padrón antes de emitir cobros.`);
  return padron;
}

async function crearPorEgreso({egreso, meses, fechaInicio, usuarioId, transaction}) {
  if (!Number.isInteger(meses) || meses < 1 || meses > 36) throw error(400,'Selecciona de 1 a 36 meses para cubrir la cuota extraordinaria');
  if (!/^20\d{2}-(0[1-9]|1[0-2])-01$/.test(fechaInicio) || fechaInicio < '2026-10-01') throw error(400,'Indica el primer mes de cobro válido (YYYY-MM-01)');
  const casas = await padronOficial(transaction);
  const cargos = distribuir(egreso.monto, casas, meses, fechaInicio);
  const cuota = await CuotaExtraordinaria.create({
    concepto:egreso.concepto, monto:cargos[0].monto, montoTotal:egreso.monto,
    egresoId:egreso.id, meses, fechaInicio, viviendas:casas.length,
    creadoPorUsuarioId:usuarioId, activo:true
  },{transaction});
  // Los cargos se crean en la misma transacción del egreso: todo o nada.
  for (let offset=0;offset<cargos.length;offset+=500) {
    await CargoExtraordinario.bulkCreate(cargos.slice(offset,offset+500).map(c=>({...c,cuotaExtraordinariaId:cuota.id})),{transaction});
  }
  return cuota;
}

async function estadoCargos(casaId,{transaction}={}) {
  const cargos = await CargoExtraordinario.findAll({where:{casaId},include:[{model:CuotaExtraordinaria,as:'cuota',required:true,where:{activo:true}}],order:[['periodo','ASC']],transaction});
  if(!cargos.length)return [];
  const ids=cargos.map(c=>c.id);
  const [reportados,manuales] = await Promise.all([
    PagoReportado.findAll({where:{cargoExtraordinarioId:{[Op.in]:ids},estatus:{[Op.in]:['PENDIENTE_VALIDACION','VALIDADO']}},attributes:['cargoExtraordinarioId','estatus'],transaction}),
    PagoManualConcepto.findAll({where:{cargoExtraordinarioId:{[Op.in]:ids}},attributes:['cargoExtraordinarioId'],transaction})
  ]);
  const manualSet=new Set(manuales.map(p=>String(p.cargoExtraordinarioId)));
  const validSet=new Set(reportados.filter(p=>p.estatus==='VALIDADO').map(p=>String(p.cargoExtraordinarioId)));
  const pendingSet=new Set(reportados.filter(p=>p.estatus==='PENDIENTE_VALIDACION').map(p=>String(p.cargoExtraordinarioId)));
  return cargos.map(c=>({id:c.id,periodo:c.periodo,monto:Number(c.monto),concepto:c.cuota.concepto,cuotaExtraordinariaId:c.cuotaExtraordinariaId,
    estado:manualSet.has(String(c.id))||validSet.has(String(c.id))?'PAGADO':pendingSet.has(String(c.id))?'EN_REVISION':'PENDIENTE'}));
}
module.exports={NUM_VIVIENDAS,distribuir,padronOficial,crearPorEgreso,estadoCargos,error};
