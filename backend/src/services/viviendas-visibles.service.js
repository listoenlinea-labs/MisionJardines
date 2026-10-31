'use strict';

// Política de VISIBILIDAD: estas avenidas muestran únicamente su casa oficial.
// Las demás direcciones y TAGs permanecen en la BD/C3; ninguna escritura física.
const NUMEROS_VISIBLES=Object.freeze({
  guadalajara:'707',
  'valle de mexico':'3614'
});

function normalizarCalle(valor){
  return String(valor??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
    .replace(/^(?:avenida|avda|av)\s+/,'').replace(/\s+/g,' ');
}

// TEST-001 y TEST-002 son viviendas de laboratorio, no del padrón operativo.
// La identidad se coteja por domicilio: el ID de direcciones no es estable.
function esViviendaDeLaboratorio(casa,numeroPrueba){
  if(!casa)return false;
  const c=casa.get?casa.get({plain:true}):casa;
  const numero=String(c.numero??c.numeroCasaSnapshot??c.numero_casa_snapshot??'').trim().toUpperCase();
  const calles=[c.calle,c.calleCorrecta,c.calle_correcta,c.calleSnapshot,c.calle_snapshot];
  return numero===numeroPrueba && calles.some(valor=>normalizarCalle(valor)==='prueba');
}
function esViviendaTest001(casa){return esViviendaDeLaboratorio(casa,'TEST-001');}
function esViviendaTest002(casa){return esViviendaDeLaboratorio(casa,'TEST-002');}

function esViviendaVisible(casa){
  if(!casa)return false;
  if(esViviendaTest001(casa)||esViviendaTest002(casa))return false;
  const c=casa.get?casa.get({plain:true}):casa;
  const calle=normalizarCalle(c.calleCorrecta||c.calle_correcta||c.calle||
    c.calleSnapshot||c.calle_snapshot);
  const numeroOficial=NUMEROS_VISIBLES[calle];
  return !numeroOficial||
    String(c.numero??c.numeroCasaSnapshot??c.numero_casa_snapshot??'').trim()===numeroOficial;
}

function esDepartamentoVisible(departamento){
  // La tarjeta puede carecer de casaId; en ese caso leer DEPTNAME sin
  // confundir "Valle de México 88.5" con el 3614.
  const nombre=normalizarCalle(departamento);
  if(nombre==='prueba test 001'||nombre==='prueba test 002')return false;
  for(const [calle,numero] of Object.entries(NUMEROS_VISIBLES)){
    if(nombre===calle||nombre.startsWith(calle+' ')){
      return nombre===calle+' '+numero;
    }
  }
  return true;
}

function filtrarViviendasVisibles(casas){
  return (casas||[]).filter(esViviendaVisible);
}

module.exports={NUMEROS_VISIBLES,normalizarCalle,esViviendaTest001,esViviendaTest002,esViviendaVisible,esDepartamentoVisible,filtrarViviendasVisibles};
