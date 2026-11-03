'use strict';
const {Op}=require('sequelize');
const {Casa,CuotaExtraordinaria,CargoExtraordinario,AportacionExtraordinaria,PagoManualConcepto,PagoReportado}=require('../models');
const {folioRecibo}=require('./recibo-mantenimiento-analisis.service');
const fail=(status,message)=>Object.assign(new Error(message),{status});
function proyectoValido(value){
 const id=Number(value);
 if(!Number.isSafeInteger(id)||id<1)throw fail(400,'Selecciona un proyecto válido');
 return id;
}
async function movimientosProyecto(value){
 const pid=proyectoValido(value);
 const project=await CuotaExtraordinaria.findOne({where:{id:pid,activo:true},
  attributes:['id','codigo','concepto','fechaInicio']});
 if(!project)throw fail(404,'Proyecto extraordinario no encontrado');
 const cargos=await CargoExtraordinario.findAll({where:{cuotaExtraordinariaId:pid},
  attributes:['id','casaId','monto']});
 if(!cargos.length)return {project,cargos,items:[]};
 const ids=cargos.map(c=>c.id);
 const [aportaciones,manuales,bancarios]=await Promise.all([
  AportacionExtraordinaria.findAll({where:{cargoExtraordinarioId:{[Op.in]:ids}},
   attributes:['cargoExtraordinarioId','casaId','monto','fecha','referencia','formaPago','origen']}),
  PagoManualConcepto.findAll({where:{cargoExtraordinarioId:{[Op.in]:ids},tipoPago:'EXTRAORDINARIO'},
   attributes:['cargoExtraordinarioId','casaId','monto','creadoEn','referencia','formaPago']}),
  PagoReportado.findAll({where:{cargoExtraordinarioId:{[Op.in]:ids},tipoPago:'EXTRAORDINARIO',estatus:'VALIDADO'},
   attributes:['cargoExtraordinarioId','casaId','monto','fechaOperacion','folioOperacion','folioReporte']})
 ]);
 const items=[];
 for(const a of aportaciones)items.push({casaId:Number(a.casaId),cargoId:Number(a.cargoExtraordinarioId),
  referencia:String(a.referencia||''),fecha:a.fecha,monto:Number(a.monto),formaPago:a.formaPago||'OTRO',origen:a.origen||'HISTORICO'});
 for(const a of manuales)items.push({casaId:Number(a.casaId),cargoId:Number(a.cargoExtraordinarioId),
  referencia:String(a.referencia||''),fecha:a.creadoEn,monto:Number(a.monto),formaPago:a.formaPago||'OTRO',origen:'ADMIN'});
 for(const a of bancarios)items.push({casaId:Number(a.casaId),cargoId:Number(a.cargoExtraordinarioId),
  referencia:String(a.folioOperacion||a.folioReporte||''),fecha:a.fechaOperacion,monto:Number(a.monto),formaPago:'TRANSFERENCIA',origen:'BANCO'});
 return {project,cargos,items:items.filter(x=>x.referencia&&Number(x.monto)>0)};
}
async function consultarPago(casaId,proyectoId,referencia=null){
 const cid=Number(casaId);
 if(!Number.isSafeInteger(cid)||cid<1)throw fail(400,'Vivienda inválida');
 const casa=await Casa.findByPk(cid,{attributes:['id','calle','calleCorrecta','numero','nombre','telefono']});
 if(!casa)throw fail(404,'Vivienda no encontrada');
 const {project,cargos,items}=await movimientosProyecto(proyectoId);
 const cargo=cargos.find(c=>Number(c.casaId)===cid);
 if(!cargo)throw fail(404,'La vivienda no pertenece a ese proyecto');
 const pagos=items.filter(x=>x.casaId===cid&&x.cargoId===Number(cargo.id))
  .sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha))||a.referencia.localeCompare(b.referencia));
 const chosen=referencia==null?pagos.at(-1):pagos.find(x=>x.referencia.toLowerCase()===String(referencia).trim().toLowerCase());
 if(!chosen)throw fail(409,'No existe aportación confirmada para el movimiento seleccionado');
 const fecha=String(chosen.fecha||'').slice(0,10);
 if(!/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(fecha))throw fail(409,'El abono no tiene fecha válida');
 const total=pagos.slice(0,pagos.indexOf(chosen)+1).reduce((n,p)=>n+Math.round(Number(p.monto)*100),0);
 const sello=total>=Math.round(Number(cargo.monto)*100)?'META ALCANZADA':'ABONO RECIBIDO';
 const calle=casa.calleCorrecta||casa.calle;
 const folio=folioRecibo({calle,numero:casa.numero,periodo:fecha.slice(0,7),referencia:chosen.referencia,tipo:'PROYECTO'});
 const recibo={folio,tipo:'EXTRAORDINARIO',conceptoProyecto:project.concepto,fechaPago:fecha,
  nombrePagador:casa.nombre||'Residente',calleSnapshot:calle,numeroCasaSnapshot:casa.numero,
  mes:fecha,montoPagado:Number(chosen.monto),formaPago:chosen.formaPago,
  referencia:chosen.referencia,sello};
 return {casa,recibo,resumen:{casaId:cid,proyectoId:Number(proyectoId),concepto:project.concepto,
  calle,numero:casa.numero,nombre:recibo.nombrePagador,folio,fechaPago:fecha,monto:Number(chosen.monto),
  referencia:chosen.referencia,formaPago:chosen.formaPago,sello,periodo:fecha,
  periodosDisponibles:[],periodoSeleccionado:null}};
}
module.exports={proyectoValido,movimientosProyecto,consultarPago};
