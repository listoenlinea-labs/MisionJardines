'use strict';
// Diagnóstico trazable sin incluir datos de cuenta, correo, claves o capturas en la respuesta.
// Solo un aviso AUTENTICADO y enlazado por identificador del MISMO tipo puede causar
// un rechazo automático por discrepancia material. La falta de correo NO es prueba de fraude.
const banco=require('./banco-correo.service');
const ids=require('./identificadores-bancarios.service');
const {equivaleFechaSpei}=require('./fecha-operativa-spei.service');
const centavos=n=>Math.round(Number(n||0)*100);
const fecha=p=>String(p?.fechaOperacion||'').slice(0,10);
const coincideFecha=(p,a)=>Boolean(a.fecha&&(a.fecha===fecha(p)
  ||equivaleFechaSpei(fecha(p),a.fecha,p.horaOperacion)
  ||equivaleFechaSpei(a.fecha,fecha(p),p.horaOperacion)));
const cuentaCorrecta=a=>{
 const expected=String(process.env.PAGOS_DESTINO_ULTIMOS4||'4409').replace(/\D/g,'').slice(-4);
 const got=String(a?.cuenta||'');
 return expected.length===4&&/^\d{3,4}$/.test(got)&&expected.endsWith(got);
};
function evidencia(pago,aviso){
 return {
  identificador:ids.coinciden(pago,aviso),
  importe:Number.isFinite(aviso?.monto)&&centavos(pago.monto)===centavos(aviso.monto),
  fecha:coincideFecha(pago,aviso),
  destino:cuentaCorrecta(aviso),
  vivienda:banco.perteneceAVivienda(pago,aviso)
 };
}
function resultado(etapa,detalle,extra={}){
 return {version:1,etapa,detalle,fechaRevision:new Date().toISOString(),
    avisosConsultados:0,avisosAutenticados:0,coincidencias:0, ...extra};
}
function evaluar(pago,avisos,autenticados){
 const base={avisosConsultados:avisos.length,avisosAutenticados:autenticados.length};
 if(!avisos.length)return resultado('BUZON_SIN_AVISOS',
  'Se consultó Titan, pero todavía no hay notificaciones bancarias recientes para cotejar este comprobante.',base);
 if(!autenticados.length)return resultado('SIN_AUTENTICACION',
  'Titan respondió, pero ninguna notificación reciente superó las comprobaciones de remitente y autenticación. No se puede confirmar ni rechazar el depósito.',base);
 const vinculados=autenticados.filter(a=>ids.coinciden(pago,a));
 if(!vinculados.length)return resultado('SIN_COINCIDENCIA',
  'Hay notificaciones bancarias autenticadas, pero ninguna contiene la misma referencia, clave de rastreo o folio del comprobante. El pago sigue en revisión; la ausencia de coincidencia no demuestra que haya fallado.',base);
 if(vinculados.length!==1)return resultado('COINCIDENCIA_AMBIGUA',
  'Más de una notificación autenticada comparte el identificador. No se acreditará el pago hasta disponer de una correspondencia única.',{...base,coincidencias:vinculados.length});
 const aviso=vinculados[0];
 const checks=evidencia(pago,aviso);
 const completos=Object.values(checks).every(Boolean);
 if(completos)return resultado('COINCIDENCIA_VERIFICADA',
  'Se encontró una notificación bancaria autenticada con identificador, monto, fecha, cuenta destino y vivienda coincidentes. Se está aplicando la confirmación.',{...base,coincidencias:1,verificaciones:checks});
 const causas=[];
 if(!checks.importe)causas.push('El importe del aviso bancario es diferente al importe reportado.');
 if(!checks.destino)causas.push('La cuenta destinataria del aviso bancario no corresponde a la cuenta oficial.');
 if(!checks.vivienda)causas.push('El concepto del aviso no identifica la vivienda reportada.');
 if(!checks.fecha)causas.push('La fecha del aviso no coincide con la fecha reportada ni con una equivalencia SPEI verificable.');
 const seguroParaRechazar=(checks.importe===false && Number.isFinite(aviso?.monto))
   ||(checks.destino===false && /^\d{3,4}$/.test(String(aviso?.cuenta||'')))
   ||(checks.vivienda===false && Boolean(String(aviso?.concepto||'').trim()));
 return resultado(seguroParaRechazar?'FALLIDO':'DATOS_INCOMPLETOS',causas.join(' ') ||
  'La notificación no contiene todos los datos necesarios para confirmar el pago.',
  {...base,coincidencias:1,verificaciones:checks});
}
module.exports={evaluar,evidencia,resultado};
