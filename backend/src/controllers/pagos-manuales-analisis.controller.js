'use strict';
const sequelize=require('../config/database');
const {Op}=require('sequelize');
const {Casa,Cuota,ZkTarjeta,PagoReportado}=require('../models');
const {CargoExtraordinario,PagoManualConcepto}=require('../models');
const Reserva=require('../models/ReservaCasaClub');
const {estadoCargos}=require('../services/cargos-extraordinarios.service');
const {randomUUID}=require('crypto');
const PagoAcceso=require('../models/PagoAccesoC3');
const vigenciaService=require('../services/vigencia-mantenimiento.service');
const {prepararDesdeHistorial,generarReferencia}=require('../services/pago-manual-analisis.service');
const {clasificarCuotaParaPago}=require('../services/cuota-pendiente-historica.service');
const {calcularAdeudoVivienda}=require('../services/adeudo-vivienda-analisis.service');
const {historialMantenimiento,historialConcepto}=require('../services/historial-pagos-vivienda.service');
const {fechaMexico}=require('../services/vigencia-calculo');
const {tarifaParaCasa}=require('../services/tarifa-mantenimiento.service');
const {conciliacionesTarifa,historialConTarifaConciliada}=require('../services/conciliacion-tarifa-individual.service');
const fail=(status,message)=>Object.assign(new Error(message),{status});

function evaluarPeriodos(plan,cuotas){
  const mapa=new Map(cuotas.map(c=>[c.anio+':'+String(c.mes).toUpperCase(),c]));
  return plan.periodos.map(periodo=>{
    const cuota=mapa.get(periodo.anio+':'+periodo.mes)||null;
    const revision=clasificarCuotaParaPago(cuota);
    return {periodo,cuota,revision};
  });
}
async function comprobarReferenciasVinculadas(casaId,evaluadas,transaction){
  const refs=[...new Set(evaluadas.flatMap(({cuota})=>
    [cuota?.referencia,cuota?.folio].map(x=>String(x||'').trim()).filter(Boolean)))];
  const ids=evaluadas.map(({cuota})=>cuota?.id).filter(Boolean);
  const [bancos,eventos]=await Promise.all([
    refs.length?PagoReportado.findAll({
      where:{casaId,[Op.or]:[{folioOperacion:{[Op.in]:refs}},{folioReporte:{[Op.in]:refs}}]},
      attributes:['folioOperacion','folioReporte','estatus'],...(transaction?{transaction}:{})
    }):[],
    refs.length||ids.length?PagoAcceso.findAll({
      where:{casaId,[Op.or]:[
        ...(refs.length?[{referencia:{[Op.in]:refs}}]:[]),
        ...(ids.length?[{origen:'CUOTA',origenId:{[Op.in]:ids}}]:[])
      ]},
      attributes:['referencia','origen','origenId','estado'],...(transaction?{transaction}:{})
    }):[]
  ]);
  const refsBanco=new Set(bancos.flatMap(p=>[String(p.folioOperacion),String(p.folioReporte)]));
  const refsC3=new Set(eventos.map(e=>String(e.referencia||'')).filter(Boolean));
  const idsC3=new Set(eventos.filter(e=>e.origen==='CUOTA').map(e=>String(e.origenId)));
  for(const {cuota,revision} of evaluadas){
    if(!cuota)continue;
    if(idsC3.has(String(cuota.id))||
      [cuota.referencia,cuota.folio].some(x=>refsBanco.has(String(x||''))||refsC3.has(String(x||'')))){
      revision.registrable=false;
      revision.requiereRevision=false;
      revision.motivo='Existe un movimiento de pago asociado en pagos_reportados o pagos_acceso_c3. Revisa la conciliación; no se creará otro cobro ni otra orden al C3.';
    }
  }
}

function resumirCotizacion(plan, evaluadas, conciliaciones=[]){
  return {
    ultimoMesPagado:plan.ultimoMesPagado?
      {mes:plan.ultimoMesPagado.nombre,anio:plan.ultimoMesPagado.anio,fechaPago:plan.ultimoMesPagado.fechaPago}:null,
    desde:plan.desde,hasta:plan.hasta,meses:plan.meses,
    montoSugerido:plan.montoSugerido,total:plan.total,recargo:plan.recargo,
    tarifaMensual:plan.tarifaMensual,montoMinimo:plan.montoMinimo,montoMaximo:plan.montoMaximo,
    fechaFinObjetivo:plan.fechaFinObjetivo,
    conciliacionesTarifa:conciliaciones,
    requiereConciliacionTarifa:conciliaciones.length>0,
    periodos:evaluadas.map(({periodo,revision})=>({
      anio:periodo.anio,mes:periodo.mes,
      registrable:revision.registrable,requiereRevision:Boolean(revision.requiereRevision),
      advertencia:revision.advertencia||null,motivo:revision.motivo||null,
      tipoReferencia:revision.folioAnterior||revision.referenciaAnterior?.startsWith('HIST-')?'HIST':revision.referenciaAnterior?'OTRA':'NINGUNA'
    })),
    bloqueado:evaluadas.some(r=>!r.revision.registrable),
    requiereRevision:evaluadas.some(r=>r.revision.requiereRevision)
  };
}
async function cotizarPagoVivienda(req,res){
  try{
    const casaId=Number(req.params.casaId);
    if(!Number.isSafeInteger(casaId)||casaId<1)throw fail(400,'Vivienda inválida');
    const casa=await Casa.findByPk(casaId,{attributes:['id','calle','calleCorrecta','numero','cuotaPorCobrar']});
    if(!casa)throw fail(404,'Vivienda no encontrada');
    const cuotas=await Cuota.findAll({where:{casaId}});
    const tarifa=tarifaParaCasa(casa);
    const conciliaciones=conciliacionesTarifa(cuotas,tarifa,{anioHasta:req.query.anio,mesHasta:req.query.mes});
    const plan=prepararDesdeHistorial({
      cuotas:historialConTarifaConciliada(cuotas,conciliaciones),
      anio:req.query.anio,mes:req.query.mes,tarifa
    });
    const evaluadas=evaluarPeriodos(plan,cuotas);
    await comprobarReferenciasVinculadas(casaId,evaluadas);
    res.setHeader('Cache-Control','no-store');
    return res.json({ok:true,data:{casaId,calle:casa.calleCorrecta||casa.calle,numero:casa.numero,
      ...resumirCotizacion(plan,evaluadas,conciliaciones)}});
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
    const pagoAnual=req.body?.pagoAnual===true;
    if(req.body?.pagoAnual!==undefined&&typeof req.body.pagoAnual!=='boolean')
      throw fail(400,'Indicador de pago anual inválido');
    if(pagoAnual&&(Number(req.body?.anio)!==Number(fechaMexico().slice(0,4))||Number(req.body?.mes)!==12))
      throw fail(400,'Pago anual solo puede liquidar hasta diciembre del año actual');
    const confirmarHistorico=req.body?.confirmarHistorico===true;
    const confirmarConciliacionTarifa=req.body?.confirmarConciliacionTarifa===true;
    const mesesEsperados=Number(req.body?.mesesEsperados);
    if(!Number.isInteger(mesesEsperados)||mesesEsperados<1)
      throw fail(400,'Vuelve a consultar los meses pendientes antes de confirmar');
    const resultado=await sequelize.transaction({isolationLevel:'READ COMMITTED'},async transaction=>{
      // Un lock de vivienda serializa confirmaciones simultáneas incluso si
      // algunas cuotas todavía no existen en MySQL.
      const casa=await Casa.findByPk(casaId,{transaction,lock:transaction.LOCK.UPDATE});
      if(!casa)throw fail(404,'La vivienda no existe');
      const existentes=await Cuota.findAll({where:{casaId},transaction,lock:transaction.LOCK.UPDATE});
      const tarifa=tarifaParaCasa(casa);
      const conciliaciones=conciliacionesTarifa(existentes,tarifa,{anioHasta:req.body?.anio,mesHasta:req.body?.mes});
      const plan=prepararDesdeHistorial({
        cuotas:historialConTarifaConciliada(existentes,conciliaciones),
        anio:req.body?.anio,mes:req.body?.mes,
        montoTotal:req.body?.montoTotal,tarifa
      });
      if(conciliaciones.length&&!confirmarConciliacionTarifa)
        throw fail(409,'Confirma la conciliación de los abonos históricos que cubren íntegramente la tarifa especial. No se registrará otro cobro por esos meses.');
      if(mesesEsperados!==plan.meses)
        throw fail(409,'El historial de pagos cambió. Actualiza la cotización antes de confirmar.');
      const evaluadas=evaluarPeriodos(plan,existentes);
      await comprobarReferenciasVinculadas(casaId,evaluadas,transaction);
      for(const {periodo,revision} of evaluadas){
        if(!revision.registrable)
          throw fail(409,periodo.mes+' '+periodo.anio+': '+revision.motivo);
        if(revision.requiereRevision&&!confirmarHistorico)
          throw fail(409,periodo.mes+' '+periodo.anio+
            ': existen referencias o datos históricos por conciliar. Confirma la revisión en el formulario antes de registrar.');
      }
      const tarjetas=await ZkTarjeta.findAll({where:{casaId},transaction});
      if(tarjetas.some(t=>t.fechaFin && /^\d{4}-\d{2}-\d{2}$/.test(String(t.fechaFin)) &&
           String(t.fechaFin)>plan.fechaFinObjetivo))
        throw fail(409,'Un TAG ya tiene vigencia posterior al corte '+plan.fechaFinObjetivo+
          '. No se registró ningún cobro; revisa la selección.');
      // Conciliación autorizada y atómica: sin nuevo pago para los períodos
      // ya abonados. Preservar montos, fechas, folios y eventos C3 originales.
      for(const ajuste of conciliaciones){
        const original=existentes.find(c=>Number(c.id)===ajuste.id);
        if(!original)throw fail(409,'El historial cambió. Actualiza la cotización.');
        const audit='Conciliación explícita por usuario '+req.usuario.usuarioId+
          ': abono de $'+ajuste.montoPagado+' del '+ajuste.fechaPago+
          ' cubre '+ajuste.mes+' '+ajuste.anio+
          ' con tarifa $'+tarifa+'. Conservados importe, referencia y fecha originales.';
        await original.update({
          estatusPago:'PAGADO',montoCuota:tarifa,saldoPendiente:0,
          observaciones:[original.observaciones,audit].filter(Boolean).join('\n'),
          actualizadoEn:new Date()
        },{transaction});
      }
      const referencia=generarReferencia(plan.fechaFinObjetivo);
      const guardadas=[];
      for(const {periodo,cuota,revision} of evaluadas){
        const observacionesAnteriores=String(cuota?.observaciones||'').trim();
        const auditoria='Confirmado manualmente por usuario '+req.usuario.usuarioId+
          '; pago de '+plan.meses+' mensualidad(es); '+
          (pagoAnual?'cierre anual '+req.body.anio+' (solo periodos todavía pendientes); ':'')+
          (revision.referenciaAnterior?'referencia histórica previa: '+revision.referenciaAnterior+'; ':'')+
          (revision.folioAnterior?'folio histórico previo: '+revision.folioAnterior+'; ':'')+
          (revision.requiereRevision?'conciliación administrativa de datos anteriores autorizada; fechaPago anterior: '+
            (cuota?.fechaPago||'ninguna')+'; fechaConfirmacion anterior: '+(cuota?.fechaConfirmacion||'ninguna')+'; ':'')+
          'importe del movimiento: $'+plan.total.toFixed(2);
        const valores={
          casaId,anio:periodo.anio,mes:periodo.mes,fechaPago:new Date(),
          montoCuota:periodo.montoCuota,montoPagado:periodo.montoCuota,
          recargo:periodo.recargo,saldoPendiente:0,estatusPago:'PAGADO',
          tipoPago:'MANTENIMIENTO',formaPago,referencia,folio:null,
          confirmadoPorUsuarioId:req.usuario.usuarioId,fechaConfirmacion:new Date(),
          origenImportacion:pagoAnual?'MANUAL_ANALISIS_ANUAL':'MANUAL_ANALISIS',
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
        meses:plan.meses,total:plan.total,recargo:plan.recargo,pagoAnual,
        conciliacionesTarifa:conciliaciones.map(c=>c.mes+' '+c.anio),eventos:[evento],tags:tarjetas.length};
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
async function historialPagoVivienda(req,res){
 try{
  const casaId=Number(req.params.casaId);
  const tipo=String(req.query.concepto||'MANTENIMIENTO').toUpperCase();
  if(!Number.isSafeInteger(casaId)||casaId<1)throw fail(400,'Vivienda inválida');
  if(!['MANTENIMIENTO','EXTRAORDINARIO','CASA_CLUB'].includes(tipo))throw fail(400,'Concepto inválido');
  const casa=await Casa.findByPk(casaId,{attributes:['id','calle','calleCorrecta','numero','nombre','cuotaPorCobrar']});
  if(!casa)throw fail(404,'Vivienda no encontrada');
  let movimientos=[],deudas=[];
  if(tipo==='MANTENIMIENTO'){
   const [cuotas,comprobantes]=await Promise.all([
    Cuota.findAll({where:{casaId},attributes:['id','anio','mes','montoPagado','estatusPago','recargo','referencia','folio','fechaPago','fechaConfirmacion','formaPago','origenImportacion','montoCuota','saldoPendiente']}),
    PagoReportado.findAll({where:{casaId,tipoPago:tipo,estatus:'VALIDADO'},attributes:['id','tipoPago','estatus','monto','recargo','folioReporte','folioOperacion','fechaOperacion']})
   ]);
   movimientos=historialMantenimiento(cuotas,comprobantes);
   const hoy=fechaMexico();
   deudas=calcularAdeudoVivienda(cuotas,{anio:Number(hoy.slice(0,4)),mes:Number(hoy.slice(5,7)),hoy,tarifa:tarifaParaCasa(casa)}).detalles;
  }else{
   const [reportados,manuales]=await Promise.all([
    PagoReportado.findAll({where:{casaId,tipoPago:tipo,estatus:'VALIDADO'},attributes:['id','tipoPago','estatus','monto','recargo','folioReporte','folioOperacion','fechaOperacion']}),
    PagoManualConcepto.findAll({where:{casaId,tipoPago:tipo},attributes:['id','tipoPago','monto','formaPago','referencia','creadoEn']})
   ]);
   movimientos=historialConcepto(tipo,reportados,manuales);
   if(tipo==='EXTRAORDINARIO'){
    const cargos=await estadoCargos(casaId);
    deudas=cargos.filter(c=>c.estado!=='PAGADO').map(c=>({categoria:tipo,periodo:c.periodo,concepto:c.concepto,monto:c.monto,estado:c.estado}));
   }else{
    const reservas=await Reserva.findAll({where:{casaId,estatus:'APROBADA',pagado:false},attributes:['fecha','cuotaRecuperacion','depositoGarantia','limpieza']});
    deudas=reservas.map(r=>({categoria:tipo,periodo:r.fecha,concepto:'Reserva de casa club',monto:Number(r.cuotaRecuperacion||0)+Number(r.depositoGarantia||0)+Number(r.limpieza||0)}));
   }
  }
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,data:{casaId,calle:casa.calleCorrecta||casa.calle,numero:casa.numero,nombre:casa.nombre,tipoPago:tipo,
   movimientos,deudas,saldoPendiente:Math.round(deudas.reduce((sum,d)=>sum+Number(d.monto||0),0)*100)/100}});
 }catch(error){
  if(!error.status)console.error('[finanzas historial vivienda]',error);
  return res.status(error.status||503).json({ok:false,message:error.status?error.message:'No fue posible obtener el historial de pagos'});
 }
}
async function opcionesPagoConcepto(req,res){
 try{
  const casaId=Number(req.params.casaId);
  if(!Number.isSafeInteger(casaId)||casaId<1||!await Casa.findByPk(casaId))throw fail(404,'Vivienda no encontrada');
  const [cargos,reservas]=await Promise.all([
   estadoCargos(casaId),
   Reserva.findAll({where:{casaId,estatus:'APROBADA',pagado:false},attributes:['id','fecha','fechaLimitePago','cuotaRecuperacion','depositoGarantia','limpieza']})
  ]);
  const data={EXTRAORDINARIO:cargos.filter(c=>c.estado!=='PAGADO'),CASA_CLUB:reservas.map(r=>({id:r.id,periodo:r.fecha,
   monto:Number(r.cuotaRecuperacion)+Number(r.depositoGarantia)+Number(r.limpieza),concepto:'Casa club '+r.fecha,fechaLimitePago:r.fechaLimitePago}))};
  return res.json({ok:true,data});
 }catch(e){return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible consultar los conceptos pendientes'});}
}
async function registrarPagoConcepto(req,res){
 try{
  const casaId=Number(req.body?.casaId),tipo=String(req.body?.tipoPago||''),id=Number(req.body?.conceptoId),formaPago=String(req.body?.formaPago||'EFECTIVO').toUpperCase();
  if(!Number.isSafeInteger(casaId)||casaId<1||!Number.isSafeInteger(id)||id<1||!['EXTRAORDINARIO','CASA_CLUB'].includes(tipo)||!['EFECTIVO','TRANSFERENCIA','DEPOSITO','OTRO'].includes(formaPago))throw fail(400,'Concepto, vivienda o forma de pago inválidos');
  const data=await sequelize.transaction(async transaction=>{
   const casa=await Casa.findByPk(casaId,{transaction,lock:transaction.LOCK.UPDATE});
   if(!casa)throw fail(404,'Vivienda no encontrada');
   const cargo=tipo==='EXTRAORDINARIO'?await CargoExtraordinario.findOne({where:{id,casaId},transaction,lock:transaction.LOCK.UPDATE}):null;
   const reserva=tipo==='CASA_CLUB'?await Reserva.findOne({where:{id,casaId,estatus:'APROBADA',pagado:false},transaction,lock:transaction.LOCK.UPDATE}):null;
   if(tipo==='EXTRAORDINARIO'&&!cargo||tipo==='CASA_CLUB'&&!reserva)throw fail(409,'Este concepto ya no está pendiente');
   const where=tipo==='EXTRAORDINARIO'?{cargoExtraordinarioId:id}:{reservaCasaClubId:id};
   const [reportado,manual]=await Promise.all([
    PagoReportado.findOne({where:{...where,estatus:{[Op.in]:['PENDIENTE_VALIDACION','VALIDADO']}},transaction}),
    PagoManualConcepto.findOne({where,transaction})
   ]);
   if(reportado||manual)throw fail(409,'Ya existe un comprobante pendiente o pago confirmado para este concepto');
   const monto=tipo==='EXTRAORDINARIO'?Number(cargo.monto):Number(reserva.cuotaRecuperacion)+Number(reserva.depositoGarantia)+Number(reserva.limpieza);
   if(Math.round(Number(req.body.monto)*100)!==Math.round(monto*100))throw fail(409,'El importe debe coincidir con el cargo vigente: $'+monto.toFixed(2));
   const referencia='MJ'+(tipo==='CASA_CLUB'?'CLUB':'EXTRA')+':'+randomUUID();
   await PagoManualConcepto.create({casaId,tipoPago:tipo,cargoExtraordinarioId:cargo?.id||null,reservaCasaClubId:reserva?.id||null,
    monto,formaPago,referencia,registradoPor:req.usuario.usuarioId},{transaction});
   if(reserva)await reserva.update({pagado:true,fechaPago:new Date().toISOString().slice(0,10),folio:referencia,actualizadoEn:new Date()},{transaction});
   return {casaId,tipoPago:tipo,monto,referencia};
  });
  return res.status(201).json({ok:true,data,message:'Pago registrado sin modificar vigencias de TAGs ni C3'});
 }catch(e){if(!e.status)console.error('[pago manual concepto]',e);return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible registrar el pago'});}
}
module.exports={registrarPagoVivienda,estadoPagoVivienda,cotizarPagoVivienda,historialPagoVivienda,opcionesPagoConcepto,registrarPagoConcepto};
