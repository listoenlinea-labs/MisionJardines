'use strict';
const {Op}=require('sequelize');
const {createHash}=require('node:crypto');
const Casa=require('../models/Casa');
const Cuota=require('../models/Cuota');
const Pago=require('../models/PagoReportado');
const Eventos=require('../models/PagoAccesoC3');
const Tags=require('../models/ZkTarjeta');
const Aplicaciones=require('../models/PagoAccesoTagC3');
const {tarifaParaCasa}=require('./tarifa-mantenimiento.service');
const {validarOperacion}=require('./mensualidades-mantenimiento');
const calc=require('./cuotas-mantenimiento-calculo');
const idsBanco=require('./identificadores-bancarios.service');
const fail=m=>Object.assign(new Error(m),{status:409});
async function cargar(casaId,transaction){
 const casa=await Casa.findByPk(casaId,{transaction,lock:transaction.LOCK.UPDATE});
 if(!casa)throw fail('Vivienda inexistente');
 // ENUM mes está definido ENERO..DICIEMBRE: MySQL lo ordena por ese índice.
 const ultimo=await Cuota.findOne({where:{casaId,estatusPago:'PAGADO',montoPagado:{[Op.gt]:0}},
  transaction,lock:transaction.LOCK.UPDATE,order:[['anio','DESC'],['mes','DESC']]});
 const where={casaId};
 if(ultimo){
  const mes=calc.MESES.indexOf(String(ultimo.mes).toUpperCase());
  where[Op.or]=[{anio:{[Op.gt]:Number(ultimo.anio)}},
   {anio:Number(ultimo.anio),mes:{[Op.in]:calc.MESES.slice(mes+1)}}];
 }
 const posteriores=await Cuota.findAll({where,transaction,lock:transaction.LOCK.UPDATE,
  order:[['anio','ASC'],['mes','ASC']]});
 const rows=ultimo?[ultimo,...posteriores]:posteriores;
 return {casa,rows,cuotas:rows.map(r=>r.toJSON?r.toJSON():{...r}),tarifa:tarifaParaCasa(casa),exencionesRecargo:casa.exencionesRecargo||[]};
}
async function cotizar(casaId,fecha,monto,transaction){
 validarOperacion(fecha);
 const data=await cargar(casaId,transaction);
 if(await Pago.findOne({where:{...require('./pagos-reparto.service').condicionCasa(casaId),tipoPago:'MANTENIMIENTO',estatus:'PENDIENTE_VALIDACION'},transaction}))throw fail('Hay un comprobante de mantenimiento pendiente; espera su revisión');
 const ctx=monto==null?calc.contextoCuotas(data.cuotas,fecha,data.tarifa,data.exencionesRecargo):calc.planificar(data.cuotas,fecha,monto,data.tarifa,data.exencionesRecargo);
 return ctx;
}
async function confirmar(pago,transaction){
 // El lock de vivienda también serializa pagos manuales y dos cuentas de una casa.
 const data=await cargar(pago.casaId,transaction);
 const referenciaBanco=value=>pago.identificadoresVerificados?.tipo==='referencia'
  ? idsBanco.referencia(value) : String(value||'').trim().toUpperCase();
 const referencia=referenciaBanco(pago.folioOperacion);
 // El historial de referencias se consulta para impedir reutilización; no calcula deuda.
 const referencias=referencia?await Cuota.findAll({where:{casaId:pago.casaId,montoPagado:{[Op.gt]:0}},attributes:['referencia'],transaction}):[];
 if(referencia&&referencias.some(c=>referenciaBanco(c.referencia)===referencia))
  throw fail('La referencia bancaria ya está acreditada en cuotas; requiere conciliación para evitar duplicarla');
 const guardado=pago.aplicacionCuotas;
 if(!guardado||![1,2].includes(guardado.version))throw fail('Comprobante anterior a la unificación: requiere conciliación de sus mensualidades; no se acreditó ni se envió al C3');
 if(guardado.aplicado)throw fail('Este comprobante ya tiene sus cuotas acreditadas');
 const plan=calc.planificar(data.cuotas,guardado.fechaCalculo,pago.monto,data.tarifa,data.exencionesRecargo);
 if(plan.huella!==guardado.huella||plan.recargo!==guardado.recargo||plan.fechaFinalObjetivo!==guardado.fechaFinalObjetivo||
  JSON.stringify(plan.aplicaciones)!==JSON.stringify(guardado.aplicaciones))
  throw fail('Las cuotas o tarifa cambiaron desde el reporte. Requiere conciliar el comprobante antes de acreditarlo');
 const now=new Date();
 for(const p of plan.aplicaciones){
  const old=data.rows.find(r=>Number(r.anio)===p.anio&&r.mes===p.mes);
  const values={montoCuota:p.total/100,recargo:p.recargo/100,recargoPagado:p.recargoPagado/100,
   montoPagado:(p.antesPagado+p.abono)/100,saldoPendiente:(p.total-p.antesPagado-p.abono)/100,
   estatusPago:p.total===p.antesPagado+p.abono?'PAGADO':'PAGO_PARCIAL',
   fechaPago:pago.fechaOperacion,fechaConfirmacion:now,formaPago:'TRANSFERENCIA',actualizadoEn:now};
  if(!old||!p.antesPagado){values.referencia=pago.folioOperacion;if(!old?.origenImportacion)values.origenImportacion='PAGO_BANCARIO_CUOTAS';}
  if(old)await old.update(values,{transaction});
  else await Cuota.create({...values,casaId:pago.casaId,anio:p.anio,mes:p.mes,tipoPago:'MANTENIMIENTO',
   nombrePagador:pago.nombreReportante,calleSnapshot:data.casa.calle,numeroCasaSnapshot:data.casa.numero,creadoEn:now},{transaction});
 }
 const aplicado={...plan,aplicado:true,fechaAplicacion:now.toISOString()};
 await pago.update({recargo:plan.recargo,aplicacionCuotas:aplicado},{transaction});
 // Un evento financiero guarda el reparto; solo una vigencia nueva solicita TCP.
 const cambia=plan.fechaFinalObjetivo&&plan.fechaFinalObjetivo!==plan.fechaFinalCuotas;
 const tags=cambia?await Tags.findAll({where:{casaId:pago.casaId},order:[['id','ASC']],transaction}):[];
 const estado=!cambia?'COMPLETADO':tags.length?'PENDIENTE':'SIN_TAGS';
 const clave=pago.casaId+':'+createHash('sha256').update('PAGO_CUOTAS:'+pago.id).digest('hex');
 const event=await Eventos.create({casaId:pago.casaId,claveMovimiento:clave,origen:'PAGO_CUOTAS',origenId:pago.id,
  referencia:pago.folioOperacion,montoOrigen:pago.monto,recargoOrigen:plan.recargo,
  principalMovimiento:Math.round((pago.monto-plan.recargo)*100),principalAplicado:Math.round((pago.monto-plan.recargo)*100),
  meses:plan.meses,saldoAntes:Math.round(plan.saldoParcial*100),saldoDespues:Math.round(plan.saldoDespues*100),
  fechaObjetivo:cambia?plan.fechaFinalObjetivo:null,usuarioId:pago.usuarioId,estado},{transaction});
 for(const tag of tags)await Aplicaciones.create({pagoAccesoId:event.id,tarjetaId:tag.id,numeroTarjeta:tag.numeroTarjeta},{transaction});
 if(estado==='PENDIENTE')transaction.afterCommit(()=>require('./zkteco-vigencias.service').solicitar(pago.casaId));
 return {fuente:'CUOTAS',meses:plan.meses,fechaFinal:plan.fechaFinalObjetivo,saldoParcial:plan.saldoDespues,
  sincronizacion:estado,pagoAccesoId:event.id,sinTags:estado==='SIN_TAGS'};
}
// Compatibilidad con la captura administrativa de una cuota concreta. Nunca
// deriva meses de dinero acumulado ni de la fecha física de un TAG.
async function registrarCambioCuota(casaId,usuarioId,transaction,{registro,anterior}){
 const data=await cargar(casaId,transaction);
 if(calc.pagada(anterior)&&calc.indice(registro)!==calc.indice(anterior))
  throw fail('No puedes mover el periodo de una cuota ya pagada; requiere conciliación');
 if(String(registro.tipoPago||'MANTENIMIENTO').toUpperCase()!=='MANTENIMIENTO')return {fuente:'CUOTAS',sincronizacion:'SIN_AVANCE',meses:0};
 const previo=await Cuota.findOne({where:{casaId,id:{[Op.ne]:registro.id},estatusPago:'PAGADO',montoPagado:{[Op.gt]:0}},
  transaction,lock:transaction.LOCK.UPDATE,order:[['anio','DESC'],['mes','DESC']]});
 if(calc.pagada(registro)&&!calc.pagada(anterior)){
  if(Math.round((Number(registro.montoPagado)-Number(registro.recargo||0))*100)!==data.tarifa*100)
   throw fail('Una mensualidad completa debe cubrir su tarifa más recargo; registra abonos o varios meses en el flujo de pagos');
  const exenciones=await Cuota.findAll({where:{casaId,estatusPago:{[Op.in]:['CONDONADO','CANCELADO']}},transaction});
  const siguiente=calc.primerPendiente([previo,...exenciones].filter(Boolean));
  if(calc.indice(registro)!==siguiente)
   throw fail('Solo puedes acreditar la siguiente mensualidad después del último corte: '+calc.periodo(siguiente));
 }
 const antes=[previo,anterior].filter(Boolean);
 const fechaAnterior=calc.fechaDesdeCuotas(antes),fechaObjetivo=calc.fechaDesdeCuotas(data.cuotas);
 if(!fechaObjetivo||fechaObjetivo<=String(fechaAnterior||''))return {fuente:'CUOTAS',sincronizacion:'SIN_AVANCE',meses:0};
 const claveMovimiento=casaId+':'+createHash('sha256').update('CUOTA_SQL:'+registro.id+':'+fechaObjetivo).digest('hex');
 if(await Eventos.findOne({where:{claveMovimiento},transaction}))return {fuente:'CUOTAS',sincronizacion:'SIN_AVANCE',meses:0};
 const tags=await Tags.findAll({where:{casaId},order:[['id','ASC']],transaction});
 const estado=tags.length?'PENDIENTE':'SIN_TAGS';
 const origen=fechaAnterior||'2026-09-10';
 const meses=(Number(fechaObjetivo.slice(0,4))-Number(origen.slice(0,4)))*12+Number(fechaObjetivo.slice(5,7))-Number(origen.slice(5,7));
 const event=await Eventos.create({casaId,claveMovimiento,origen:'CUOTA_SQL',origenId:registro.id,
  referencia:registro.referencia,montoOrigen:registro.montoPagado,recargoOrigen:registro.recargo||0,
  principalMovimiento:Math.max(0,Math.round((Number(registro.montoPagado)-Number(registro.recargo||0))*100)),
  principalAplicado:0,meses,saldoAntes:0,saldoDespues:0,fechaObjetivo,usuarioId,estado},{transaction});
 for(const tag of tags)await Aplicaciones.create({pagoAccesoId:event.id,tarjetaId:tag.id,numeroTarjeta:tag.numeroTarjeta},{transaction});
 if(tags.length)transaction.afterCommit(()=>require('./zkteco-vigencias.service').solicitar(casaId));
 return {fuente:'CUOTAS',sincronizacion:estado,meses,fechaFinal:fechaObjetivo};
}
module.exports={cargar,cotizar,confirmar,registrarCambioCuota};
