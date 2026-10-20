'use strict';
const TARIFA_GENERAL = 300;
// La tarifa es una propiedad de direcciones, no del condómino ni del TAG.
// Mantener el default para mocks o vivienda heredada durante pruebas.
function tarifaParaCasa(casa) {
  const n = Number(casa?.cuotaPorCobrar ?? casa?.cuota_por_cobrar ?? TARIFA_GENERAL);
  if (!Number.isInteger(n) || n < 1 || n > 10000) {
    throw Object.assign(new Error('La cuota por cobrar de esta vivienda es inválida'), {status:409});
  }
  return n;
}
module.exports={TARIFA_GENERAL,tarifaParaCasa};
