const {Op}=require('sequelize');
const Cuota=require('../models/Cuota');
const ZkTarjeta=require('../models/ZkTarjeta');
const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

async function guardarInventario(usuarios=[]){
 let procesados=0;
 for(const u of usuarios){
  if(!u.numeroTarjeta)continue;
  await ZkTarjeta.upsert({
   numeroTarjeta:String(u.numeroTarjeta).trim(),
   pinDispositivo:u.pin?String(u.pin):null,
   departamento:u.departamento||null,
   fechaInicio:u.fechaInicio||null,
   fechaFin:u.fechaFin||null,
   ultimaLectura:new Date()
  });
  procesados++;
 }
 return procesados;
}

async function simularCorte(fecha=new Date()){
 const anio=fecha.getFullYear(),mes=MESES[fecha.getMonth()];
 const tarjetas=await ZkTarjeta.findAll({where:{casaId:{[Op.ne]:null}}});
 const ids=[...new Set(tarjetas.map(t=>Number(t.casaId)))];
 const cuotas=ids.length?await Cuota.findAll({where:{casaId:{[Op.in]:ids},anio,mes}}):[];
 const map=new Map(cuotas.map(c=>[Number(c.casaId),c]));
 let conservar=0,sinPago=0;
 const detalle=[];
 for(const t of tarjetas){
  const cuota=map.get(Number(t.casaId));
  const alCorriente=Boolean(cuota&&['PAGADO','CONDONADO'].includes(cuota.estatusPago));
  alCorriente?conservar++:sinPago++;
  detalle.push({casaId:t.casaId,numeroTarjeta:t.numeroTarjeta,estatusPago:cuota?.estatusPago||'SIN_CUOTA',accionSugerida:alCorriente?'CONSERVAR':'SUSPENDER'});
 }
 return{anio,mes,soloSimulacion:true,tarjetas:tarjetas.length,conservar,sinPago,detalle};
}
module.exports={guardarInventario,simularCorte};
