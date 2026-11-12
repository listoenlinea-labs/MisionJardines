'use strict';
// El reporte se admite incluso si la captura no muestra referencia/clave.
// No constituye acreditación: Titan debe verificar un abono auténtico
// mediante la conciliación bancaria independiente y prevenir duplicados.
// Evitar una consulta IMAP síncrona antes de crear el reporte reduce el tiempo
// de respuesta y no retrasa la revisión asíncrona programada en Pagos.
async function verificarPosibilidad(){
 return {metodo:'REPORTE_PENDIENTE_TITAN'};
}
module.exports={verificarPosibilidad};
