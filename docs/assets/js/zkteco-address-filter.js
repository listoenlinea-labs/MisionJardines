'use strict';
// El filtro Calle acepta "Gardenias", "Gardenias 5" o "Av. Valle de México 3614".
// Mantiene el endpoint existente, que recibe calle y numero por separado.
function separarDireccionZkteco(value){
  const text=String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');
  // La vivienda de laboratorio usa un identificador alfanumérico: Prueba TEST-001.
  // La excepción es sólo de búsqueda, NO cambia el filtro de permisos del backend.
  if(/^prueba\s+test-001$/i.test(text))return {calle:'Prueba',numero:'TEST-001'};
  // No confundir "5 de Mayo" con un número de casa.
  const match=/^(.+?)\s+(\d+(?:\.\d+)?[A-Za-z]?)$/.exec(text);
  return match
    ? {calle:match[1].trim(),numero:match[2]}
    : {calle:text,numero:''};
}
if(typeof window!=='undefined')window.MJZkAddressSearch={separarDireccionZkteco};
if(typeof module!=='undefined'&&module.exports)module.exports={separarDireccionZkteco};
