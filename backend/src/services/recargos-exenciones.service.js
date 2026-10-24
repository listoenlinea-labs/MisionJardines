'use strict';
// Intervalos mensuales de exención: se conservan al volver a activar el recargo.
// No modifican pagos, recibos ni eventos de acceso anteriores.
const {fechaMexico}=require('./vigencia-calculo');
const valido=p=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(p||''));
const normalizar=datos=>Array.isArray(datos)?datos.filter(x=>valido(x?.desde)&&(!x.hasta||valido(x.hasta))&&(!x.hasta||x.hasta>=x.desde)).map(x=>({desde:x.desde,hasta:x.hasta||null})):[];
function exentoEn(exenciones,periodo){
  const mes=String(periodo||'').slice(0,7);
  return valido(mes)&&normalizar(exenciones).some(x=>mes>=x.desde&&(!x.hasta||mes<=x.hasta));
}
function activo(exenciones,hoy=fechaMexico()){return exentoEn(exenciones,hoy.slice(0,7));}
function mesAnterior(mes){
  const [y,m]=mes.split('-').map(Number);
  const d=new Date(Date.UTC(y,m-2,1));
  return d.toISOString().slice(0,7);
}
function establecer(exenciones,deshabilitar,hoy=fechaMexico()){
  const meses=normalizar(exenciones),actual=hoy.slice(0,7);
  if(!valido(actual))throw new Error('Fecha operativa inválida');
  if(deshabilitar){
    if(!activo(meses,hoy))meses.push({desde:actual,hasta:null});
  }else{
    for(let i=meses.length-1;i>=0;i--){
      const r=meses[i];
      if(r.desde<=actual&&(!r.hasta||r.hasta>=actual)){
        if(r.desde===actual)meses.splice(i,1);
        else r.hasta=mesAnterior(actual);
      }
    }
  }
  return meses;
}
module.exports={normalizar,exentoEn,activo,establecer};
