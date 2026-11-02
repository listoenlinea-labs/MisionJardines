'use strict';
// Reversión contable con instantánea original y orden C3 durable.
// Nunca afirma que el TAG cambió físicamente hasta que lo confirme el worker.
const {randomUUID}=require('crypto');
const sequelize=require('../config/database');
const {Casa,Cuota,ZkTarjeta}=require('../models');
const Evento=require('../models/PagoAccesoC3');
const EventoTag=require('../models/PagoAccesoTagC3');
const {fechaDesdeCuotas}=require('./cuotas-mantenimiento-calculo');
const {solicitar}=require('./zkteco-vigencias.service');
const meses=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const fail=(status,message)=>Object.assign(new Error(message),{status});
const refValida=ref=>/^MJMAN:\d{4}-(?:0[1-9]|1[0-2])-10:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(ref||''));
async function asegurarTablas(){
 await sequelize.query(`CREATE TABLE IF NOT EXISTS pagos_cuotas_antes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  casa_id INT UNSIGNED NOT NULL, referencia VARCHAR(150) NOT NULL,
  cuota_id BIGINT UNSIGNED NOT NULL, datos_anteriores JSON NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_restauracion_cuota (casa_id,referencia,cuota_id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 await sequelize.query(`CREATE TABLE IF NOT EXISTS pagos_anulaciones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  casa_id INT UNSIGNED NOT NULL, referencia VARCHAR(150) NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL, fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_objetivo DATE NULL, detalle JSON NOT NULL,
  UNIQUE KEY uq_anulacion (casa_id,referencia)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}
async function guardarInstantanea(casaId,referencia,cuota,anterior,transaction){
 await sequelize.query('INSERT INTO pagos_cuotas_antes (casa_id,referencia,cuota_id,datos_anteriores) VALUES (?,?,?,?)',
 {replacements:[casaId,referencia,cuota.id,anterior?JSON.stringify(anterior):null],transaction});
}
function indice(c){return Number(c.anio)*12+meses.indexOf(String(c.mes).toUpperCase());}
async function preparar(casaId,referencia,transaction){
 if(!Number.isSafeInteger(Number(casaId))||Number(casaId)<1||!refValida(referencia))
  throw fail(400,'Vivienda o referencia inválida');
 const casa=await Casa.findByPk(casaId,{transaction,...(transaction?{lock:transaction.LOCK.UPDATE}:{})});
 if(!casa)throw fail(404,'Vivienda no encontrada');
 const cuotas=await Cuota.findAll({where:{casaId},transaction,...(transaction?{lock:transaction.LOCK.UPDATE}:{})});
 const elegidas=cuotas.filter(c=>c.referencia===referencia&&['MANUAL_ANALISIS','MANUAL_ANALISIS_ANUAL'].includes(c.origenImportacion));
 if(!elegidas.length||elegidas.some(c=>Number(c.montoPagado)<=0||c.estatusPago!=='PAGADO'))
  throw fail(409,'El movimiento ya no es un pago manual confirmado o fue modificado');
 if(cuotas.some(c=>!elegidas.includes(c)&&Number(c.montoPagado)>0&&indice(c)>Math.max(...elegidas.map(indice))))
  throw fail(409,'Existen períodos posteriores pagados; anula primero el movimiento más reciente');
 const eventos=await Evento.findAll({where:{casaId,referencia,origen:'CUOTA'},transaction,...(transaction?{lock:transaction.LOCK.UPDATE}:{})});
 if(eventos.length!==1||eventos[0].estado==='ANULADO')throw fail(409,'No se encontró un único movimiento C3 activo para esta referencia');
 const evento=eventos[0];
 const posteriores=await Evento.findAll({where:{casaId},transaction});
 if(posteriores.some(e=>e.id>evento.id&&e.estado!=='ANULADO'&&e.origen!=='REVERSA'))
  throw fail(409,'Hay movimientos de acceso posteriores; requiere conciliación antes de anular');
 const [rows]=await sequelize.query('SELECT cuota_id,datos_anteriores FROM pagos_cuotas_antes WHERE casa_id=? AND referencia=?',
  {replacements:[casaId,referencia],transaction});
 const antes=new Map(rows.map(r=>[String(r.cuota_id),r.datos_anteriores]));
 const decisiones=elegidas.map(c=>{
  if(antes.has(String(c.id)))return {cuota:c,original:typeof antes.get(String(c.id))==='string'?JSON.parse(antes.get(String(c.id))):antes.get(String(c.id))};
  // Antes de instalar las instantáneas: SOLO deshacer filas creadas por la captura manual.
  // Si se sobreescribió una cuota antigua, NO inventar el valor histórico anterior.
  const fechaAlta=new Date(c.creadoEn).getTime(),fechaPago=new Date(c.fechaConfirmacion).getTime();
  const nueva=Number.isFinite(fechaAlta)&&Number.isFinite(fechaPago)&&Math.abs(fechaAlta-fechaPago)<60000 &&
   !/referencia hist[oó]rica previa:|folio hist[oó]rico previo:/i.test(c.observaciones||'');
  if(!nueva)throw fail(409,'La cuota '+c.mes+' '+c.anio+' fue sobrescrita sin instantánea anterior. No puede restablecerse automáticamente; requiere conciliación SQL con respaldo.');
  return {cuota:c,original:null};
 });
 const extras=cuotas.filter(c=>!elegidas.includes(c)&&antes.has(String(c.id))).map(c=>({
  cuota:c,original:typeof antes.get(String(c.id))==='string'?JSON.parse(antes.get(String(c.id))):antes.get(String(c.id))
 }));
 if(extras.some(d=>!d.original))throw fail(409,'Instantánea de conciliación incompleta');
 const restauradas=cuotas.filter(c=>!elegidas.includes(c)&&!extras.some(d=>d.cuota.id===c.id))
   .concat(decisiones.filter(d=>d.original).map(d=>d.original),extras.map(d=>d.original));
 const fechaObjetivo=fechaDesdeCuotas(restauradas);
 const tags=await ZkTarjeta.findAll({where:{casaId},transaction});
 if(tags.length&&!/^\d{4}-\d\d-\d\d$/.test(String(fechaObjetivo||'')))
  throw fail(409,'No se pudo calcular la vigencia previa de los TAGs a partir de cuotas confirmadas');
 return {casa,cuotas:decisiones,extras,evento,fechaObjetivo,tags};
}
async function vistaPrevia(casaId,referencia){
 const x=await preparar(Number(casaId),referencia);
 return {casaId:Number(casaId),referencia,periodos:x.cuotas.map(d=>d.cuota.mes+' '+d.cuota.anio),
  importe:x.cuotas.reduce((s,d)=>s+Number(d.cuota.montoPagado),0),fechaObjetivo:x.fechaObjetivo,
  tags:x.tags.length,estadoC3:x.evento.estado,
  advertencia:'El ajuste contable es inmediato; el C3 se restaura de forma asíncrona y exige verificación física.'};
}
async function anular(casaId,referencia,usuarioId){
 const resultado=await sequelize.transaction(async transaction=>{
  const x=await preparar(Number(casaId),referencia,transaction);
  // Archivo de auditoría: un movimiento no se borra sin dejar constancia.
  const detalle=[...x.cuotas,...x.extras].map(d=>({cuota:d.cuota.get({plain:true}),anterior:d.original}));
  await sequelize.query('INSERT INTO pagos_anulaciones (casa_id,referencia,usuario_id,fecha_objetivo,detalle) VALUES (?,?,?,?,?)',
   {replacements:[casaId,referencia,usuarioId,x.fechaObjetivo||null,JSON.stringify({cuotas:detalle,evento:x.evento.get({plain:true})})],transaction});
  // Excluir la orden antigua de la cola ANTES de crear una nueva orden.
  await x.evento.update({estado:'ANULADO',proximoIntento:null,error:'Anulado administrativamente. Reversión de cuotas '+referencia},{transaction});
  for(const d of x.cuotas){
   if(d.original){
    const original={...d.original};
    delete original.id;delete original.casaId;
    await d.cuota.update(original,{transaction});
   }else await d.cuota.destroy({transaction});
  }
  for(const d of x.extras){const original={...d.original};delete original.id;delete original.casaId;await d.cuota.update(original,{transaction});}
  let reparacion=null;
  if(x.tags.length){
   const estado='PENDIENTE';
   const evento=await Evento.create({casaId,claveMovimiento:'REVERSA:'+randomUUID(),
    origen:'REVERSA',origenId:x.evento.id,referencia:'REVERSA:'+referencia,
    montoOrigen:0,recargoOrigen:0,principalMovimiento:0,principalAplicado:0,
    fechaObjetivo:x.fechaObjetivo,meses:0,saldoAntes:0,saldoDespues:0,
    usuarioId,estado},{transaction});
   for(const tag of x.tags)await EventoTag.create({pagoAccesoId:evento.id,tarjetaId:tag.id,
    numeroTarjeta:tag.numeroTarjeta},{transaction});
   reparacion={id:evento.id,estado};
   transaction.afterCommit(()=>solicitar(Number(casaId)));
  }
  return {casaId,referencia,periodosRestaurados:x.cuotas.length,conciliacionesRestauradas:x.extras.length,fechaObjetivo:x.fechaObjetivo,
   restauracionC3:reparacion||{estado:'SIN_TAGS'}};
 });
 return resultado;
}
module.exports={asegurarTablas,guardarInstantanea,vistaPrevia,anular,refValida};
