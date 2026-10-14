'use strict';
const sequelize=require('../config/database');
const {Casa,Cuota,ZkTarjeta}=require('../models');
const vigenciaService=require('../services/vigencia-mantenimiento.service');
const {prepararPlan,generarReferencia}=require('../services/pago-manual-analisis.service');

const fail=(status,message)=>Object.assign(new Error(message),{status});
async function registrarPagoVivienda(req,res){
  try{
    const casaId=Number(req.body?.casaId);
    if(!Number.isSafeInteger(casaId)||casaId<1)throw fail(400,'Vivienda inválida');
    const plan=prepararPlan(req.body||{});
    const formaPago=String(req.body?.formaPago||'EFECTIVO').toUpperCase();
    if(!['EFECTIVO','TRANSFERENCIA','DEPOSITO','OTRO'].includes(formaPago))
      throw fail(400,'Selecciona una forma de pago válida');
    const referencia=generarReferencia(plan.fechaFinObjetivo);
    const resultado=await sequelize.transaction({isolationLevel:'READ COMMITTED'},async transaction=>{
      const casa=await Casa.findByPk(casaId,{transaction,lock:transaction.LOCK.UPDATE});
      if(!casa)throw fail(404,'La vivienda no existe');
      // Primero comprobar TODO el rango: si algún período está pagado/parcial
      // o pertenece a un movimiento bancario, abortar sin modificar nada.
      const cuotas=[];
      for(const periodo of plan.periodos){
        const cuota=await Cuota.findOne({where:{casaId,anio:periodo.anio,mes:periodo.mes},
          transaction,lock:transaction.LOCK.UPDATE});
        if(cuota && (cuota.estatusPago!=='PENDIENTE'||
          Number(cuota.montoPagado||0)>0||cuota.referencia||cuota.folio)){
          throw fail(409,'La vivienda ya tiene un pago o movimiento reservado para '+periodo.mes+' '+periodo.anio+'. No se duplicó ningún cobro');
        }
        cuotas.push({periodo,cuota});
      }
      // El mismo ID de movimiento conecta el grupo sin sumar el mismo dinero
      // varias veces: vigenciaService usa marca alta de principal + outbox C3.
      const eventos=[];
      for(const {periodo,cuota} of cuotas){
        const valores={
          casaId,anio:periodo.anio,mes:periodo.mes,fechaPago:new Date(),
          montoCuota:plan.importeMes,montoPagado:plan.importeMes,
          recargo:plan.recargo,saldoPendiente:0,estatusPago:'PAGADO',
          tipoPago:'MANTENIMIENTO',formaPago,referencia,
          confirmadoPorUsuarioId:req.usuario.usuarioId,fechaConfirmacion:new Date(),
          origenImportacion:'MANUAL_ANALISIS',observaciones:'Confirmado en Análisis de cuotas; '+plan.meses+' mensualidad(es)',
          nombrePagador:casa.nombre||null,
          numeroCasaSnapshot:casa.numero,calleSnapshot:casa.calle
        };
        let guardada;
        if(cuota){await cuota.update(valores,{transaction});guardada=cuota;}
        else guardada=await Cuota.create(valores,{transaction});
        eventos.push(await vigenciaService.actualizar(casaId,req.usuario.usuarioId,transaction,{
          origen:'CUOTA',registro:guardada
        }));
      }
      return {casaId,calle:casa.calleCorrecta||casa.calle,numero:casa.numero,
        referencia,periodos:plan.periodos.map(p=>p.mes+' '+p.anio),
        fechaFinObjetivo:plan.fechaFinObjetivo,meses:plan.meses,total:plan.total,
        eventos: eventos.map(e=>({sincronizacion:e.sincronizacion,meses:e.meses,pagoAccesoId:e.pagoAccesoId||null}))};
    });
    const tags=await ZkTarjeta.count({where:{casaId}});
    return res.status(201).json({ok:true,data:{...resultado,tags},
      message:tags?'Pago registrado. Sincronización ZKTeco solicitada; confirma el resultado antes de asumir que los TAGs se actualizaron.':
        'Pago registrado. La casa no tiene TAGs asociados; no se modificó el C3.'});
  }catch(error){
    if(!error.status)console.error('[finanzas pago vivienda]',error);
    return res.status(error.status||503).json({ok:false,message:error.status?error.message:'No fue posible registrar el pago de la vivienda'});
  }
}
async function estadoPagoVivienda(req,res){
  try{
    const casaId=Number(req.params.casaId);
    if(!Number.isSafeInteger(casaId)||casaId<1)throw fail(400,'Vivienda inválida');
    if(!await Casa.findByPk(casaId,{attributes:['id']}))throw fail(404,'Vivienda no encontrada');
    const vigencia=await vigenciaService.estadoCasa(casaId);
    res.setHeader('Cache-Control','no-store');
    return res.json({ok:true,data:{
      fechaFinal:vigencia.fechaFinal,
      fechasTags:vigencia.fechasTags,
      sincronizacion:vigencia.sincronizacion,
      errorSincronizacion:vigencia.errorSincronizacion,
      tags:vigencia.fechasTags.length
    }});
  }catch(error){
    if(!error.status)console.error('[finanzas estado ZKTeco]',error);
    return res.status(error.status||503).json({ok:false,message:error.status?error.message:'No fue posible consultar las vigencias'});
  }
}
module.exports={registrarPagoVivienda,estadoPagoVivienda};
