'use strict';

// El webhook de Meta puede entregar wa_id=521XXXXXXXXXX para México,
// mientras que el envío al número de prueba funciona con 52XXXXXXXXXX.
// Conservar el remitente original para las sesiones, eventos y ventana de 24h.
function normalizarDestinatario(phone){
 const numero=String(phone??'');
 return /^521\d{10}$/.test(numero)?'52'+numero.slice(3):numero;
}

module.exports={normalizarDestinatario};
