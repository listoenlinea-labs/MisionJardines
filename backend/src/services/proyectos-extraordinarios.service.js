'use strict';
const {Op,Transaction}=require('sequelize');
const {randomUUID}=require('crypto');
const db=require('../config/database');
const {Casa,CuotaExtraordinaria:Proyecto,CargoExtraordinario:Cargo,
 PagoReportado,PagoManualConcepto,AportacionExtraordinaria:Aportacion}=require('../models');
const {padronOficial}=require('./cargos-extraordinarios.service');
const {norm,cents,validarPaquete,fail}=require('./proyectos-extraordinarios-validacion.service');
const {fechaMexico}=require('./vigencia-calculo');
const {distribuirPresupuesto}=require('./proyectos-presupuesto.service');

function juntar(proyectos,cargos,aportes,manuales,reportados,viviendas){
 const base=new Map((viviendas||[]).map(h=>[String(h.casaId??h.id),h]));
 const porProyecto=new Map((proyectos||[]).map(p=>[String(p.id),{
  id:Number(p.id),codigo:p.codigo||null,nombre:p.concepto,cuotaBase:Number(p.monto||0),
  activo:!!p.activo,fechaInicio:p.fechaInicio||null,viviendas:0,
  totalEsperado:0,recaudado:0,saldoPendiente:0,saldoFavor:0,
  cumplidos:0,parciales:0,pendientes:0,sinCargo:0,viviendasDetalle:[],ultimoPago:null
 }]));
 const money=new Map(), fechas=new Map();
 const sumar=(cargoId,monto,fecha,referencia,fuente)=>{
  if(!cargoId)return;
  const k=String(cargoId),n=cents(monto);
  money.set(k,(money.get(k)||0)+n);
  if(n>0&&(!fechas.has(k)||String(fecha||'')>String(fechas.get(k).fecha||'')))
   fechas.set(k,{fecha,referencia,fuente,monto:Number(monto)});
 };
 for(const a of aportes||[])sumar(a.cargoExtraordinarioId,a.monto,a.fecha,a.referencia,'APORTACION');
 for(const a of manuales||[])if(a.tipoPago==='EXTRAORDINARIO')
  sumar(a.cargoExtraordinarioId,a.monto,a.creadoEn,a.referencia,'MANUAL');
 for(const p of reportados||[])if(p.tipoPago==='EXTRAORDINARIO'&&p.estatus==='VALIDADO')
  sumar(p.cargoExtraordinarioId,p.monto,p.fechaOperacion,p.folioOperacion||p.folioReporte,'BANCO');
 for(const c of cargos||[]){
  const p=porProyecto.get(String(c.cuotaExtraordinariaId));
  if(!p)continue;
  const id=String(c.casaId),h=base.get(id);
  if(!h)continue;
  const due=cents(c.monto),paid=money.get(String(c.id))||0;
  const balance=Math.max(0,due-paid)/100,credit=Math.max(0,paid-due)/100;
  const status=paid>=due?'PAGADO':paid>0?'PAGO_PARCIAL':'PENDIENTE';
  const ultima=fechas.get(String(c.id))||null;
  p.viviendas++;p.totalEsperado+=due/100;p.recaudado+=paid/100;
  p.saldoPendiente+=balance;p.saldoFavor+=credit;
  if(status==='PAGADO')p.cumplidos++;
  else if(status==='PAGO_PARCIAL')p.parciales++;
  else p.pendientes++;
  p.viviendasDetalle.push({casaId:Number(c.casaId),cargoId:Number(c.id),
   montoCuota:due/100,montoPagado:paid/100,saldoPendiente:balance,saldoFavor:credit,
   estatus:status,ultimoPago:ultima?{fecha:ultima.fecha,monto:ultima.monto,referencia:ultima.referencia}:null,
   ultimoMesPagado:paid?{mes:'APORTACIÓN',anio:Number(String(ultima?.fecha||fechaMexico()).slice(0,4))}:null});
  if(ultima&&(!p.ultimoPago||String(ultima.fecha)>String(p.ultimoPago.fecha)))p.ultimoPago=ultima;
 }
 return [...porProyecto.values()].map(p=>{
  p.sinCargo=(viviendas||[]).length-p.viviendas;
  for(const field of ['totalEsperado','recaudado','saldoPendiente','saldoFavor'])
   p[field]=Math.round(p[field]*100)/100;
  p.porcentaje=p.totalEsperado?Math.round(Math.min(100,p.recaudado/p.totalEsperado*100)*100)/100:0;
  return p;
 });
}
async function leerProyectos(padron){
 const [proyectos,cargos,aportes,manuales,reportados]=await Promise.all([
  Proyecto.findAll({where:{activo:true},attributes:['id','codigo','concepto','monto','activo','fechaInicio']}),
  Cargo.findAll({attributes:['id','cuotaExtraordinariaId','casaId','monto','periodo']}),
  Aportacion.findAll({attributes:['id','cuotaExtraordinariaId','cargoExtraordinarioId','casaId','monto','fecha','referencia']}),
  PagoManualConcepto.findAll({where:{tipoPago:'EXTRAORDINARIO'},attributes:['cargoExtraordinarioId','tipoPago','monto','creadoEn','referencia']}),
  PagoReportado.findAll({where:{tipoPago:'EXTRAORDINARIO',estatus:'VALIDADO'},attributes:['cargoExtraordinarioId','tipoPago','estatus','monto','fechaOperacion','folioOperacion','folioReporte']})
 ]);
 return juntar(proyectos,cargos,aportes,manuales,reportados,padron);
}
async function validarYConsultar(body){
 const padron=await padronOficial();
 const prepared=validarPaquete(body,padron);
 const codigos=prepared.proyectos.map(p=>p.codigo);
 const names=prepared.proyectos.map(p=>norm(p.nombre));
 const anteriores=await Proyecto.findAll({where:{activo:true},attributes:['id','codigo','concepto']});
 const existentes=anteriores.filter(p=>codigos.includes(p.codigo)||names.includes(norm(p.concepto)))
  .map(p=>({id:Number(p.id),codigo:p.codigo,nombre:p.concepto}));
 return {padron,prepared,existentes};
}
function resumenVista(prepared,existentes){
 return {proyectos:prepared.proyectos.map(p=>({
  codigo:p.codigo,nombre:p.nombre,fechaInicio:p.fechaInicio,
  resumen:p.resumen,cuotasEspeciales:p.cuotasEspeciales,
  tarifasPorConfirmar:p.tarifasPorConfirmar,sourceDifference:p.sourceDifference,
  errores:p.errors,advertencias:p.warnings
 })),errores:prepared.errors,advertencias:prepared.warnings,
 existentes,reconciliado:!prepared.errors.length&&!existentes.length};
}
async function previsualizar(body){
 const x=await validarYConsultar(body);
 return resumenVista(x.prepared,x.existentes);
}
async function crearLote(body,admin,{aceptarDiferencias=false,confirmarTarifas=false}={}){
 const actor=Number(admin);
 if(!Number.isSafeInteger(actor)||actor<1)throw fail(403,'Administrador sin identificar');
 const x=await validarYConsultar(body);
 if(x.prepared.errors.length)throw fail(409,'Hay viviendas o referencias que no coinciden con MySQL: '+x.prepared.errors.slice(0,8).join(' | '));
 if(x.existentes.length)throw fail(409,'Ya existe un proyecto con ese código o nombre; no se duplicarán cargos ni pagos.');
 if(x.prepared.proyectos.some(p=>p.sourceDifference)&&!aceptarDiferencias)
  throw fail(409,'Hay diferencias entre el resumen y las aportaciones del Excel. Confirma expresamente la conciliación.');
 if(x.prepared.proyectos.some(p=>p.tarifasPorConfirmar)&&!confirmarTarifas)
  throw fail(409,'Hay tarifas especiales por confirmar. Valida físicamente las viviendas y autoriza su clasificación.');
 return db.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.SERIALIZABLE},async tx=>{
  const existentes=await Proyecto.findAll({where:{activo:true},transaction:tx,lock:tx.LOCK.UPDATE});
  const codigos=x.prepared.proyectos.map(p=>p.codigo),nombres=x.prepared.proyectos.map(p=>norm(p.nombre));
  if(existentes.some(p=>codigos.includes(p.codigo)||nombres.includes(norm(p.concepto))))
   throw fail(409,'Otro administrador ya registró este proyecto. Actualiza antes de continuar.');
  const results=[];
  for(const p of x.prepared.proyectos){
   const project=await Proyecto.create({codigo:p.codigo,concepto:p.nombre,
    monto:p.cuotaBaseCentavos/100,montoTotal:p.resumen.totalEsperado,
    meses:1,fechaInicio:p.fechaInicio,viviendas:x.padron.length,
    activo:true,creadoPorUsuarioId:actor},{transaction:tx});
   await Cargo.bulkCreate(p.cargos.map(c=>({
    cuotaExtraordinariaId:project.id,casaId:c.casaId,periodo:p.fechaInicio,
    monto:c.montoCentavos/100
   })),{transaction:tx});
   const created=await Cargo.findAll({where:{cuotaExtraordinariaId:project.id},
    attributes:['id','casaId'],transaction:tx});
   if(created.length!==x.padron.length)
    throw fail(409,'La creación de cargos no alcanzó las 231 viviendas; se revirtió todo.');
   const cargoPorCasa=new Map(created.map(c=>[String(c.casaId),c.id]));
   for(let i=0;i<p.aportaciones.length;i+=350){
    await Aportacion.bulkCreate(p.aportaciones.slice(i,i+350).map(a=>({
     cuotaExtraordinariaId:project.id,cargoExtraordinarioId:cargoPorCasa.get(String(a.casaId)),
     casaId:a.casaId,fecha:a.fecha,monto:a.montoCentavos/100,
     referencia:a.referencia,formaPago:'OTRO',origen:'EXCEL_HISTORICO',registradoPor:actor
    })),{transaction:tx});
   }
   results.push({id:Number(project.id),codigo:p.codigo,nombre:p.nombre,...p.resumen});
  }
  return {proyectos:results};
 });
}
async function crearProyecto(input,actor){
 let cuotaBase=input?.cuotaBase,tarifasEspeciales=input?.tarifasEspeciales||[];
 if(input?.montoTotal!==undefined){
  // La API recalcula el presupuesto: no acepta montos calculados en el navegador.
  const padron=await padronOficial();
  const distribuido=distribuirPresupuesto(padron,input.montoTotal,input.excepciones||[]);
  cuotaBase=distribuido.cuotaBase;
  const porId=new Map(padron.map(h=>[Number(h.id),h]));
  tarifasEspeciales=distribuido.cargos.filter(c=>c.monto!==cuotaBase).map(c=>{
   const h=porId.get(c.casaId);
   return {calle:h.calleCorrecta||h.calle,numero:String(h.numero),monto:c.monto};
  });
 }
 const proyecto={
  codigo:'MJPROY-'+randomUUID().replace(/-/g,'').slice(0,16).toUpperCase(),
  nombre:input?.nombre,fechaInicio:input?.fechaInicio,cuotaBase,
  tarifasEspeciales,aportaciones:[]
 };
 return crearLote({version:1,padronEsperado:231,proyectos:[proyecto]},actor,{confirmarTarifas:true});
}
async function ajustarCuota(proyectoId,casaId,importe,actor){
 const pid=Number(proyectoId),cid=Number(casaId),admin=Number(actor),nuevo=cents(importe)/100;
 if(!Number.isSafeInteger(pid)||pid<1||!Number.isSafeInteger(cid)||cid<1||
  !Number.isSafeInteger(admin)||admin<1||nuevo<=0)throw fail(400,'Proyecto, vivienda o importe inválidos');
 return db.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.SERIALIZABLE},async tx=>{
  const project=await Proyecto.findOne({where:{id:pid,activo:true},transaction:tx,lock:tx.LOCK.UPDATE});
  if(!project)throw fail(404,'Proyecto no encontrado');
  const cargo=await Cargo.findOne({where:{cuotaExtraordinariaId:pid,casaId:cid},transaction:tx,lock:tx.LOCK.UPDATE});
  if(!cargo)throw fail(404,'Vivienda sin cargo en este proyecto');
  const [aportes,manuales,bancos]=await Promise.all([
   Aportacion.findAll({where:{cargoExtraordinarioId:cargo.id},transaction:tx}),
   PagoManualConcepto.findAll({where:{cargoExtraordinarioId:cargo.id},transaction:tx}),
   PagoReportado.findAll({where:{cargoExtraordinarioId:cargo.id,estatus:{[Op.in]:['VALIDADO','PENDIENTE_VALIDACION']}},transaction:tx})
  ]);
  const pagado=[...aportes,...manuales,...bancos].reduce((sum,a)=>sum+cents(a.monto),0);
  if(cents(nuevo)<pagado)throw fail(409,'La nueva cuota no puede ser menor al total ya recibido para esta vivienda.');
  const anterior=cents(cargo.monto);
  if(anterior===cents(nuevo))return {sinCambio:true,anterior:anterior/100,monto:nuevo};
  await cargo.update({monto:nuevo},{transaction:tx});
  await project.update({montoTotal:Math.round((Number(project.montoTotal||0)*100 + cents(nuevo)-anterior))/100,
   actualizadoEn:new Date()},{transaction:tx});
  await db.query("INSERT INTO proyectos_cuotas_auditoria (cuota_extraordinaria_id,casa_id,monto_anterior,monto_nuevo,usuario_id) VALUES (?,?,?,?,?)",
   {replacements:[pid,cid,anterior/100,nuevo,admin],transaction:tx});
  return {proyectoId:pid,casaId:cid,anterior:anterior/100,monto:nuevo};
 });
}

async function ajustarCuotasProyecto(proyectoId,input,actor){
 const pid=Number(proyectoId),admin=Number(actor),base=cents(input?.cuotaBase);
 if(!Number.isSafeInteger(pid)||pid<1||!Number.isSafeInteger(admin)||admin<1||base<=0)
  throw fail(400,'Proyecto, administrador o cuota general inválidos.');
 const excepciones=input?.excepciones||[];
 if(!Array.isArray(excepciones)||excepciones.length>231)throw fail(400,'Lista de excepciones inválida.');
 const overrides=new Map();
 for(const item of excepciones){
  const cid=Number(item?.casaId),amount=cents(item?.monto);
  if(!Number.isSafeInteger(cid)||cid<1||amount<=0||overrides.has(cid))
   throw fail(400,'Hay una excepción duplicada o una tarifa inválida.');
  overrides.set(cid,amount);
 }
 return db.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.SERIALIZABLE},async tx=>{
  const project=await Proyecto.findOne({where:{id:pid,activo:true},transaction:tx,lock:tx.LOCK.UPDATE});
  if(!project)throw fail(404,'Proyecto no encontrado');
  const padron=await padronOficial(tx);
  const cargos=await Cargo.findAll({where:{cuotaExtraordinariaId:pid},transaction:tx,lock:tx.LOCK.UPDATE});
  const authorized=new Set(padron.map(h=>Number(h.id)));
  if(cargos.length!==231||new Set(cargos.map(c=>Number(c.casaId))).size!==231||
    cargos.some(c=>!authorized.has(Number(c.casaId)))||
    [...overrides.keys()].some(id=>!authorized.has(id)))
   throw fail(409,'Los cargos del proyecto no coinciden con el padrón actual de 231 viviendas.');
  const ids=cargos.map(c=>c.id);
  const [historicos,manuales,bancarios]=await Promise.all([
   Aportacion.findAll({where:{cargoExtraordinarioId:{[Op.in]:ids}},transaction:tx}),
   PagoManualConcepto.findAll({where:{cargoExtraordinarioId:{[Op.in]:ids},tipoPago:'EXTRAORDINARIO'},transaction:tx}),
   PagoReportado.findAll({where:{cargoExtraordinarioId:{[Op.in]:ids},tipoPago:'EXTRAORDINARIO',
    estatus:{[Op.in]:['VALIDADO','PENDIENTE_VALIDACION']}},transaction:tx})
  ]);
  const reservado=new Map();
  for(const r of [...historicos,...manuales,...bancarios]){
   const id=String(r.cargoExtraordinarioId);
   reservado.set(id,(reservado.get(id)||0)+cents(r.monto));
  }
  let total=0,cambios=0;
  for(const cargo of cargos){
   const amount=overrides.get(Number(cargo.casaId))??base,anterior=cents(cargo.monto);
   if(amount<(reservado.get(String(cargo.id))||0))
    throw fail(409,'La cuota de vivienda '+cargo.casaId+' es menor a lo ya aportado o en validación. No se cambió nada.');
   total+=amount;
   if(amount===anterior)continue;
   await cargo.update({monto:amount/100},{transaction:tx});
   await db.query('INSERT INTO proyectos_cuotas_auditoria (cuota_extraordinaria_id,casa_id,monto_anterior,monto_nuevo,usuario_id) VALUES (?,?,?,?,?)',
    {replacements:[pid,cargo.casaId,anterior/100,amount/100,admin],transaction:tx});
   cambios++;
  }
  await project.update({monto:base/100,montoTotal:total/100,actualizadoEn:new Date()},{transaction:tx});
  return {proyectoId:pid,viviendas:231,cambios,metaTotal:total/100,excepciones:overrides.size};
 });
}

module.exports={juntar,leerProyectos,previsualizar,crearLote,crearProyecto,ajustarCuota,ajustarCuotasProyecto};
