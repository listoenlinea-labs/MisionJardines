'use strict';
const sequelize=require('../config/database');
const {Op}=require('sequelize');
const {Casa,Cuota,ZkTarjeta,PagoReportado}=require('../models');
const {CargoExtraordinario,PagoManualConcepto,AportacionExtraordinaria}=require('../models');
const Reserva=require('../models/ReservaCasaClub');
const {estadoCargos}=require('../services/cargos-extraordinarios.service');
const {consultarSaldoCargo}=require('../services/saldo-aportaciones-extraordinarias.service');
const {randomUUID}=require('crypto');
const PagoAcceso=require('../models/PagoAccesoC3');
const vigenciaService=require('../services/vigencia-mantenimiento.service');
const reversion=require('../services/reversion-pagos.service');
const {prepararDesdeHistorial,generarReferencia,validarPagoAnual}=require('../services/pago-manual-analisis.service');
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
      where:{casaId,tipoPago:'MANTENIMIENTO',[Op.or]:[{folioOperacion:{[Op.in]:refs}},{folioReporte:{[Op.in]:refs}}]},
      attributes:['id','folioOperacion','folioReporte','estatus','fechaOperacion'],...(transaction?{transaction}:{})
    }):[],
    refs.length||ids.length?PagoAcceso.findAll({
      where:{casaId,[Op.or]:[
        ...(refs.length?[{referencia:{[Op.in]:refs}}]:[]),
        ...(ids.length?[{origen:'CUOTA',origenId:{[Op.in]:ids}}]:[])
      ]},
      attributes:['id','referencia','origen','origenId','estado','fechaObjetivo'],...(transaction?{transaction}:{})
    }):[]
  ]);
  for(const {periodo,cuota,revision} of evaluadas){
    if(!cuota)continue;
    const refs=[cuota.referencia,cuota.folio].map(x=>String(x||'').trim()).filter(Boolean);
    const bank=bancos.filter(p=>refs.some(r=>String(p.folioOperacion||'').trim()===r||
     String(p.folioReporte||'').trim()===r));
    const c3=eventos.filter(e=>(e.origen==='CUOTA'&&Number(e.origenId)===Number(cuota.id))||
     refs.some(r=>String(e.referencia||'').trim()===r));
    if(!bank.length&&!c3.length)continue;
    const linked=[
     ...bank.map(p=>({tabla:'pagos_reportados',id:Number(p.id),estado:p.estatus,
      referencia:p.folioOperacion||p.folioReporte,fecha:p.fechaOperacion||null})),
     ...c3.map(e=>({tabla:'pagos_acceso_c3',id:Number(e.id),estado:e.estado,
      origen:e.origen,origenId:Number(e.origenId),referencia:e.referencia||null,
      fecha:e.fechaObjetivo||null}))
    ];
    revision.registrable=false;
    revision.requiereRevision=false;
    revision.vinculos=linked;
    revision.motivo='No se puede cobrar '+periodo.mes+' '+periodo.anio+
     ' porque hay un registro asociado: '+linked.map(x=>x.tabla+' #'+x.id+
      ' ('+x.estado+(x.origen?' · '+x.origen+' #'+x.origenId:'')+
      (x.referencia?' · referencia '+x.referencia:'')+')').join('; ')+
     '. Verifica estos registros para conciliarlos. Un TAG vigente no acredita el pago. No se generará cobro ni orden duplicada al C3.';
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
      advertencia:revision.advertencia||null,motivo:revision.motivo||null,vinculos:revision.vinculos||[],
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
    const casa=await Casa.findByPk(casaId,{attributes:['id','calle','calleCorrecta','numero','cuotaPorCobrar','exencionesRecargo']});
    if(!casa)throw fail(404,'Vivienda no encontrada');
    const cuotas=await Cuota.findAll({where:{casaId}});
    const tarifa=tarifaParaCasa(casa);
    const conciliaciones=conciliacionesTarifa(cuotas,tarifa,{anioHasta:req.query.anio,mesHasta:req.query.mes});
    const plan=prepararDesdeHistorial({
      cuotas:historialConTarifaConciliada(cuotas,conciliaciones),
      anio:req.query.anio,mes:req.query.mes,tarifa,exencionesRecargo:casa.exencionesRecargo||[]
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
    const pagoAnual=validarPagoAnual(req.body,{anioActual:Number(fechaMexico().slice(0,4))});
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
        montoTotal:req.body?.montoTotal,tarifa,exencionesRecargo:casa.exencionesRecargo||[]
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
      // El registro manual explícito define el corte de TODOS los TAGs,
      // aun si el espejo SQL contiene una fecha física posterior.
      // El worker valida el movimiento confirmado y la fecha real del C3,
      // sin relajar la validación de pertenencia, PIN ni autorizaciones.
      const referencia=generarReferencia(plan.fechaFinObjetivo);
      // Conciliación autorizada y atómica: sin nuevo pago para los períodos
      // ya abonados. Preservar montos, fechas, folios y eventos C3 originales.
      for(const ajuste of conciliaciones){
        const original=existentes.find(c=>Number(c.id)===ajuste.id);
        if(!original)throw fail(409,'El historial cambió. Actualiza la cotización.');
        const audit='Conciliación explícita por usuario '+req.usuario.usuarioId+
          ': abono de $'+ajuste.montoPagado+' del '+ajuste.fechaPago+
          ' cubre '+ajuste.mes+' '+ajuste.anio+
          ' con tarifa $'+tarifa+'. Conservados importe, referencia y fecha originales.';
        await reversion.guardarInstantanea(casaId,referencia,original,original.get({plain:true}),transaction);
        await original.update({
          estatusPago:'PAGADO',montoCuota:tarifa,saldoPendiente:0,
          observaciones:[original.observaciones,audit].filter(Boolean).join('\n'),
          actualizadoEn:new Date()
        },{transaction});
      }
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
        if(cuota){
          const anterior=cuota.get({plain:true});
          await cuota.update(valores,{transaction});
          await reversion.guardarInstantanea(casaId,referencia,cuota,anterior,transaction);
          guardadas.push(cuota);
        }else{
          const creada=await Cuota.create(valores,{transaction});
          await reversion.guardarInstantanea(casaId,referencia,creada,null,transaction);
          guardadas.push(creada);
        }
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
  const casa=await Casa.findByPk(casaId,{attributes:['id','calle','calleCorrecta','numero','nombre','cuotaPorCobrar','exencionesRecargo']});
  if(!casa)throw fail(404,'Vivienda no encontrada');
  let movimientos=[],deudas=[];
  if(tipo==='MANTENIMIENTO'){
   const [cuotas,comprobantes]=await Promise.all([
    Cuota.findAll({where:{casaId},attributes:['id','anio','mes','montoPagado','estatusPago','recargo','recargoPagado','referencia','folio','fechaPago','fechaConfirmacion','formaPago','origenImportacion','montoCuota','saldoPendiente']}),
    PagoReportado.findAll({where:{...(tipo==='MANTENIMIENTO'?require('../services/pagos-reparto.service').condicionCasa(casaId):{casaId}),tipoPago:tipo,estatus:'VALIDADO'},attributes:['id','tipoPago','estatus','monto','recargo','folioReporte','folioOperacion','fechaOperacion','aplicacionCuotas']})
   ]);
   movimientos=historialMantenimiento(cuotas,require('../services/pagos-reparto-datos').paraCasa(comprobantes,casaId));
   const hoy=fechaMexico();
   deudas=calcularAdeudoVivienda(cuotas,{anio:Number(hoy.slice(0,4)),mes:Number(hoy.slice(5,7)),hoy,tarifa:tarifaParaCasa(casa),exencionesRecargo:casa.exencionesRecargo||[],incluirDetalles:true}).detalles;
  }else{
   const [reportados,manuales]=await Promise.all([
    PagoReportado.findAll({where:{...(tipo==='MANTENIMIENTO'?require('../services/pagos-reparto.service').condicionCasa(casaId):{casaId}),tipoPago:tipo,estatus:'VALIDADO'},attributes:['id','cargoExtraordinarioId','tipoPago','estatus','monto','recargo','folioReporte','folioOperacion','fechaOperacion','aplicacionCuotas']}),
    PagoManualConcepto.findAll({where:{casaId,tipoPago:tipo},attributes:['id','cargoExtraordinarioId','tipoPago','monto','formaPago','referencia','creadoEn']})
   ]);
   if(tipo==='EXTRAORDINARIO'){
    const proyectoId=req.query.proyectoId?Number(req.query.proyectoId):null;
    if(req.query.proyectoId&&(!Number.isSafeInteger(proyectoId)||proyectoId<1))throw fail(400,'Proyecto inválido');
    const cargos=(await estadoCargos(casaId)).filter(c=>!proyectoId||Number(c.cuotaExtraordinariaId)===proyectoId);
    const cargoIds=new Set(cargos.map(c=>String(c.id)));
    movimientos=historialConcepto(tipo,reportados.filter(p=>cargoIds.has(String(p.cargoExtraordinarioId))),
     manuales.filter(p=>cargoIds.has(String(p.cargoExtraordinarioId))));
    const aportaciones=await AportacionExtraordinaria.findAll({where:{casaId},
     attributes:['id','cargoExtraordinarioId','monto','fecha','referencia','formaPago','origen']});
    movimientos.push(...aportaciones.filter(a=>cargoIds.has(String(a.cargoExtraordinarioId))).map(a=>({
     movimientoId:Number(a.id),origenTipo:'APORTACION',origenRegistro:a.origen,
      referencia:a.referencia,fecha:a.fecha,monto:Number(a.monto),recargo:0,meses:0,periodos:[],
     formaPago:a.formaPago||'Aportación registrada',fuente:'APORTACION'
    })));
    movimientos.sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
    deudas=cargos.filter(c=>c.estado!=='PAGADO').map(c=>({categoria:tipo,periodo:c.periodo,concepto:c.concepto,monto:c.monto,estado:c.estado}));
   }else{
    movimientos=historialConcepto(tipo,reportados,manuales);
    const reservas=await Reserva.findAll({where:{casaId,estatus:'APROBADA',pagado:false},attributes:['fecha','cuotaRecuperacion','depositoGarantia','limpieza']});
    deudas=reservas.map(r=>({categoria:tipo,periodo:r.fecha,concepto:'Reserva de casa club',monto:Number(r.cuotaRecuperacion||0)+Number(r.depositoGarantia||0)+Number(r.limpieza||0)}));
   }
  }
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,data:{casaId,calle:casa.calleCorrecta||casa.calle,numero:casa.numero,nombre:casa.nombre,tipoPago:tipo,
   movimientos,deudas,saldoFavor:tipo==='MANTENIMIENTO'?calcularAdeudoVivienda(await Cuota.findAll({where:{casaId}}),{anio:Number(fechaMexico().slice(0,4)),mes:Number(fechaMexico().slice(5,7)),tarifa:tarifaParaCasa(casa),exencionesRecargo:casa.exencionesRecargo||[]}).saldoFavor:0,saldoPendiente:Math.round(deudas.reduce((sum,d)=>sum+Number(d.monto||0),0)*100)/100}});
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
  const casaId=Number(req.body?.casaId),tipo=String(req.body?.tipoPago||''),
   id=Number(req.body?.conceptoId),formaPago=String(req.body?.formaPago||'EFECTIVO').toUpperCase();
  const cents=x=>Math.round(Number(x)*100);
  if(!Number.isSafeInteger(casaId)||casaId<1||!Number.isSafeInteger(id)||id<1||
   !['EXTRAORDINARIO','CASA_CLUB'].includes(tipo)||
   !['EFECTIVO','TRANSFERENCIA','DEPOSITO','OTRO'].includes(formaPago))
   throw fail(400,'Concepto, vivienda o forma de pago inválidos');
  const data=await sequelize.transaction(async transaction=>{
   const casa=await Casa.findByPk(casaId,{transaction,lock:transaction.LOCK.UPDATE});
   if(!casa)throw fail(404,'Vivienda no encontrada');
   const cargo=tipo==='EXTRAORDINARIO'?await CargoExtraordinario.findOne({where:{id,casaId},transaction,lock:transaction.LOCK.UPDATE}):null;
   const reserva=tipo==='CASA_CLUB'?await Reserva.findOne({where:{id,casaId,estatus:'APROBADA',pagado:false},transaction,lock:transaction.LOCK.UPDATE}):null;
   if(tipo==='EXTRAORDINARIO'&&!cargo||tipo==='CASA_CLUB'&&!reserva)
    throw fail(409,'El cargo seleccionado ya no está pendiente');
   const monto=Number(req.body?.monto),importe=cents(monto);
   if(!Number.isFinite(monto)||!Number.isSafeInteger(importe)||importe<1||
      Math.abs(monto*100-importe)>0.001)
    throw fail(400,'El abono debe ser mayor que cero y tener máximo dos decimales.');
   const referencia='MJ'+(tipo==='CASA_CLUB'?'CLUB':'EXTRA')+':'+randomUUID();
   if(tipo==='EXTRAORDINARIO'){
    // Un cargo es una meta de proyecto, no una mensualidad obligatoria.
    // Varios abonos en fechas distintas conservan su folio, sin vencimiento ni recargo.
    const saldo=await consultarSaldoCargo(cargo,{transaction});
    if(saldo.restante<=0)throw fail(409,'Esta vivienda ya alcanzó la meta del proyecto.');
    if(importe>cents(saldo.disponible))
     throw fail(409,'El abono excede lo disponible para aportar: $'+saldo.disponible.toFixed(2)+
      ' (ya aportado $'+saldo.abonado.toFixed(2)+', comprobantes en revisión $'+saldo.pendienteValidacion.toFixed(2)+').');
    await AportacionExtraordinaria.create({
     cuotaExtraordinariaId:cargo.cuotaExtraordinariaId,cargoExtraordinarioId:id,
     casaId,monto:importe/100,fecha:fechaMexico(),formaPago,referencia,
     origen:'ADMIN',registradoPor:req.usuario.usuarioId
    },{transaction});
    const restante=Math.round((saldo.restante*100-importe))/100;
    return {casaId,tipoPago:tipo,monto:importe/100,meta:saldo.meta,
     totalAbonado:Math.round((saldo.abonado*100+importe))/100,
     saldoPendiente:restante,metaAlcanzada:restante===0,referencia};
   }
   const where={reservaCasaClubId:id};
   const [reportado,manual]=await Promise.all([
    PagoReportado.findOne({where:{...where,estatus:{[Op.in]:['PENDIENTE_VALIDACION','VALIDADO']}},transaction}),
    PagoManualConcepto.findOne({where,transaction})
   ]);
   if(reportado||manual)throw fail(409,'La reserva tiene un pago previo o comprobante pendiente; requiere conciliación.');
   const total=Number(reserva.cuotaRecuperacion)+Number(reserva.depositoGarantia)+Number(reserva.limpieza);
   if(importe!==cents(total))throw fail(409,'Para Casa Club el importe debe ser $'+total.toFixed(2));
   await PagoManualConcepto.create({casaId,tipoPago:tipo,cargoExtraordinarioId:null,reservaCasaClubId:id,
    monto,formaPago,referencia,registradoPor:req.usuario.usuarioId},{transaction});
   await reserva.update({pagado:true,fechaPago:new Date().toISOString().slice(0,10),folio:referencia,actualizadoEn:new Date()},{transaction});
   return {casaId,tipoPago:tipo,monto,referencia};
  });
  return res.status(201).json({ok:true,data,message:'Pago registrado sin modificar vigencias de TAGs ni C3'});
 }catch(e){
  if(!e.status)console.error('[pago manual concepto]',e);
  return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible registrar el pago'});
 }
}
module.exports={registrarPagoVivienda,estadoPagoVivienda,cotizarPagoVivienda,historialPagoVivienda,opcionesPagoConcepto,registrarPagoConcepto};
