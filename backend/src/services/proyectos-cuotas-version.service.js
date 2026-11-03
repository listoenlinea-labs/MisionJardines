'use strict';
const {cents,fail}=require('./proyectos-extraordinarios-validacion.service');

// Compara una versión de las 231 cuotas bajo el bloqueo transaccional de registros.
function verificarSnapshotCuotas(snapshot,project,cargos){
 if(!snapshot||typeof snapshot!=='object'||!Array.isArray(snapshot.cargos)||
    snapshot.cargos.length!==231||cargos.length!==231)
  throw fail(400,'Versión de cuotas inválida. Vuelve a abrir Importes por vivienda.');
 const base=cents(snapshot.cuotaBase);
 // Una cuota general de cero es válida para proyectos extraordinarios.
 const originales=new Map();
 for(const entry of snapshot.cargos){
  const id=Number(entry?.casaId),amount=cents(entry?.monto);
  if(!Number.isSafeInteger(id)||id<1||originales.has(id))
   throw fail(400,'La versión de las viviendas contiene cuotas o casas inválidas.');
  originales.set(id,amount);
 }
 if(cents(project.monto)!==base||
    cargos.some(c=>originales.get(Number(c.casaId))!==cents(c.monto)))
  throw fail(409,'Las cuotas de este proyecto cambiaron desde que abriste la ventana. Ciérrala y vuelve a abrir Importes por vivienda para conservar los cambios recientes.');
 return true;
}
module.exports={verificarSnapshotCuotas};
