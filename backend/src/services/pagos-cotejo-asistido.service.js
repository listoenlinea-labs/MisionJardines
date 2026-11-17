'use strict';
// Cotejo asistido cuando el OCR no extrajo el identificador bancario.
// Solo administración puede aportar el número leído del comprobante.
// La acreditación sigue requiriendo un aviso REAL de Titan con mismo rastreo,
// importe, cuenta receptora, fecha SPEI compatible y notificación no utilizada.
const {PagoReportado}=require('../models');
const banco=require('./banco-correo.service');
const fail=(status,message)=>Object.assign(new Error(message),{status});
function normalizarCodigo(value){
 const s=String(value||'').trim().toUpperCase().replace(/[\s-]/g,'');
 const numero=s.replace(/^CPO/,'');
 if(!/^\d{10,17}$/.test(numero))throw fail(400,'Captura los 10 a 17 dígitos completos del comprobante de transferencia.');
 return numero;
}
async function cotejar({pagoId,codigo,adminId}){
 const numero=normalizarCodigo(codigo);
 if(!Number.isSafeInteger(pagoId)||pagoId<1||!Number.isSafeInteger(adminId)||adminId<1)
  throw fail(400,'Solicitud de cotejo inválida.');
 if(!banco.configurado())throw fail(503,'Titan no está disponible; no se acreditó el pago.');
 const pago=await PagoReportado.findByPk(pagoId,{
  attributes:['id','estatus','tipoPago','monto','fechaOperacion','horaOperacion','correoBancarioHash','verificacionBancaria']
 });
 if(!pago)throw fail(404,'No existe el pago.');
 if(pago.estatus==='VALIDADO')return {estatus:'VALIDADO',yaValidado:true};
 if(pago.estatus!=='PENDIENTE_VALIDACION')throw fail(409,'El pago no está pendiente de verificación.');
 const avisos=await banco.obtenerAvisos();
 const mismos=avisos.filter(a=>a.autorizado&&a.reciente&&
  // Prefijo bancario CPO + mismo número COMPLETO del comprobante visual.
  String(a.tracking||'').toUpperCase().replace(/[\s-]/g,'')==='CPO'+numero);
 if(mismos.length!==1)throw fail(409,
  mismos.length?'Existen varios avisos con ese rastreo. No se acreditó; revisa la operación en Titan.':
  'Titan todavía no tiene un aviso autorizado con esta clave completa. El reporte sigue en revisión.');
 const aviso=mismos[0];
 const checks=banco.chequeosAviso(pago,aviso);
 if(!Object.values(checks).every(Boolean))throw fail(409,
  'El rastreo coincide, pero el aviso no supera todas las verificaciones de importe, cuenta o fecha bancaria. No se acreditó.');
 const hash=banco.huellaMensaje(aviso.id);
 const utilizado=await PagoReportado.findOne({where:{correoBancarioHash:hash},attributes:['id']});
 if(utilizado)throw fail(409,'La notificación de Titan ya fue aplicada a otro pago. No se acreditó de nuevo.');
 // Registrar rastro administrativo sin sustituir nunca el OCR original.
 const antes=pago.verificacionBancaria&&typeof pago.verificacionBancaria==='object'?pago.verificacionBancaria:{};
 await PagoReportado.update({verificacionBancaria:{
  ...antes,cotejoAsistido:{metodo:'RASTREO_CPO_CONFIRMADO_VISUALMENTE',
   administradorId:adminId,fecha:new Date().toISOString(),avisoTitanValidado:true},
  etapa:'COINCIDENCIA_VERIFICADA',
  detalle:'Un administrador confirmó visualmente el código del comprobante; Titan confirmó un aviso único y compatible en importe, fecha y cuenta.'
 }},{where:{id:pagoId,estatus:'PENDIENTE_VALIDACION'}});
 const {confirmarPagoDesdeBanco}=require('../controllers/pagos.controller');
 await confirmarPagoDesdeBanco(pagoId,hash);
 return {estatus:'VALIDADO',yaValidado:false};
}
module.exports={cotejar,normalizarCodigo};
