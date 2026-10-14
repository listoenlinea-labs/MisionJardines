'use strict';
const { Casa, Cuota } = require('../models');
const { filtrarViviendasVisibles } = require('../services/viviendas-visibles.service');
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const indexMonth = new Map(MESES.map((name,i)=>[name,i+1]));
const numeric = (a,b) => String(a).localeCompare(String(b),'es-MX',{numeric:true,sensitivity:'base'});
function resumenVivienda(casa, registros, fecha=new Date()) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',year:'numeric',month:'numeric'})
    .formatToParts(fecha);
  const year=Number(parts.find(p=>p.type==='year')?.value);
  const month=Number(parts.find(p=>p.type==='month')?.value);
  const periodo = year*12+month;
  let ultimo=null,fechaUltima=null,actual=false,pendienteAnterior=false,hayHistorico=false;
  for(const cuota of registros) {
    const m=indexMonth.get(String(cuota.mes||'').toUpperCase());
    const y=Number(cuota.anio);
    if(!m||!Number.isInteger(y))continue;
    const position=y*12+m;
    if(position>periodo)continue;
    hayHistorico=true;
    if(['PAGADO','PAGO_PARCIAL'].includes(cuota.estatusPago) && Number(cuota.montoPagado)>0){
      if(!ultimo||position>ultimo.position)ultimo={position,anio:y,mes:MESES[m-1]};
      const fp=cuota.fechaPago ? new Date(cuota.fechaPago) : null;
      if(fp && !Number.isNaN(fp.getTime()) && (!fechaUltima || fp>fechaUltima))fechaUltima=fp;
      if(position===periodo && cuota.estatusPago==='PAGADO')actual=true;
    }else if(['PENDIENTE','PAGO_PARCIAL'].includes(cuota.estatusPago)&&position<periodo){
      pendienteAnterior=true;
    }
  }
  let estado='SIN_DATOS';
  if(hayHistorico)estado=actual&&!pendienteAnterior?'AL_CORRIENTE':'DEUDOR';
  return {
    calle:String(casa.calleCorrecta||casa.calle||''),
    numero:String(casa.numero||''),
    estado,
    ultimaFechaPago:fechaUltima?fechaUltima.toISOString().slice(0,10):null,
    ultimoMesPagado:ultimo?ultimo.mes+' '+ultimo.anio:null
  };
}
async function consultar(req,res) {
  try {
    const pagina=Math.max(1,Math.min(10000,Number.parseInt(req.query.pagina,10)||1));
    const calle=String(req.query.calle||'').trim().toLocaleLowerCase('es-MX').slice(0,100);
    const numero=String(req.query.numero||'').trim().slice(0,20);
    const estado=String(req.query.estado||'').trim();
    if(estado&&!['AL_CORRIENTE','DEUDOR','SIN_DATOS'].includes(estado))return res.status(400).json({ok:false,message:'Estado inválido'});
    const [casas,cuotas]=await Promise.all([
      Casa.findAll({attributes:['id','calle','calleCorrecta','numero']}),
      Cuota.findAll({attributes:['casaId','anio','mes','estatusPago','fechaPago','montoPagado']})
    ]);
    const agrupadas=new Map();
    for(const cuota of cuotas){const key=String(cuota.casaId);if(!agrupadas.has(key))agrupadas.set(key,[]);agrupadas.get(key).push(cuota);}
    const rows=filtrarViviendasVisibles(casas).map(c=>resumenVivienda(c,agrupadas.get(String(c.id))||[]))
      .filter(c=>(!calle||c.calle.toLocaleLowerCase('es-MX').includes(calle))&&
        (!numero||c.numero.includes(numero))&&(!estado||c.estado===estado))
      .sort((a,b)=>numeric(a.calle,b.calle)||numeric(a.numero,b.numero));
    res.setHeader('Cache-Control','private, no-store');
    res.json({ok:true,periodo:new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',month:'long',year:'numeric'}).format(new Date()),
      total:rows.length,pagina,paginas:Math.max(1,Math.ceil(rows.length/15)),
      viviendas:rows.slice((pagina-1)*15,pagina*15)});
  }catch(e){console.error('[seguridad-cuotas]',e);res.status(503).json({ok:false,message:'No fue posible consultar el estado de cuotas'});}
}
module.exports={consultar,resumenVivienda};
