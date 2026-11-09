'use strict';
// Etiqueta contable: identifica un movimiento excepcional real SIN cambiar
// el estado PENDIENTE ni convertirlo en mensualidad regularizada.
const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const indice=(y,m)=>Number(y)*12+MESES.indexOf(String(m||'').toUpperCase());
function ultimoAbonoConAdeudo(cuotas=[],anio,mes,saldoPendiente=0){
  if(!(Number(saldoPendiente)>0))return null; // Ya no es moroso.
  const limite=Number(anio)*12+Number(mes)-1;
  const candidatos=cuotas.filter(c=>
    c.origenImportacion==='MANUAL_ABONO_ADEUDO' &&
    Number(c.montoPagado)>0 && String(c.estatusPago).toUpperCase()!=='CANCELADO' &&
    MESES.includes(String(c.mes||'').toUpperCase()) &&
    Number.isInteger(Number(c.anio)) && indice(c.anio,c.mes)<=limite &&
    typeof c.referencia==='string' && c.referencia.startsWith('MJABONO:'));
  candidatos.sort((a,b)=>indice(b.anio,b.mes)-indice(a.anio,a.mes));
  const c=candidatos[0];
  if(!c)return null;
  return {anio:Number(c.anio),mes:String(c.mes).toUpperCase(),
    monto:Number(c.montoPagado),fecha:c.fechaConfirmacion||c.fechaPago||null,
    referencia:c.referencia};
}
module.exports={ultimoAbonoConAdeudo};
