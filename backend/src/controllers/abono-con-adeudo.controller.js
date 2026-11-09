'use strict';
// Reconoce el ingreso del mes ACTUAL aunque subsistan meses anteriores.
// La cuota se mantiene PAGO_PARCIAL deliberadamente: no adelanta el último
// corte contable ni habilita TAGs. Su pago sí disminuye el saldo adeudado.
const { randomUUID } = require('node:crypto');
const sequelize = require('../config/database');
const { Casa, Cuota, PagoReportado } = require('../models');
const { Op } = require('sequelize');
const { fechaMexico } = require('../services/vigencia-calculo');
const { calcularAdeudoVivienda } = require('../services/adeudo-vivienda-analisis.service');
const { tarifaParaCasa } = require('../services/tarifa-mantenimiento.service');
const { exentoEn } = require('../services/recargos-exenciones.service');
const { RECARGO, MESES } = require('../services/mensualidades-mantenimiento');
const error = (status,message)=>Object.assign(new Error(message),{status});

function reglas(hoy, casa, cuotas) {
  const [anio, mes, dia] = hoy.split('-').map(Number);
  const anterior=new Date(Date.UTC(anio,mes-1,0));
  const previo=calcularAdeudoVivienda(cuotas,{
    anio:anterior.getUTCFullYear(),mes:anterior.getUTCMonth()+1,
    hoy,tarifa:tarifaParaCasa(casa),exencionesRecargo:casa.exencionesRecargo||[]
  });
  const importe=tarifaParaCasa(casa)+
    (dia>10 && !exentoEn(casa.exencionesRecargo||[],hoy.slice(0,7))?RECARGO:0);
  return { anio, mes, nombreMes:MESES[mes-1],importe, moroso:previo.saldoPendiente>0, deudaPrevia:previo.saldoPendiente };
}

async function consultar(req,res) {
  try {
    const casaId=Number(req.params.casaId);
    if(!Number.isSafeInteger(casaId)||casaId<1)throw error(400,'Vivienda inválida');
    const casa=await Casa.findByPk(casaId);
    if(!casa)throw error(404,'La vivienda no existe');
    const cuotas=await Cuota.findAll({where:{casaId}});
    const r=reglas(fechaMexico(),casa,cuotas);
    const existe=cuotas.some(c=>Number(c.anio)===r.anio&&String(c.mes)===r.nombreMes&&
      (Number(c.montoPagado)>0||['PAGADO','CONDONADO','CANCELADO'].includes(String(c.estatusPago))));
    res.set('Cache-Control','private, no-store');
    return res.json({ok:true,data:{disponible:r.moroso&&!existe,anio:r.anio,mes:r.mes,
      nombreMes:r.nombreMes,importe:r.importe, motivo:!r.moroso?'La vivienda no presenta deuda de meses anteriores':existe?
        'Existe un pago o movimiento para este mes. Revisa el historial antes de registrar otro':'Se conservarán los adeudos anteriores y no se modificarán los TAGs'}});
  } catch(e) {if(!e.status)console.error('cotizar abono con adeudo',e);return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible comprobar el adeudo'});}
}

async function registrar(req,res) {
  try {
    const casaId=Number(req.body?.casaId);
    const formaPago=String(req.body?.formaPago||'EFECTIVO').toUpperCase();
    if(!Number.isSafeInteger(casaId)||casaId<1)throw error(400,'Vivienda inválida');
    if(!['EFECTIVO','TRANSFERENCIA','DEPOSITO','OTRO'].includes(formaPago))throw error(400,'Forma de pago inválida');
    if(req.body?.confirmarAdeudo!==true)throw error(400,'Confirma que los meses anteriores continuarán pendientes');
    const resultado=await sequelize.transaction({isolationLevel:'READ COMMITTED'},async transaction=>{
      // Serializar POR VIVIENDA y no permitir dos abonos al mes ni un abono
      // paralelo a una cuota real, validación bancaria o condonación.
      const casa=await Casa.findByPk(casaId,{transaction,lock:transaction.LOCK.UPDATE});
      if(!casa)throw error(404,'Vivienda no encontrada');
      const cuotas=await Cuota.findAll({where:{casaId},transaction,lock:transaction.LOCK.UPDATE});
      const r=reglas(fechaMexico(),casa,cuotas);
      if(!r.moroso)throw error(409,'Esta vivienda no tiene adeudos anteriores; utiliza el pago ordinario.');
      if(Number(req.body?.anio)!==r.anio||Number(req.body?.mes)!==r.mes)
        throw error(409,'Solo se puede reconocer el mes calendario actual; recarga el formulario.');
      const monto=Number(req.body?.monto);
      if(!Number.isInteger(monto)||monto!==r.importe)
        throw error(409,'El monto del mes actual es $'+r.importe+'. No se permite un importe distinto en este flujo.');
      const existente=cuotas.find(c=>Number(c.anio)===r.anio&&String(c.mes)===r.nombreMes);
      if(existente && (Number(existente.montoPagado)>0 || existente.referencia || existente.folio ||
        !['PENDIENTE','PAGO_PARCIAL'].includes(String(existente.estatusPago))))
        throw error(409,'Este mes ya tiene un pago, folio o movimiento pendiente de conciliar; no se duplicará.');
      // No intercalar con comprobantes bancarios pendientes de verificar.
      const banco=await PagoReportado.findOne({where:{
        casaId,tipoPago:'MANTENIMIENTO',estatus:{[Op.in]:['PENDIENTE_VALIDACION','PENDIENTE']}
      },attributes:['id'],transaction});
      if(banco)throw error(409,'Hay un comprobante bancario en revisión. Concilia antes de registrar un abono manual.');
      const referencia='MJABONO:'+randomUUID();
      const ahora=new Date();
      const valores={
        casaId,anio:r.anio,mes:r.nombreMes,montoCuota:r.importe,
        montoPagado:monto,recargo:r.importe-tarifaParaCasa(casa),
        recargoPagado:r.importe-tarifaParaCasa(casa),saldoPendiente:0,
        // Nunca PAGADO: mantiene la morosidad y el corte anterior.
        estatusPago:'PAGO_PARCIAL',tipoPago:'MANTENIMIENTO',formaPago,referencia,
        fechaPago:ahora,fechaConfirmacion:ahora,confirmadoPorUsuarioId:req.usuario.usuarioId,
        origenImportacion:'MANUAL_ABONO_ADEUDO',
        observaciones:'Abono con adeudo del mes actual. Existen deudas pendientes por aclarar. No adelantar corte ni TAGs. Usuario '+req.usuario.usuarioId,
        nombrePagador:casa.nombre||null,calleSnapshot:casa.calleCorrecta||casa.calle,numeroCasaSnapshot:casa.numero,
        actualizadoEn:ahora
      };
      if(existente)await existente.update(valores,{transaction});
      else await Cuota.create(valores,{transaction});
      return {casaId,calle:casa.calleCorrecta||casa.calle,numero:casa.numero,
        anio:r.anio,mes:r.mes,nombreMes:r.nombreMes,monto,formaPago,referencia,
        tipoMovimiento:'ABONO_CON_ADEUDO',moroso:true,tagsModificados:false};
    });
    res.set('Cache-Control','private, no-store');
    return res.status(201).json({ok:true,data:resultado,message:'Abono con adeudo registrado. No se modificaron las vigencias de TAGs.'});
  }catch(e){
    if(!e.status)console.error('registrar abono con adeudo',e);
    return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible registrar el abono con adeudo'});
  }
}
module.exports={consultar,registrar,reglas};
