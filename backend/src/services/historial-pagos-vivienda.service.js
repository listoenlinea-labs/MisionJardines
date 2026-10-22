'use strict';

// Un pago que cubre varios meses se almacena en cuotas como varios renglones
// con la MISMA referencia. La tabla debe mostrar el movimiento completo, no
// únicamente la mensualidad del periodo financiero consultado.
const MONTHS=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const cents=value=>Math.round(Number(value||0)*100);
const isoDate=value=>value instanceof Date?value.toISOString():value?String(value):null;
const latest=(a,b)=>!a?b:!b?a:String(a)>=String(b)?a:b;

function historialMantenimiento(cuotas=[],comprobantes=[]){
  const groups=new Map();
  for(const c of cuotas){
    const paid=cents(c.montoPagado);
    if(paid<=0||!['PAGADO','PAGO_PARCIAL'].includes(String(c.estatusPago||'').toUpperCase()))continue;
    const ref=String(c.referencia||c.folio||'').trim();
    const key=ref?'ref:'+ref.toLowerCase():'cuota:'+c.id;
    if(!groups.has(key))groups.set(key,{referencia:ref||null,fecha:null,montoCentavos:0,
      recargoCentavos:0,periodos:[],formaPago:c.formaPago||null,fuente:'CUOTA',pagoAnual:false});
    const item=groups.get(key);
    item.montoCentavos+=paid;
    item.recargoCentavos+=Math.max(0,cents(c.recargo));
    item.fecha=latest(item.fecha,isoDate(c.fechaConfirmacion||c.fechaPago));
    const mm=MONTHS.indexOf(String(c.mes||'').toUpperCase());
    if(mm>=0)item.periodos.push({mes:MONTHS[mm],anio:Number(c.anio),monto:paid/100});
    if(String(c.origenImportacion||'').startsWith('MANUAL_ANALISIS'))item.fuente='REGISTRO_MANUAL';
    if(c.origenImportacion==='MANUAL_ANALISIS_ANUAL')item.pagoAnual=true;
  }
  for(const p of comprobantes){
    if(p.tipoPago!=='MANTENIMIENTO'||p.estatus!=='VALIDADO')continue;
    const ref=String(p.folioOperacion||p.folioReporte||'').trim();
    const keys=[p.folioOperacion,p.folioReporte].filter(Boolean).map(x=>'ref:'+String(x).trim().toLowerCase());
    let key=keys.find(x=>groups.has(x));
    if(!key)key=ref?'ref:'+ref.toLowerCase():'banco:'+p.id;
    if(!groups.has(key))groups.set(key,{referencia:ref||null,fecha:null,montoCentavos:0,
      recargoCentavos:0,periodos:[],formaPago:'TRANSFERENCIA',fuente:'COMPROBANTE_VALIDADO',pagoAnual:false});
    const item=groups.get(key);
    // Si las cuotas ya reflejan el depósito, NO sumar el comprobante dos veces.
    item.montoCentavos=Math.max(item.montoCentavos,cents(p.monto));
    item.recargoCentavos=Math.max(item.recargoCentavos,cents(p.recargo));
    item.fecha=latest(item.fecha,isoDate(p.fechaOperacion));
  }
  return [...groups.values()].map(item=>({
    referencia:item.referencia,fecha:item.fecha,monto:item.montoCentavos/100,
    recargo:item.recargoCentavos/100,meses:item.periodos.length,
    periodos:item.periodos.sort((a,b)=>a.anio-b.anio||MONTHS.indexOf(a.mes)-MONTHS.indexOf(b.mes)),
    formaPago:item.formaPago,fuente:item.fuente,pagoAnual:item.pagoAnual
  })).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))||
    String(b.referencia||'').localeCompare(String(a.referencia||'')));
}

function historialConcepto(tipo,comprobantes=[],manuales=[]){
  const rows=[];
  for(const p of comprobantes){
    if(p.tipoPago!==tipo||p.estatus!=='VALIDADO')continue;
    rows.push({referencia:p.folioOperacion||p.folioReporte,fecha:isoDate(p.fechaOperacion),
      monto:Number(p.monto),recargo:Number(p.recargo||0),meses:0,periodos:[],
      formaPago:'TRANSFERENCIA',fuente:'COMPROBANTE_VALIDADO'});
  }
  for(const p of manuales){
    if(p.tipoPago!==tipo)continue;
    rows.push({referencia:p.referencia,fecha:isoDate(p.creadoEn),monto:Number(p.monto),
      recargo:0,meses:0,periodos:[],formaPago:p.formaPago,fuente:'REGISTRO_MANUAL'});
  }
  return rows.sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))||
    String(b.referencia||'').localeCompare(String(a.referencia||'')));
}

module.exports={historialMantenimiento,historialConcepto};
