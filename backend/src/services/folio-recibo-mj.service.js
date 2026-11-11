'use strict';
// Folio visible de recibos: MJ-MES-AÑO-ALEATORIO-CALLECASA-M/P/C.
// El folio interno del reporte bancario MJ-AÑO-#### se conserva intacto,
// para no romper referencias históricas ni el consecutivo de MySQL.
const {randomBytes}=require('crypto');
const meses=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
function componer({fechaOperacion,calle,numero,tipoPago,aleatorio}){
 const fecha=String(fechaOperacion||'');
 if(!/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(fecha))
  throw Error('La fecha bancaria no es válida para formar el folio del recibo.');
 const mes=meses[Number(fecha.slice(5,7))-1];
 const calleNormalizada=String(calle||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .trim().replace(/^mision\s+/i,'').replace(/[^A-Za-z0-9]/g,'');
 const inicial=calleNormalizada.charAt(0).toUpperCase();
 const casa=String(numero||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'');
 const letra=({MANTENIMIENTO:'M',EXTRAORDINARIO:'P',CASA_CLUB:'C'})[tipoPago];
 const azar=String(aleatorio||randomBytes(5).toString('hex')).toUpperCase();
 if(!inicial||!casa||!letra||!/^[A-F0-9]{10}$/.test(azar))
  throw Error('No fue posible identificar la vivienda, el concepto o el folio.');
 return 'MJ-'+mes+'-'+fecha.slice(0,4)+'-'+azar+'-'+inicial+casa+'-'+letra;
}
module.exports={componer};
