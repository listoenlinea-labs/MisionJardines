'use strict';
// El filtro Calle acepta "Gardenias", "Gardenias 5" o "Av. Valle de México 3614".
// Mantiene el endpoint existente, que recibe calle y numero por separado.
function separarDireccionZkteco(value){
  const text=String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');
  // No confundir "5 de Mayo" con un número de casa.
  const match=/^(.+?)\s+(\d+(?:\.\d+)?[A-Za-z]?)$/.exec(text);
  return match
    ? {calle:match[1].trim(),numero:match[2]}
    : {calle:text,numero:''};
}
if(typeof window!=='undefined')window.MJZkAddressSearch={separarDireccionZkteco};
if(typeof module!=='undefined'&&module.exports)module.exports={separarDireccionZkteco};
