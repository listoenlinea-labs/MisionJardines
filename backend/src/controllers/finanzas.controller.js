const {Op,QueryTypes,Transaction}=require('sequelize');
const sequelize=require('../config/database');
const { compararDirecciones }=require('../services/direccion-sort.service');
const { seleccionarPadronAnalisis }=require('../services/padron-finanzas.service');
const {tarifaParaCasa}=require('../services/tarifa-mantenimiento.service');
const { calcularAdeudoVivienda }=require('../services/adeudo-vivienda-analisis.service');
const {estadoPeriodoMantenimiento}=require('../services/estado-mantenimiento-tablas.service');
const {tagsParaViviendas}=require('../services/analisis-tags.service');
const {Casa,Cuota,PagoReportado,ZkTarjeta,CuotaExtraordinaria,CargoExtraordinario,PagoManualConcepto,AportacionExtraordinaria}=require('../models');
const Egreso=require('../models/Egreso');
const {referenciaEgreso}=require('../services/egreso-referencia.service');
const {validarCambio,categoriasEquivalentes,prepararAjuste,esAjuste}=require('../services/ajuste-egresos-mensuales.service');
const ReservaCasaClub=require('../models/ReservaCasaClub');
const {crearPorEgreso}=require('../services/cargos-extraordinarios.service');
const {resumenConceptos}=require('../services/resumen-conceptos-analisis.service');
const {historialMantenimiento,historialConcepto}=require('../services/historial-pagos-vivienda.service');
const {reciboDelPeriodo}=require('../services/recibo-periodo-excel.service');
const {ultimoAbonoConAdeudo}=require('../services/abono-con-adeudo-resumen.service');
const {folioRecibo}=require('../services/recibo-mantenimiento-analisis.service');
const {ultimosRegistrosPago}=require('../services/ultimo-registro-pago.service');
const {agrupacionMantenimiento}=require('../services/resumen-cobranza-calles.service');
const {categorias,canonica,resumenEgresos}=require('../services/categorias-egresos.service');
const mesNombres=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const num=x=>Number(x||0);
const fail=(status,message)=>Object.assign(new Error(message),{status});
const sendErr=(res,e)=>{if(!e.status)console.error('[finanzas]',e);return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible consultar las finanzas'});};
function filters(req){
 const anio=Number(req.query.anio||new Date().getFullYear());
 const mes=Number(req.query.mes||new Date().getMonth()+1);
 if(!Number.isInteger(anio)||anio<2020||anio>2100||!Number.isInteger(mes)||mes<1||mes>12)throw fail(400,'Selecciona un mes y año válidos');
 return {anio,mes,mesName:mesNombres[mes-1],start:anio+'-'+String(mes).padStart(2,'0')+'-01',end:new Date(Date.UTC(anio,mes,0)).toISOString().slice(0,10)};
}
async function analizar(req,res){
 try{
  const {anio,mes,mesName,start,end}=filters(req);
  const [casas,cuotas,pagos,egresos,reservasClub,ingresosManuales,historialCuotas,tarjetas,pagosManualesConcepto,cuotasExtras,cargosExtraordinarios,pagosConceptoHistoricos,manualesConceptoHistoricos,reservasAprobadas,comprobantesMantenimiento,foliosRegistrados,aportacionesExtraordinarias]=await Promise.all([
   Casa.findAll({attributes:['id','calle','calleCorrecta','numero','nombre','controles','cuotaPorCobrar','exencionesRecargo']}),
   Cuota.findAll({where:{anio,mes:mesName},attributes:['id','casaId','anio','mes','estatusPago','montoPagado','montoCuota','recargo','recargoPagado','saldoPendiente','calleSnapshot','numeroCasaSnapshot','nombrePagador','origenImportacion','referencia','folio','fechaPago','fechaConfirmacion','formaPago']}),
   PagoReportado.findAll({where:{estatus:'VALIDADO',fechaOperacion:{[Op.between]:[start,end]}},attributes:['id','tipoPago','monto','recargo','casaId','fechaOperacion','folioReporte','folioOperacion','aplicacionCuotas']}),
   Egreso.findAll({where:{fecha:{[Op.between]:[start,end]}},order:[['fecha','DESC']],limit:2000}),
   ReservaCasaClub.findAll({where:{pagado:true,fechaPago:{[Op.between]:[start,end]}},attributes:['cuotaRecuperacion','depositoGarantia','limpieza','garantiaDevuelta','estatus']}),
   sequelize.query('SELECT tipo, concepto, monto, fecha, referencia FROM ingresos_fraccionamiento WHERE fecha BETWEEN :start AND :end ORDER BY fecha, id',{replacements:{start,end},type:QueryTypes.SELECT}),
   // Historial íntegro para identificar pagos adelantados en 2027 y años posteriores.
   // El saldo sigue limitado al corte pedido por calcularAdeudoVivienda.
   Cuota.findAll({attributes:['id','casaId','anio','mes','estatusPago','montoPagado','montoCuota','recargo','recargoPagado','saldoPendiente','referencia','folio','fechaPago','fechaConfirmacion','formaPago','origenImportacion','confirmadoPorUsuarioId']}),
   ZkTarjeta.findAll({attributes:['id','casaId','numeroTarjeta','nombreDispositivo','departamento','fechaInicio','fechaFin','bloqueado','enControlador','puertasAutorizadas','ultimaLectura']})
   ,PagoManualConcepto.findAll({where:{creadoEn:{[Op.between]:[start+' 00:00:00',end+' 23:59:59']}},attributes:['id','casaId','tipoPago','monto','formaPago','referencia','creadoEn']})
   ,CuotaExtraordinaria.findAll({attributes:['egresoId','id','codigo','concepto','monto','activo','fechaInicio']}),
   CargoExtraordinario.findAll({attributes:['id','cuotaExtraordinariaId','casaId','periodo','monto'],include:[{model:CuotaExtraordinaria,as:'cuota',attributes:[],required:true,where:{activo:true}}]}),
   PagoReportado.findAll({where:{tipoPago:{[Op.in]:['EXTRAORDINARIO','CASA_CLUB']},estatus:'VALIDADO'},attributes:['id','casaId','tipoPago','estatus','cargoExtraordinarioId','reservaCasaClubId','monto','recargo','folioReporte','folioOperacion','fechaOperacion','aplicacionCuotas']}),
   PagoManualConcepto.findAll({attributes:['id','casaId','tipoPago','cargoExtraordinarioId','reservaCasaClubId','monto','formaPago','referencia','creadoEn']}),
   ReservaCasaClub.findAll({where:{estatus:'APROBADA'},attributes:['id','casaId','fecha','fechaLimitePago','estatus','cuotaRecuperacion','depositoGarantia','limpieza','pagado']}),
   PagoReportado.findAll({where:{tipoPago:'MANTENIMIENTO',estatus:'VALIDADO'},attributes:['id','casaId','tipoPago','estatus','monto','recargo','folioReporte','folioOperacion','fechaOperacion','aplicacionCuotas']}),
   PagoReportado.findAll({attributes:['casaId','tipoPago','creadoEn','estatus','folioReporte','folioOperacion','aplicacionCuotas']}),
    AportacionExtraordinaria.findAll({attributes:['id','cuotaExtraordinariaId','cargoExtraordinarioId','casaId','fecha','monto','referencia','origen']})
  ]);
  const egresosHistoricos=await Egreso.findAll({
   where:{fecha:{[Op.lte]:end}},attributes:['fecha','categoria','monto'],raw:true
  });
  const registros=ultimosRegistrosPago({reportados:require('../services/pagos-reparto-datos').desglosar(foliosRegistrados),cuotas:historialCuotas,manuales:manualesConceptoHistoricos});
  const byHouse=new Map(cuotas.map(x=>[String(x.casaId),x]));
  const padron=seleccionarPadronAnalisis(casas,cuotas);
  const historiales=new Map();
  for(const cuota of historialCuotas){
   const id=String(cuota.casaId);
   if(!historiales.has(id))historiales.set(id,[]);
   historiales.get(id).push(cuota);
  }
  const porCasa=(rows)=>{
   const map=new Map();
   for(const row of rows){const id=String(row.casaId);if(!map.has(id))map.set(id,[]);map.get(id).push(row);}
   return map;
  };
  const bancosMantenimiento=porCasa(require('../services/pagos-reparto-datos').desglosar(comprobantesMantenimiento));
  const bancosConceptos=porCasa(pagosConceptoHistoricos);
  const manualesConceptos=porCasa(manualesConceptoHistoricos);
  const tagsPorCasa=tagsParaViviendas(padron.casas,tarjetas);
  const streets=new Map();
  const residences=padron.casas.map(h=>{
   const q=byHouse.get(String(h.id));
   const cuotasDeCasa=historiales.get(String(h.id))||[];
   const adeudo=calcularAdeudoVivienda(cuotasDeCasa,{anio,mes,tarifa:tarifaParaCasa(h),exencionesRecargo:h.exencionesRecargo||[]});
   const status=estadoPeriodoMantenimiento(q,adeudo,anio,mes);
   const abono=ultimoAbonoConAdeudo(cuotasDeCasa,anio,mes,adeudo.saldoPendiente);
   let ultimoAbono=null;
   if(abono){
    // Folio idéntico al PDF generado por historial; la referencia técnica
    // no se muestra en ninguna celda visible de Excel.
    try{
     ultimoAbono={...abono,folio:folioRecibo({
      calle:h.calleCorrecta||h.calle,numero:h.numero,
      periodo:abono.anio+'-'+String(mesNombres.indexOf(abono.mes)+1).padStart(2,'0'),
      referencia:abono.referencia
     })};
    }catch(_){ultimoAbono={...abono,folio:null};}
   }
   const cuotaCompleta=status==='PAGADO';
   const pagada=cuotaCompleta || (status==='PAGO_PARCIAL' && num(q?.montoPagado)>0) ||
    (Boolean(ultimoAbono)&&q?.origenImportacion==='MANUAL_ABONO_ADEUDO'&&num(q?.montoPagado)>0);
   // Pago parcial cuenta como vivienda con algún pago, pero se conserva su estatus.
   const calle=String(h.calleCorrecta||h.calle||'Sin calle');
   if(!streets.has(calle))streets.set(calle,{calle,total:0,pagadas:0,pendientes:0,abonos:0});
   const st=streets.get(calle);
   st.total++;if(cuotaCompleta)st.pagadas++;else st.pendientes++;
   st.abonos+=num(q?.montoPagado);
   const bancosDeCasa=bancosMantenimiento.get(String(h.id))||[];
   const ultimoPago=historialMantenimiento(cuotasDeCasa,bancosDeCasa)[0]||null;
   // Sólo el movimiento que acredita el período consultado puede generar
   // folio en Excel. No reutilizar el último recibo de octubre para deudores.
   const reciboPeriodo=reciboDelPeriodo({casa:h,cuotas:cuotasDeCasa,
     comprobantes:bancosDeCasa,estado:status,saldoPendiente:adeudo.saldoPendiente,anio,mes});
   return {casaId:h.id,calle,numero:h.numero,nombre:h.nombre||q?.nombrePagador||'',tarifaMensual:tarifaParaCasa(h),exencionesRecargo:h.exencionesRecargo||[],saldoFavor:adeudo.saldoFavor||0,ultimoRegistroPago:registros.get(String(h.id)+':MANTENIMIENTO')||null,estatus:status,pagada,abonoConAdeudo:Boolean(ultimoAbono),ultimoAbonoConAdeudo:ultimoAbono,montoPagado:num(q?.montoPagado),ultimoPago,reciboPeriodo,saldoPendiente:adeudo.saldoPendiente,ultimoMesPagado:adeudo.ultimoMesPagado,mesesPendientes:adeudo.mesesPendientes,recargosPendientes:adeudo.recargosPendientes,
    tags:tagsPorCasa.get(String(h.id))};
  });
  const calls=[...streets.values()].map(x=>({...x,porcentaje:x.total?Math.round(x.pagadas/x.total*10000)/100:0})).sort((a,b)=>a.calle.localeCompare(b.calle,'es-MX',{numeric:true,sensitivity:'base'}));
  const viviendasConceptos=resumenConceptos({viviendas:residences,cargos:cargosExtraordinarios,reportados:pagosConceptoHistoricos,
   manuales:manualesConceptoHistoricos,aportaciones:aportacionesExtraordinarias,reservas:reservasAprobadas,anio,mes});
  const proyectosExtraordinarios=require('../services/proyectos-extraordinarios.service').juntar(
   cuotasExtras.filter(p=>p.activo),cargosExtraordinarios,aportacionesExtraordinarias,
   manualesConceptoHistoricos,pagosConceptoHistoricos,residences);
  for(const tipo of ['EXTRAORDINARIO','CASA_CLUB']){
   for(const row of viviendasConceptos[tipo]){
    const casaId=String(row.casaId);
    row.ultimoRegistroPago=registros.get(casaId+':'+tipo)||null;
    row.ultimoPago=historialConcepto(tipo,bancosConceptos.get(casaId)||[],manualesConceptos.get(casaId)||[])[0]||null;
   }
  }
  // Las gráficas imputan cada cuota por mes cubierto; se conserva el flujo de caja
  // independiente para balance y no se vuelven a sumar bancos conciliados.
  const cobranzaMantenimiento=agrupacionMantenimiento({
   padron:padron.casas,cuotas:historialCuotas,
   comprobantes:require('../services/pagos-reparto-datos').desglosar(comprobantesMantenimiento),
   inicio:start,fin:end
  });
  const egresosAcumulados=resumenEgresos(egresosHistoricos,start,end);
  const ingresosReportados={mantenimiento:0,extraordinarios:0,casaClub:0};
  for(const p of pagos)ingresosReportados[p.tipoPago==='EXTRAORDINARIO'?'extraordinarios':p.tipoPago==='CASA_CLUB'?'casaClub':'mantenimiento']+=num(p.monto);
  const categoriasGasto=Object.fromEntries(categorias.map(c=>[c,0]));
  for(const e of egresos){const key=canonica(e.categoria);if(Object.hasOwn(categoriasGasto,key))categoriasGasto[key]+=num(e.monto);}
  const ingresosValidados=ingresosReportados.mantenimiento+ingresosReportados.extraordinarios+ingresosReportados.casaClub;
  const totalManualConcepto=pagosManualesConcepto.reduce((a,p)=>a+num(p.monto),0);
  const manualesCasaClub=pagosManualesConcepto.filter(p=>p.tipoPago==='CASA_CLUB').reduce((a,p)=>a+num(p.monto),0);
  const cobrosHistoricos=cuotas.reduce((a,q)=>a+num(q.montoPagado),0);
  const esCargaHistorica=cuotas.some(q=>String(q.origenImportacion||'').startsWith('EXCEL_'));
  const ingresosAdicionales=ingresosManuales.filter(x=>x.tipo!=='SALDO_INICIAL').reduce((a,x)=>a+num(x.monto),0);
  const saldoInicial=ingresosManuales.filter(x=>x.tipo==='SALDO_INICIAL').reduce((a,x)=>a+num(x.monto),0);
  // No sumar de nuevo los bancos de mantenimiento, incluidos por referencia.
  const ingresosBase=cobranzaMantenimiento.recibidoMes+
   ingresosReportados.extraordinarios+ingresosReportados.casaClub;
  // Los importes del Excel son un historial de cobranza, no depósitos nuevos:
  // NO sumarlos otra vez al flujo de caja hasta conciliar con contabilidad.
  const ingresosAportacionesExtraordinarias=aportacionesExtraordinarias
    .filter(x=>x.origen!=='EXCEL_HISTORICO'&&String(x.fecha).slice(0,10)>=start&&String(x.fecha).slice(0,10)<=end)
    .reduce((sum,x)=>sum+num(x.monto),0);
  const ingresosParaBalance=ingresosBase+ingresosAdicionales+totalManualConcepto+ingresosAportacionesExtraordinarias;
  const casaClub={recuperacion:0,limpieza:0,garantiasRecibidas:0,garantiasDevueltas:0};
  for(const r of reservasClub){casaClub.recuperacion+=num(r.cuotaRecuperacion);casaClub.limpieza+=num(r.limpieza);casaClub.garantiasRecibidas+=num(r.depositoGarantia);if(r.garantiaDevuelta)casaClub.garantiasDevueltas+=num(r.depositoGarantia);}
  const totalEgresos=Object.values(categoriasGasto).reduce((a,v)=>a+v,0);
  const pagadas=residences.filter(h=>String(h.estatus)==='PAGADO').length; // Cumplimiento, no simples ingresos.
  // Desglose sin paginación ni filtros del navegador para los cuatro Excel del tablero.
  // Estos movimientos se consultaron ya para construir los mismos indicadores.
  const viviendasPorId=new Map(residences.map(h=>[String(h.casaId),h]));
  const cuotasPeriodoDetalle=cuotas.map(q=>({
   id:q.id,casaId:q.casaId,calle:viviendasPorId.get(String(q.casaId))?.calle||q.calleSnapshot||'',
   numero:viviendasPorId.get(String(q.casaId))?.numero||q.numeroCasaSnapshot||'',
   nombre:viviendasPorId.get(String(q.casaId))?.nombre||q.nombrePagador||'',
   anio:q.anio,mes:q.mes,estatus:q.estatusPago,montoCuota:num(q.montoCuota),montoPagado:num(q.montoPagado),
   recargo:num(q.recargo),saldoPendiente:num(q.saldoPendiente),fechaPago:q.fechaPago||q.fechaConfirmacion||null,
   formaPago:q.formaPago||'',referencia:q.referencia||'',folio:q.folio||'',origen:q.origenImportacion||''
  }));
  const pagosPeriodoDetalle=require('../services/pagos-reparto-datos').desglosar(pagos).map(p=>({id:p.id,casaId:p.casaId,
   calle:viviendasPorId.get(String(p.casaId))?.calle||'',numero:viviendasPorId.get(String(p.casaId))?.numero||'',
   nombre:viviendasPorId.get(String(p.casaId))?.nombre||'',tipo:p.tipoPago,monto:num(p.monto),
   recargo:num(p.recargo),fecha:p.fechaOperacion,referencia:p.folioOperacion||p.folioReporte||''}));
  const manualesConceptoPeriodoDetalle=pagosManualesConcepto.map(p=>({
   id:p.id,casaId:p.casaId,calle:viviendasPorId.get(String(p.casaId))?.calle||'',
   numero:viviendasPorId.get(String(p.casaId))?.numero||'',
   tipo:p.tipoPago,monto:num(p.monto),formaPago:p.formaPago||'',
   referencia:p.referencia||'',fecha:p.creadoEn||null
  }));
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,data:{
   anio,mes,periodo:mesName+' '+anio,
   casas:residences.length,pagadas,pendientes:residences.length-pagadas,
   porcentaje:residences.length?Math.round(pagadas/residences.length*10000)/100:0,
   calles:calls,viviendas:residences.sort(compararDirecciones),viviendasConceptos,proyectosExtraordinarios,
   cuotasPeriodoDetalle,pagosPeriodoDetalle,manualesConceptoPeriodoDetalle,
   padronExcluidos:padron.excluidas,padronDuplicados:padron.duplicadas,
   avisoPadron:padron.excluidas ? 'El porcentaje de cumplimiento excluye '+padron.excluidas+' registros auxiliares, fuera del padrón o de prueba. Los registros, cuotas y pagos originales permanecen en la base de datos.' : '',
   cobrosCuotasRegistrados:cobrosHistoricos,ingresosHistoricos:esCargaHistorica?cobrosHistoricos:0,esCargaHistorica,
   ingresosParaBalance,ingresosAdicionales,totalManualConcepto,ingresosAportacionesExtraordinarias,saldoInicial,ingresosManuales,
   ingresosReportados,ingresosValidados,manualesCasaClub,casaClub,totalEgresos,balanceReportado:ingresosParaBalance+saldoInicial-totalEgresos,
   ingresosMantenimientoCalles:cobranzaMantenimiento,egresosPorConcepto:egresosAcumulados,
   egresosCategorias:categoriasGasto,egresos:egresos.map(e=>({...e.toJSON(),esAjusteMensual:esAjuste(e),tieneCuota:cuotasExtras.some(c=>Number(c.egresoId)===Number(e.id))})),
   avisoConciliacion:'Los ingresos por calle se asignan a la mensualidad cubierta (con recargo efectivamente pagado). El saldo de caja se calcula por fecha del cobro, sin duplicar depósitos. Los movimientos sin período requieren conciliación.'
  }});
 }catch(e){return sendErr(res,e);}
}
async function registrarEgreso(req,res){
 try{
  const fecha=String(req.body?.fecha||''),categoria=String(req.body?.categoria||''),concepto=String(req.body?.concepto||'').trim(),monto=Number(req.body?.monto);
  const extraordinaria=categoria==='CUOTA_EXTRAORDINARIA';
  const meses=Number(req.body?.meses),fechaInicio=String(req.body?.fechaInicio||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||new Date(fecha+'T12:00:00Z').toISOString().slice(0,10)!==fecha
     ||!categorias.includes(categoria)||!concepto||concepto.length>250||!Number.isFinite(monto)||monto<=0||monto>100000000)throw fail(400,'Completa fecha, categoría, concepto y monto válidos');
  // Crear y asignar la referencia dentro de una sola transacción. Se deriva
  // del ID persistido; dos egresos concurrentes no comparten referencia.
  const saved=await sequelize.transaction(async transaction=>{
   const row=await Egreso.create({fecha,categoria,concepto,monto,referencia:null,registradoPor:req.usuario.usuarioId},{transaction});
   const referencia=referenciaEgreso(fecha,row.id);
   await row.update({referencia},{transaction});
   const cuota=extraordinaria?await crearPorEgreso({egreso:row,meses,fechaInicio,usuarioId:req.usuario.usuarioId,transaction}):null;
   return {id:row.id,referencia,cuotaExtraordinariaId:cuota?.id||null};
  });
  return res.status(201).json({ok:true,...saved,message:'Egreso registrado con referencia automática'});
 }catch(e){return sendErr(res,e);}
}
async function activarCuotaExistente(req,res){
 try{
  const id=Number(req.params.id),meses=Number(req.body?.meses),fechaInicio=String(req.body?.fechaInicio||'');
  if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Egreso inválido');
  const saved=await sequelize.transaction(async transaction=>{
   const egreso=await Egreso.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!egreso||!['CUOTA_EXTRAORDINARIA','PROYECTOS'].includes(egreso.categoria))throw fail(404,'El egreso no es una cuota extraordinaria');
   if(await CuotaExtraordinaria.findOne({where:{egresoId:id},transaction}))throw fail(409,'Este egreso ya tiene cargos asociados');
   return crearPorEgreso({egreso,meses,fechaInicio,usuarioId:req.usuario.usuarioId,transaction});
  });
  return res.status(201).json({ok:true,id:saved.id,message:'Mensualidades generadas para el egreso histórico'});
 }catch(e){return sendErr(res,e);}
}
// Edición segura del total mensual: registrar un asiento compensatorio firmado
// sin destruir los gastos individuales, los cargos extraordinarios ni su auditoría.
// La ruta está limitada a SUPER_ADMIN y ADMINISTRADOR por finanzas.routes.
async function ajustarTotalEgresoMensual(req,res){
 try{
  const cambio=validarCambio(req.body);
  const actor=Number(req.usuario?.usuarioId);
  if(!Number.isSafeInteger(actor)||actor<1)throw fail(403,'Administrador no identificado');
  const resultado=await sequelize.transaction({
   isolationLevel:Transaction.ISOLATION_LEVELS.SERIALIZABLE
  },async transaction=>{
   // Se incluyen las categorías legadas (LUZ/CFE, AGUA/SIAPA,
   // PROYECTOS/CUOTA_EXTRAORDINARIA) y también ajustes anteriores.
   // El bloqueo evita sobrescribir un importe consultado antes de otro ajuste.
   const rows=await Egreso.findAll({
    where:{fecha:{[Op.between]:[cambio.inicio,cambio.fin]},
     categoria:{[Op.in]:categoriasEquivalentes(cambio.categoria)}},
    attributes:['id','monto'],order:[['id','ASC']],
    transaction,lock:transaction.LOCK.UPDATE
   });
   const ajuste=prepararAjuste(cambio,rows);
   if(!ajuste.diferencia)
    return {sinCambio:true,periodo:cambio.periodo,categoria:cambio.categoria,
     totalAnterior:ajuste.actual/100,totalPagado:ajuste.nuevo/100,ajuste:0};
   // El monto DECIMAL de egresos admite un ajuste negativo para reducir
   // el total, pero el saldo FINAL nunca puede quedar bajo cero.
   const entry=await Egreso.create({
    fecha:cambio.fin,categoria:cambio.categoria,concepto:ajuste.concepto,
    monto:(ajuste.diferencia/100).toFixed(2),
    registradoPor:actor,referencia:null
   },{transaction});
   const referencia=referenciaEgreso(cambio.fin,entry.id);
   await entry.update({referencia},{transaction});
   return {id:entry.id,referencia,periodo:cambio.periodo,
    categoria:cambio.categoria,totalAnterior:ajuste.actual/100,
    totalPagado:ajuste.nuevo/100,ajuste:ajuste.diferencia/100};
  });
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,data:resultado,
   message:resultado.sinCambio?'El total mensual ya coincide con el importe solicitado.':
    'Total mensual actualizado en MySQL. El ajuste quedó registrado con folio y administrador responsable.'});
 }catch(error){return sendErr(res,error);}
}
// Actualiza exclusivamente la tarifa futura por vivienda. No altera cobros ni TAGs.
async function modificarCuotaPorCobrar(req,res){
 try{
  const casaId=Number(req.params.casaId);
  const cuota=Number(req.body?.cuotaPorCobrar);
  const sinRecargo=req.body?.sinRecargo;
  if(sinRecargo!==undefined&&typeof sinRecargo!=='boolean')throw fail(400,'Valor de exención inválido');
  if(!Number.isSafeInteger(casaId)||casaId<1)throw fail(400,'Vivienda inválida');
  if(!Number.isInteger(cuota)||cuota<1||cuota>10000)
    throw fail(400,'La cuota mensual debe ser un importe entero de $1 a $10,000');
  const resultado=await sequelize.transaction(async transaction=>{
   const casa=await Casa.findByPk(casaId,{transaction,lock:transaction.LOCK.UPDATE});
   if(!casa)throw fail(404,'Vivienda inexistente');
   const anterior=tarifaParaCasa(casa);
   const exenciones=sinRecargo===undefined?casa.exencionesRecargo:require('../services/recargos-exenciones.service').establecer(casa.exencionesRecargo,sinRecargo);
   await casa.update({cuotaPorCobrar:cuota,...(sinRecargo===undefined?{}:{exencionesRecargo:exenciones})},{transaction});
   return {casaId,calle:casa.calleCorrecta||casa.calle,numero:casa.numero,
    cuotaPorCobrar:cuota,anterior,sinRecargo:require('../services/recargos-exenciones.service').activo(exenciones)};
  });
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,data:resultado,message:'Cuota mensual de la vivienda actualizada. Los pagos y TAGs anteriores permanecen intactos.'});
 }catch(error){return sendErr(res,error);}
}
module.exports={analizar,registrarEgreso,activarCuotaExistente,modificarCuotaPorCobrar,ajustarTotalEgresoMensual};
