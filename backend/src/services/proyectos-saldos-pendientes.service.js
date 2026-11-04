'use strict';
// Un proyecto activo no equivale a un adeudo: solo mostrar metas con saldo
// POSITIVO en la burbuja de pagos. Los saldos $0 siguen disponibles en
// /pagos/extraordinarias para consultar su historial o estado de exención.
function pendientesReales(cargos){
 return (Array.isArray(cargos)?cargos:[]).filter(c=>{
  const saldo=Number(c?.monto);
  return Number.isFinite(saldo)&&Math.round(saldo*100)>0;
 });
}
module.exports={pendientesReales};
