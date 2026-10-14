'use strict';
const sequelize=require('../config/database');
const {Casa,Cuota,ZkTarjeta}=require('../models');
const vigenciaService=require('../services/vigencia-mantenimiento.service');
const {prepararDesdeHistorial,generarReferencia}=require('../services/pago-manual-analisis.service');
const {clasificarCuotaParaPago}=require('../services/cuota-pendiente-historica.service');
const fail=(status,message)=>Object.assign(new Error(message),{status});

function evaluarPeriodos(plan,cuotas){
  const mapa=new Map(cuotas.map(c=>[c.anio+':'+String(c.mes).toUpperCase(),c]));
  return plan.periodos.map(periodo=>{
    const cuota=mapa.get(periodo.anio+':'+periodo.mes)||null;
    const revision=clasificarCuotaParaPago(cuota);
    return {periodo,cuota,revision};
  });
}
function resumirCotizacion(plan, evaluadas){
  return {
    ultimoMesPagado:plan.ultimoMesPagado?
      {mes:plan.ultimoMesPagado.nombre,anio:plan.ultimoMesPagado.anio,fechaPago:plan.ultimoMesPagado.fechaPago}:null,
    desde:plan.desde,hasta:plan.hasta,meses:plan.meses,
    montoSugerido:plan.montoSugerido,total:plan.total,recargo:plan.recargo,
    fechaFinObjetivo:plan.fechaFinObjetivo,
    periodos:evaluadas.map(({periodo,revision})=>({
      anio:periodo.anio,mes:periodo.mes,
      registrable:revision.registrable,requiereRevision:Boolean(revision.requiereRevision),
      advertencia:revision.advertencia||null,motivo:revision.motivo||null,
      tipoReferencia:revision.referenciaAnterior?.startsWith('HIST-')?'HIST':revision.referenciaAnterior?'OTRA':'NINGUNA'
    })),
    bloqueado:evaluadas.some(r=>!r.revision.registrable),
    requiereRevision:evaluadas.some(r=>r.revision.requiereRevision)
  };
}
async function cotizarPagoVivienda(req,res){
  try{
    const casaId=Number(req.params.casaId);
    if(!Number.isSafeInteger(casaId)||casaId<1)throw fail(400,'Vivienda inválida');
    const casa=await Casa.findByPk(casaId,{attributes:['id','calle','calleCorrecta','numero']});
    if(!casa)throw fail(404,'Vivienda no encontrada');
    const cuotas=await Cuota.findAll({where:{casaId}});
    const plan=prepararDesdeHistorial({cuotas,anio:req.query.anio,mes:req.query.mes});
    res.setHeader('Cache-Control','no-store');
    return res.json({ok:true,data:{casaId,calle:casa.calleCorrecta||casa.calle,numero:casa.numero,
      ...resumirCotizacion(plan,evaluarPeriodos(plan,cuotas))}});
  }catch(error){
    if(!error.status)console.error('[finanzas cotizar]',error);
    return res.status(error.status||503).json({ok:false,message:error.status?error.message:'No fue posible consultar el historial de esta vivienda'});
  }
}
async function registrarPagoVivienda(req,res){
  try{
    const casaId=Number(req.body?.casaId);
    if(!Number.isSafeInteger(casaId)||casaId<1)throw fail(400,'Vivienda inválida');
    const formaPago=String(req.body?.formaPago||'EFECTIVO').toUpperCase();
    if(!['EFECTIVO','TRANSFERENCIA','DEPOSITO','OTRO'].includes(formaPago))
      throw fail(400,'Selecciona una forma de pago válida');
    const confirmarHistorico=req.body?.confirmarHistorico===true;
    const mesesEsperados=Number(req.body?.mesesEsperados);
    if(!Number.isInteger(mesesEsperados)||mesesEsperados<1)
      throw fail(400,'Vuelve a consultar los meses pendientes antes de confirmar');
    const resultado=await sequelize.transaction({isolationLevel:'READ COMMITTED'},async transaction=>{
      // Un lock de vivienda serializa confirmaciones simultáneas incluso si
      // algunas cuotas todavía no existen en MySQL.
      const casa=await Casa.findByPk(casaId,{transaction,lock:transaction.LOCK.UPDATE});
      if(!casa)throw fail(404,'La vivienda no existe');
      const existentes=await Cuota.findAll({where:{casaId},transaction,lock:transaction.LOCK.UPDATE});
      const plan=prepararDesdeHistorial({cuotas:existentes,anio:req.body?.anio,mes:req.body?.mes,
        montoTotal:req.body?.montoTotal});
      if(mesesEsperados!==plan.meses)
        throw fail(409,'El historial de pagos cambió. Actualiza la cotización antes de confirmar.');
      const evaluadas=evaluarPeriodos(plan,existentes);
      for(const {periodo,revision} of evaluadas){
        if(!revision.registrable)
          throw fail(409,periodo.mes+' '+periodo.anio+': '+revision.motivo);
        if(revision.requiereRevision&&!confirmarHistorico)
          throw fail(409,periodo.mes+' '+periodo.anio+
            ': hay fechas históricas importadas. Marca la autorización de corrección y vuelve a confirmar.');
      }
      const tarjetas=await ZkTarjeta.findAll({where:{casaId},transaction});
      if(tarjetas.some(t=>t.fechaFin && /^\d{4}-\d{2}-\d{2}$/.test(String(t.fechaFin)) &&
           String(t.fechaFin)>plan.fechaFinObjetivo))
        throw fail(409,'Un TAG ya tiene vigencia posterior al corte '+plan.fechaFinObjetivo+
          '. No se registró ningún cobro; revisa la selección.');
      const referencia=generarReferencia(plan.fechaFinObjetivo);
      const guardadas=[];
      for(const {periodo,cuota,revision} of evaluadas){
        const observacionesAnteriores=String(cuota?.observaciones||'').trim();
        const auditoria='Confirmado manualmente por usuario '+req.usuario.usuarioId+
          '; pago de '+plan.meses+' mensualidad(es); '+
          (revision.referenciaAnterior?'referencia histórica previa: '+revision.referenciaAnterior+'; ':'')+
          (revision.requiereRevision?'corrección histórica autorizada; fechaPago anterior: '+
            (cuota?.fechaPago||'ninguna')+'; fechaConfirmacion anterior: '+(cuota?.fechaConfirmacion||'ninguna')+'; ':'')+
          'importe del movimiento: $'+plan.total.toFixed(2);
        const valores={
          casaId,anio:periodo.anio,mes:periodo.mes,fechaPago:new Date(),
          montoCuota:periodo.montoCuota,montoPagado:periodo.montoCuota,
          recargo:periodo.recargo,saldoPendiente:0,estatusPago:'PAGADO',
          tipoPago:'MANTENIMIENTO',formaPago,referencia,
          confirmadoPorUsuarioId:req.usuario.usuarioId,fechaConfirmacion:new Date(),
          origenImportacion:'MANUAL_ANALISIS',
          observaciones:(observacionesAnteriores?observacionesAnteriores+'\n':'')+auditoria,
          nombrePagador:casa.nombre||null,numeroCasaSnapshot:casa.numero,calleSnapshot:casa.calle
        };
        if(cuota){await cuota.update(valores,{transaction});guardadas.push(cuota);}
        else guardadas.push(await Cuota.create(valores,{transaction}));
      }
      // Un evento por cobro/lote y por vivienda, no un evento por mensualidad.
      const evento=await vigenciaService.registrarLoteManual(casaId,req.usuario.usuarioId,transaction,{
        referencia,origenId:guardadas[0].id,total:plan.total,recargo:plan.recargo,meses:plan.meses
      });
      return {casaId,calle:casa.calleCorrecta||casa.calle,numero:casa.numero,referencia,
        periodos:plan.periodos.map(p=>p.mes+' '+p.anio),fechaFinObjetivo:plan.fechaFinObjetivo,
        meses:plan.meses,total:plan.total,recargo:plan.recargo,eventos:[evento],tags:tarjetas.length};
    });
    return res.status(201).json({ok:true,data:resultado,message:resultado.tags?
      'Pago registrado en MySQL. Sincronización del C3 solicitada; revisa las fechas de todos los TAGs.':
      'Pago registrado. Esta vivienda no tiene TAGs asociados; no hubo actualización física.'});
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
      fechaFinal:vigencia.fechaFinal,fechasTags:vigencia.fechasTags,
      sincronizacion:vigencia.sincronizacion,
      errorSincronizacion:vigencia.errorSincronizacion,tags:vigencia.fechasTags.length
    }});
  }catch(error){
    if(!error.status)console.error('[finanzas estado ZKTeco]',error);
    return res.status(error.status||503).json({ok:false,message:error.status?error.message:'No fue posible consultar las vigencias'});
  }
}
module.exports={registrarPagoVivienda,estadoPagoVivienda,cotizarPagoVivienda};
