'use strict';
const { Op } = require('sequelize');
const { Cuota, PagoReportado } = require('../models');
const Reserva = require('../models/ReservaCasaClub');
const { calcularAdeudoVivienda } = require('./adeudo-vivienda-analisis.service');
const { estadoCargos } = require('./cargos-extraordinarios.service');
const { fechaMexico } = require('./vigencia-calculo');
const {Casa}=require('../models');
const {tarifaParaCasa}=require('./tarifa-mantenimiento.service');

// C3 solamente consulta este resumen. No depende de proyectos, reservas ni
// saldos de casa club; ninguna de esas deudas debe alterar los TAGs.
async function consultarSoloMantenimiento(casaId) {
  const hoy = fechaMexico();
  const casa=await Casa.findByPk(casaId);
  if(!casa)throw Object.assign(new Error('Vivienda no encontrada'),{status:404});
  const cuotas = await Cuota.findAll({where:{casaId},attributes:['anio','mes','estatusPago','montoPagado','montoCuota','recargo','recargoPagado','saldoPendiente','origenImportacion']});
  const mantenimiento = calcularAdeudoVivienda(cuotas,{anio:Number(hoy.slice(0,4)),mes:Number(hoy.slice(5,7)),hoy,tarifa:tarifaParaCasa(casa)});
  return {casaId,fechaConsulta:hoy,tipos:{MANTENIMIENTO:mantenimiento.detalles},
    totales:{MANTENIMIENTO:mantenimiento.saldoPendiente},total:mantenimiento.saldoPendiente};
}

async function consultarAdeudos(casaId) {
  const hoy = fechaMexico();
  const [soloMantenimiento,cargos,reservas] = await Promise.all([
    consultarSoloMantenimiento(casaId),
    estadoCargos(casaId),
    Reserva.findAll({where:{casaId,estatus:'APROBADA',pagado:false},attributes:['id','fecha','fechaLimitePago','cuotaRecuperacion','depositoGarantia','limpieza']})
  ]);
  const reservaIds=reservas.map(r=>r.id);
  const proofs=reservaIds.length?await PagoReportado.findAll({where:{reservaCasaClubId:{[Op.in]:reservaIds},estatus:'PENDIENTE_VALIDACION'},attributes:['reservaCasaClubId']}):[];
  const submitted=new Set(proofs.map(p=>String(p.reservaCasaClubId)));
  const extras = cargos.filter(x=>x.estado!=='PAGADO'&&x.periodo.slice(0,7)<=hoy.slice(0,7))
    .map(x=>({categoria:'EXTRAORDINARIO',id:x.id,concepto:x.concepto,periodo:x.periodo.slice(0,7),monto:x.monto,estado:x.estado}));
  const club = reservas.map(r=>({categoria:'CASA_CLUB',id:r.id,concepto:'Casa club',periodo:r.fecha,monto:Number(r.cuotaRecuperacion)+Number(r.depositoGarantia)+Number(r.limpieza),
    renta:Number(r.cuotaRecuperacion),deposito:Number(r.depositoGarantia),limpieza:Number(r.limpieza),fechaLimitePago:r.fechaLimitePago,estado:submitted.has(String(r.id))?'EN_REVISION':'PENDIENTE'}));
  const tipos = {
    MANTENIMIENTO:soloMantenimiento.tipos.MANTENIMIENTO,
    EXTRAORDINARIO:extras,
    CASA_CLUB:club
  };
  const totales = Object.fromEntries(Object.entries(tipos).map(([k,v])=>[k,Math.round(v.reduce((s,x)=>s+Math.round(x.monto*100),0))/100]));
  return {casaId,fechaConsulta:hoy,tipos,totales,total:Math.round(Object.values(totales).reduce((a,b)=>a+b,0)*100)/100,
    cantidad:Object.values(tipos).reduce((a,b)=>a+b.length,0)};
}
module.exports={consultarAdeudos,consultarSoloMantenimiento};
