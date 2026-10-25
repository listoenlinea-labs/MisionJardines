'use strict';
const { Casa, Cuota } = require('../models');
const { filtrarViviendasVisibles } = require('../services/viviendas-visibles.service');
const { calcularAdeudoVivienda } = require('../services/adeudo-vivienda-analisis.service');
const { tarifaParaCasa } = require('../services/tarifa-mantenimiento.service');
const { fechaMexico } = require('../services/vigencia-calculo');
const { estadoPeriodoMantenimiento, estadoSeguridadDesdeAnalisis } =
  require('../services/estado-mantenimiento-tablas.service');
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const numeric = (a,b) => String(a).localeCompare(String(b),'es-MX',{numeric:true,sensitivity:'base'});
function resumenVivienda(casa, registros, fecha=new Date()) {
  const hoy = fechaMexico(fecha);
  const anio = Number(hoy.slice(0,4));
  const mes = Number(hoy.slice(5,7));
  const mesActual = MESES[mes-1];

  // La misma fuente de deuda que usa Análisis de cuotas y Pagos.
  // No se decide morosidad por una cuota histórica aislada ni por el C3.
  const adeudo = calcularAdeudoVivienda(registros,{
    anio,mes,hoy,tarifa:tarifaParaCasa(casa),
    exencionesRecargo:casa.exencionesRecargo||[]
  });
  const cuotaActual=registros.find(c=>Number(c.anio)===anio &&
    String(c.mes||'').toUpperCase()===mesActual);
  const estadoAnalisis=estadoPeriodoMantenimiento(cuotaActual,adeudo,anio,mes);
  const estado=estadoSeguridadDesdeAnalisis(estadoAnalisis);

  let fechaUltima=null;
  for(const cuota of registros){
    if(!['PAGADO','PAGO_PARCIAL'].includes(String(cuota.estatusPago).toUpperCase()) ||
       Number(cuota.montoPagado)<=0 || !cuota.fechaPago)continue;
    const fp=new Date(cuota.fechaPago);
    if(!Number.isNaN(fp.getTime()) && (!fechaUltima || fp>fechaUltima))fechaUltima=fp;
  }
  const ultimo=adeudo.ultimoMesPagado;
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
      Casa.findAll({attributes:['id','calle','calleCorrecta','numero','cuotaPorCobrar','exencionesRecargo']}),
      Cuota.findAll({attributes:['casaId','anio','mes','estatusPago','fechaPago','montoPagado','montoCuota','recargo','recargoPagado','saldoPendiente','origenImportacion']})
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
