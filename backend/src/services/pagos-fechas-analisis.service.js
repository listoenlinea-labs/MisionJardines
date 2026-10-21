'use strict';
const {historialMantenimiento,historialConcepto}=require('./historial-pagos-vivienda.service');

// Reutiliza la conciliación del historial: un depósito que cubre varios meses
// se muestra una vez. La fecha bancaria prevalece sobre la de validación.
function pagosFechasAnalisis({viviendas,cuotas,comprobantes,manuales}){
 const agrupar=rows=>{
  const result=new Map();
  for(const row of rows){const id=String(row.casaId);if(!result.has(id))result.set(id,[]);result.get(id).push(row);}
  return result;
 };
 const porCuota=agrupar(cuotas),porBanco=agrupar(comprobantes),porManual=agrupar(manuales);
 const result=[];
 for(const h of viviendas){
  const id=String(h.casaId),bancos=porBanco.get(id)||[];
  const fechas=new Map();
  for(const p of bancos){
   if(p.estatus!=='VALIDADO'||!p.fechaOperacion)continue;
   for(const ref of [p.folioOperacion,p.folioReporte].filter(Boolean))
    fechas.set(p.tipoPago+':'+String(ref).trim().toLowerCase(),{fecha:p.fechaOperacion,hora:p.horaOperacion||null});
  }
  for(const tipo of ['MANTENIMIENTO','EXTRAORDINARIO','CASA_CLUB']){
   const history=tipo==='MANTENIMIENTO'
    ?historialMantenimiento((porCuota.get(id)||[]).map(c=>({...((typeof c.toJSON==='function')?c.toJSON():c),fechaConfirmacion:c.fechaPago||c.fechaConfirmacion})),bancos)
    :historialConcepto(tipo,bancos,porManual.get(id)||[]);
   for(const p of history){
    const banco=fechas.get(tipo+':'+String(p.referencia||'').trim().toLowerCase());
    const fecha=banco?.fecha||p.fecha;
    result.push({...p,fecha:fecha instanceof Date?fecha.toISOString():fecha||null,
     hora:banco?.hora||null,tipoPago:tipo,casaId:h.casaId,calle:h.calle,numero:h.numero,nombre:h.nombre});
   }
  }
 }
 return result;
}
module.exports={pagosFechasAnalisis};
