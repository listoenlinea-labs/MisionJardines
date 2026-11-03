'use strict';

// Análisis por vivienda, separado de mantenimiento y de los depósitos contables.
// Solo los cargos extraordinarios emitidos y las reservas aprobadas generan saldo.
const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const centavos=value=>Math.round(Number(value||0)*100);
const id=value=>String(value??'');
const mesDe=value=>String(value||'').slice(0,7);

function resumenConceptos({viviendas=[],cargos=[],reportados=[],manuales=[],aportaciones=[],reservas=[],anio,mes}){
  const elegido=anio+'-'+String(mes).padStart(2,'0');
  const ids=new Set(viviendas.map(v=>id(v.casaId)));
  const nuevo=()=>({montoPagadoCentavos:0,saldoCentavos:0,conCargos:false,ultimoPeriodo:null,parcial:false});
  const extra=new Map([...ids].map(k=>[k,nuevo()]));
  const club=new Map([...ids].map(k=>[k,nuevo()]));
  // Un depósito validado de $200 sobre una meta de $1,000 NO significa PAGADO.
  // Acumular en centavos sin exigir periodicidad ni forma de pago fija.
  const acumulados=new Map();
  const agregar=(cargoId,monto)=>{
    if(!cargoId)return;
    const k=id(cargoId);
    acumulados.set(k,(acumulados.get(k)||0)+centavos(monto));
  };
  for(const p of reportados)if(p.tipoPago==='EXTRAORDINARIO'&&p.estatus==='VALIDADO')agregar(p.cargoExtraordinarioId,p.monto);
  for(const p of manuales)if(p.tipoPago==='EXTRAORDINARIO')agregar(p.cargoExtraordinarioId,p.monto);
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

  const aportadoPorCargo=new Map();
  for(const p of aportaciones)if(p.cargoExtraordinarioId){
   const k=id(p.cargoExtraordinarioId);
   aportadoPorCargo.set(k,(aportadoPorCargo.get(k)||0)+centavos(p.monto));
  }
  for(const cargo of cargos){
    const row=extra.get(id(cargo.casaId)),period=mesDe(cargo.periodo);
    if(!row||!/^\\d{4}-(0[1-9]|1[0-2])$/.test(period))continue;
    const cargoCents=centavos(cargo.monto),abonos=(aportadoPorCargo.get(id(cargo.id))||0)+(acumulados.get(id(cargo.id))||0);
    const pagado=Math.min(cargoCents,abonos);
    if(period===elegido)row.montoPagadoCentavos+=pagado;
    if(pagado>0&&(!row.ultimoPeriodo||period>row.ultimoPeriodo))row.ultimoPeriodo=period;
    if(period<=elegido){
     row.conCargos=true;
     row.saldoCentavos+=Math.max(0,cargoCents-pagado);
     if(pagado>0&&pagado<cargoCents)row.parcial=true;
    }
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
        estatus:row.saldoCentavos>0?(row.parcial?'PAGO_PARCIAL':'PENDIENTE'):row.conCargos?'PAGADO':'SIN CARGOS',
        montoPagado:row.montoPagadoCentavos/100,
        saldoPendiente:row.saldoCentavos/100,
        ultimoMesPagado:date?{mes:MESES[Number(date.slice(5,7))-1],anio:Number(date.slice(0,4))}:null};
    });
  }
  return {EXTRAORDINARIO:exportar(extra),CASA_CLUB:exportar(club)};
}

module.exports={resumenConceptos};
