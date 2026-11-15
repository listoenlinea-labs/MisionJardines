'use strict';
const {Op}=require('sequelize');
const Reserva=require('../models/ReservaCasaClub');
const {Casa}=require('../models');
const rojas=require('../services/casa-club-tarjetas-rojas.service');
module.exports=async function detalleFecha(req,res){
 const fecha=String(req.params.fecha||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||Number.isNaN(Date.parse(fecha+'T12:00:00Z'))||
 new Date(fecha+'T12:00:00Z').toISOString().slice(0,10)!==fecha)
  return res.status(400).json({ok:false,message:'Fecha inválida'});
 try{
  const rows=await Reserva.findAll({where:{fecha},order:[['id','DESC']],limit:100});
  const ids=[...new Set(rows.map(r=>Number(r.casaId)).filter(Boolean))];
  const casas=ids.length?await Casa.findAll({where:{id:{[Op.in]:ids}},attributes:['id','calle','calleCorrecta','numero','nombre']}):[];
  const mapa=new Map(casas.map(c=>[Number(c.id),c]));
  const tarjetas=new Map(await Promise.all(ids.map(async id=>[id,await rojas.obtener(id,{historial:true})])));
  res.setHeader('Cache-Control','private, no-store');
  return res.json({ok:true,data:rows.map(r=>{
   const c=mapa.get(Number(r.casaId)),t=tarjetas.get(Number(r.casaId));
   return {id:r.id,fecha:r.fecha,estatus:r.estatus,solicitante:r.solicitante,
    propietario:c?.nombre||null,casa:c?{calle:c.calleCorrecta||c.calle,numero:c.numero}:null,
    pagado:Boolean(r.pagado),creadoEn:r.creadoEn,observaciones:r.notas||null,
    tarjetas:t?{totalActivas:t.totalActivas,totalHistoricas:t.tarjetas.length,
     bloqueada:t.bloqueada,bloqueadoHasta:t.bloqueadoHasta,
     historial:t.tarjetas.map(x=>({id:x.id,motivo:x.motivo,asignadaEn:x.asignadaEn,retiradaEn:x.retiradaEn,activa:x.activa}))}:null};
  })});
 }catch(e){console.error('[Casa Club][detalle fecha]',e);return res.status(503).json({ok:false,message:'No fue posible consultar el detalle de la fecha.'});}
};
