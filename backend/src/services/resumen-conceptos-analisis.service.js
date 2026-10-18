'use strict';

// Análisis por vivienda, separado de mantenimiento y de los depósitos contables.
// Solo los cargos extraordinarios emitidos y las reservas aprobadas generan saldo.
const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const centavos=value=>Math.round(Number(value||0)*100);
const id=value=>String(value??'');
const mesDe=value=>String(value||'').slice(0,7);

function resumenConceptos({viviendas=[],cargos=[],reportados=[],manuales=[],reservas=[],anio,mes}){
  const elegido=anio+'-'+String(mes).padStart(2,'0');
  const ids=new Set(viviendas.map(v=>id(v.casaId)));
  const nuevo=()=>({montoPagadoCentavos:0,saldoCentavos:0,conCargos:false,ultimoPeriodo:null});
  const extra=new Map([...ids].map(k=>[k,nuevo()]));
  const club=new Map([...ids].map(k=>[k,nuevo()]));
  const validosExtra=new Set(reportados.filter(p=>p.tipoPago==='EXTRAORDINARIO'&&p.estatus==='VALIDADO'&&p.cargoExtraordinarioId).map(p=>id(p.cargoExtraordinarioId)));
  const manualesExtra=new Set(manuales.filter(p=>p.tipoPago==='EXTRAORDINARIO'&&p.cargoExtraordinarioId).map(p=>id(p.cargoExtraordinarioId)));
  const validosClub=new Set(reportados.filter(p=>p.tipoPago==='CASA_CLUB'&&p.estatus==='VALIDADO'&&p.reservaCasaClubId).map(p=>id(p.reservaCasaClubId)));
  const manualesClub=new Set(manuales.filter(p=>p.tipoPago==='CASA_CLUB'&&p.reservaCasaClubId).map(p=>id(p.reservaCasaClubId)));

  function incluir(map,casaId,periodo,monto,pagado){
    const row=map.get(id(casaId));
    const period=mesDe(periodo);
    if(!row||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))return;
    const cents=centavos(monto);
    if(!Number.isSafeInteger(cents)||cents<0)return;
    if(pagado){
      if(period===elegido)row.montoPagadoCentavos+=cents;
      if(!row.ultimoPeriodo||period>row.ultimoPeriodo)row.ultimoPeriodo=period;
    }
    if(period<=elegido){
      row.conCargos=true;
      if(!pagado)row.saldoCentavos+=cents;
    }
  }

  for(const cargo of cargos){
    const paid=validosExtra.has(id(cargo.id))||manualesExtra.has(id(cargo.id));
    incluir(extra,cargo.casaId,cargo.periodo,cargo.monto,paid);
  }
  for(const reserva of reservas){
    if(reserva.estatus!=='APROBADA')continue;
    // La fecha de vencimiento, y no la fecha del evento, determina el corte de deuda.
    incluir(club,reserva.casaId,reserva.fechaLimitePago||reserva.fecha,
      Number(reserva.cuotaRecuperacion||0)+Number(reserva.depositoGarantia||0)+Number(reserva.limpieza||0),
      Boolean(reserva.pagado)||validosClub.has(id(reserva.id))||manualesClub.has(id(reserva.id)));
  }

  function exportar(map){
    return viviendas.map(v=>{
      const row=map.get(id(v.casaId));
      const date=row.ultimoPeriodo;
      return {casaId:v.casaId,
        estatus:row.saldoCentavos>0?'PENDIENTE':row.conCargos?'PAGADO':'SIN CARGOS',
        montoPagado:row.montoPagadoCentavos/100,
        saldoPendiente:row.saldoCentavos/100,
        ultimoMesPagado:date?{mes:MESES[Number(date.slice(5,7))-1],anio:Number(date.slice(0,4))}:null};
    });
  }
  return {EXTRAORDINARIO:exportar(extra),CASA_CLUB:exportar(club)};
}

module.exports={resumenConceptos};
