'use strict';
// Recibos independientes del módulo de cuotas: NO SE IMPORTA Cuota,
// PagoReportado, finanzas-live-signal, Excel ni los servicios ZKTeco.
const { randomBytes, randomUUID } = require('node:crypto');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { fechaMexico } = require('./vigencia-calculo');

const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const ABREV=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const error=(status,message)=>Object.assign(new Error(message),{status});
const qTable = `CREATE TABLE IF NOT EXISTS recibos_manuales (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 folio VARCHAR(70) NOT NULL UNIQUE,
 referencia VARCHAR(80) NOT NULL UNIQUE,
 casa_id INT UNSIGNED NULL,
 calle VARCHAR(100) NOT NULL,
 inicial_calle CHAR(1) NOT NULL,
 numero_casa VARCHAR(20) NOT NULL,
 nombre VARCHAR(150) NOT NULL,
 mes_folio TINYINT UNSIGNED NOT NULL,
 anio_folio SMALLINT UNSIGNED NOT NULL,
 concepto_pago VARCHAR(150) NOT NULL,
 mes_cubierto TINYINT UNSIGNED NOT NULL,
 anio_cubierto SMALLINT UNSIGNED NOT NULL,
 concepto_detalle VARCHAR(120) NOT NULL,
 monto INT UNSIGNED NOT NULL,
 forma_pago ENUM('EFECTIVO','TRANSFERENCIA') NOT NULL,
 sello VARCHAR(100) NOT NULL,
 fecha_emision DATE NOT NULL,
 creado_por_usuario_id INT UNSIGNED NOT NULL,
 creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX idx_recibos_manuales_creado (creado_en,id),
 INDEX idx_recibos_manuales_casa (casa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
let provision;
async function tablaLista(){
 if(!provision)provision=sequelize.query(qTable).catch(e=>{provision=null;throw e;});
 return provision;
}
function campo(value,name,max){
 if(typeof value!=='string')throw error(400,'Revisa '+name);
 const s=value.replace(/\s+/g,' ').trim();
 if(!s || s.length>max || /[\x00-\x1F\x7F]/.test(s))
  throw error(400,'Revisa '+name+' (1 a '+max+' caracteres)');
 return s;
}
function entero(value,name,min,max){
 const raw=String(value??'');
 if(!/^\d{1,9}$/.test(raw))throw error(400,'Revisa '+name);
 const n=Number(raw);
 if(!Number.isSafeInteger(n)||n<min||n>max)throw error(400,'Revisa '+name);
 return n;
}
function validar(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw error(400,'Datos inválidos');
 const mesFolio=entero(input.mesFolio,'mes del folio',1,12);
 const anioFolio=entero(input.anioFolio,'año del folio',2000,2100);
 const mesCubierto=entero(input.mesCubierto,'mes cubierto',1,12);
 const anioCubierto=entero(input.anioCubierto,'año cubierto',2000,2100);
 const calle=campo(input.calle,'calle',100);
 const inicialCalle=campo(input.inicialCalle,'inicial de calle',1).toUpperCase();
 if(!/^[A-Z]$/.test(inicialCalle))throw error(400,'La inicial de la calle debe ser una letra A-Z');
 const numeroCasa=campo(input.numeroCasa,'número de casa',20).toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9-]{0,19}$/.test(numeroCasa))throw error(400,'Número de casa inválido');
 const nombre=campo(input.nombre,'nombre del recibo',150);
 const conceptoPago=campo(input.conceptoPago,'concepto del pago',150);
 const conceptoDetalle=campo(input.conceptoDetalle,'detalle del pago',120);
 const monto=entero(input.monto,'importe recibido (pesos completos)',1,999999999);
 const formaPago=campo(input.formaPago,'forma de pago',20).toUpperCase();
 if(!['EFECTIVO','TRANSFERENCIA'].includes(formaPago))throw error(400,'Forma de pago inválida');
 const sello=campo(input.sello,'sello',100).toUpperCase();
 if(!/^PAGADO(?:\b|$)/.test(sello))throw error(400,'El sello debe comenzar con PAGADO');
 let casaId=null;
 if(input.casaId!==null&&input.casaId!==undefined&&input.casaId!=='')
  casaId=entero(input.casaId,'ID de vivienda',1,2147483647);
 return {mesFolio,anioFolio,mesCubierto,anioCubierto,calle,inicialCalle,
  numeroCasa,nombre,conceptoPago,conceptoDetalle,monto,formaPago,sello,casaId};
}
function folioDe(fields,randomHex){
 return 'MJ-'+ABREV[fields.mesFolio-1]+'-'+fields.anioFolio+'-'+
  randomHex+'-'+fields.inicialCalle+fields.numeroCasa+'-M';
}
function publico(row){
 return {
  id:Number(row.id),folio:row.folio,referencia:row.referencia,
  casaId:row.casa_id==null?null:Number(row.casa_id),
  calle:row.calle,inicialCalle:row.inicial_calle,numeroCasa:row.numero_casa,
  nombre:row.nombre,mesFolio:Number(row.mes_folio),anioFolio:Number(row.anio_folio),
  conceptoPago:row.concepto_pago,mesCubierto:Number(row.mes_cubierto),
  anioCubierto:Number(row.anio_cubierto),mesTexto:MESES[Number(row.mes_cubierto)-1],
  conceptoDetalle:row.concepto_detalle,monto:Number(row.monto),
  formaPago:row.forma_pago,sello:row.sello,
  fechaEmision:String(row.fecha_emision).slice(0,10),
  creadoEn:row.creado_en
 };
}
async function crear(payload,usuarioId){
 const value=validar(payload);
 const usuario=entero(usuarioId,'usuario autenticado',1,2147483647);
 await tablaLista();
 for(let intento=0;intento<3;intento++){
  const folio=folioDe(value,randomBytes(5).toString('hex').toUpperCase());
  const referencia='MJMANUAL:'+randomUUID();
  try{
   await sequelize.query(`INSERT INTO recibos_manuales
   (folio,referencia,casa_id,calle,inicial_calle,numero_casa,nombre,
    mes_folio,anio_folio,concepto_pago,mes_cubierto,anio_cubierto,
    concepto_detalle,monto,forma_pago,sello,fecha_emision,creado_por_usuario_id)
   VALUES (:folio,:referencia,:casaId,:calle,:inicialCalle,:numeroCasa,:nombre,
    :mesFolio,:anioFolio,:conceptoPago,:mesCubierto,:anioCubierto,
    :conceptoDetalle,:monto,:formaPago,:sello,:fecha,:usuario)`,{
    type:QueryTypes.INSERT,replacements:{
     ...value,folio,referencia,fecha:fechaMexico(),usuario
    }
   });
   return (await sequelize.query(
    'SELECT * FROM recibos_manuales WHERE folio = :folio LIMIT 1',
    {replacements:{folio},type:QueryTypes.SELECT}
   )).map(publico)[0];
  }catch(e){
   if(e.parent?.code==='ER_DUP_ENTRY'||e.original?.code==='ER_DUP_ENTRY')continue;
   throw e;
  }
 }
 throw error(503,'No se pudo generar un folio único. Reintenta.');
}
async function listar(limit=30,offset=0){
 await tablaLista();
 const rows=await sequelize.query(
  'SELECT * FROM recibos_manuales ORDER BY id DESC LIMIT :limite OFFSET :desplazamiento',
  {replacements:{limite:limit,desplazamiento:offset},type:QueryTypes.SELECT}
 );
 return rows.map(publico);
}
async function buscar(id){
 await tablaLista();
 const rows=await sequelize.query('SELECT * FROM recibos_manuales WHERE id=:id LIMIT 1',{
  replacements:{id:entero(id,'recibo',1,999999999)},type:QueryTypes.SELECT
 });
 if(!rows.length)throw error(404,'No se encontró el recibo manual');
 return publico(rows[0]);
}
module.exports={MESES,ABREV,folioDe,validar,crear,listar,buscar,publico,tablaLista};
