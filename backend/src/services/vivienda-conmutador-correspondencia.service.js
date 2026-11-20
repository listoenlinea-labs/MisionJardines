'use strict';
const { normalizarCalle, esViviendaVisible } = require('./viviendas-visibles.service');

// Misma numeración de las secciones del conmutador. No inferir una sección Jardines
// solo por el número sin comprobar antes que la calle de la casa sea Jardines.
const JARDINES = {
  'Jardines 1': new Set('116 120 124 125 128 129 132 133 136 137 141 142 144 145 148 149 152 153 156 157 160 161 164 165 168 169 173 177 181 185'.split(' ')),
  'Jardines 2': new Set('201 205 209 213 217 221 233 237 241 245 249 253 257 269 273 277 281 285 289'.split(' ')),
  'Jardines 3': new Set('307 311 315 319 323 327 328 331 332 335 336 339 340 343 344 347 348 351 352 355 356 359 360 363 364 367 368 371 372 375 376 379 380 384 388'.split(' '))
};
const GRUPOS = new Map([
  ['gardenias','Gardenias'],['magnolias','Magnolias'],
  ['lirios','Lirios'],['rosas','Rosas'],
  ['valle de mexico','Valle de México'],['atotonilco','Atotonilco'],
  ['guadalajara','Guadalajara']
]);

function domicilioDesdeCasa(casa) {
  if (!casa || !esViviendaVisible(casa)) return null;
  const numero=String(casa.numero||'').trim();
  if (!/^\d{1,4}$/.test(numero)) return null;
  const calle=normalizarCalle(casa.calleCorrecta||casa.calle).replace(/^mision\s+/,'');
  if(/^jardines(?: [123])?$/.test(calle)) {
    const matches=Object.entries(JARDINES).filter(([,values])=>values.has(numero));
    if(matches.length!==1)return null;
    const grupo=matches[0][0];
    // Si la calle contiene número de sección, debe coincidir.
    if(calle!=='jardines'&&calle!=='jardines '+grupo.slice(-1))return null;
    return {grupo,numero};
  }
  const grupo=GRUPOS.get(calle);
  if(!grupo)return null;
  const oficiales={'Valle de México':'3614','Atotonilco':'752','Guadalajara':'707'};
  if(oficiales[grupo]&&oficiales[grupo]!==numero)return null;
  return {grupo,numero};
}

module.exports={domicilioDesdeCasa};
