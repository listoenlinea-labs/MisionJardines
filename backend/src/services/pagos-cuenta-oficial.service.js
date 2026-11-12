'use strict';
// Fuente única de los datos bancarios que se muestran en Pagos y Casa Club.
// No se aceptan cuentas alternativas de Casa Club para evitar depósitos
// dirigidos a un destino diferente al utilizado en la conciliación de Titan.
const texto=(value,fallback)=>String(value||'').trim()||fallback;
const tarjeta=(value,fallback)=>{
 const s=String(value??'').trim();
 return s&&!/^[—–-]+$/.test(s)?s:fallback;
};
function obtener(env=process.env){
 const datos={
  banco:texto(env.PAGOS_BANCO,'BANCO AZTECA'),
  titular:texto(env.PAGOS_TITULAR,'MARIA DEL ROCIO BAHENA JUAREZ'),
  cuenta:texto(env.PAGOS_CUENTA,'00002128412440'),
  clabe:texto(env.PAGOS_CLABE,'127320021284124409'),
  tarjeta:tarjeta(env.PAGOS_TARJETA,'4027666123124884'),
  destinoUltimos4:texto(env.PAGOS_DESTINO_ULTIMOS4,'4409'),
  referencia:texto(env.PAGOS_REFERENCIA,'NOMBRE DE CALLE Y NUMERO DE CASA'),
  moneda:'MXN'
 };
 // Admitir solo los últimos cuatro dígitos de identificadores oficiales.
 const ultimos4=value=>String(value||'').replace(/\D/g,'').slice(-4);
 return {...datos,destinosUltimos4:[...new Set([
  datos.destinoUltimos4,datos.clabe,datos.tarjeta,datos.cuenta
 ].map(ultimos4).filter(x=>/^\d{4}$/.test(x)))]};
}
function conceptoVivienda(casa){
 const calle=String(casa?.calleCorrecta||casa?.calle||'')
  .trim().replace(/^misi[oó]n\s+/i,'').trim();
 const numero=String(casa?.numero||'').trim();
 return calle&&numero?(calle+' '+numero).toLocaleUpperCase('es-MX'):'';
}
module.exports={obtener,conceptoVivienda};
