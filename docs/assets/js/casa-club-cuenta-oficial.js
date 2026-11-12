'use strict';
// Presentación de la cuenta OFICIAL devuelta por /api/casa-club/publico/cuenta.
// Jamás solicita ni guarda información de sesión o de residentes.
(()=>{
 const limpiar=v=>String(v??'').trim();
 function concepto(calle,numero){
  const limpia=limpiar(calle).replace(/^misi[oó]n\s+/i,'').trim();
  const num=limpiar(numero);
  return limpia&&num?(limpia+' '+num).toLocaleUpperCase('es-MX'):'';
 }
 const nodo=(tag,clase,text)=>{
  const n=document.createElement(tag);
  if(clase)n.className=clase;
  if(text!==undefined)n.textContent=text;
  return n;
 };
 function render(host,datos,{conceptoTransferencia='',monto=null,plazo=null,informativo=false}={}){
  if(typeof host==='string')host=document.getElementById(host);
  if(!host)return;
  host.replaceChildren();
  if(!datos){host.hidden=true;return;}
  host.hidden=false;
  const encabezado=nodo('div','club-bank-head');
  const titulo=nodo('div','club-bank-title');
  titulo.append(nodo('span','eyebrow','DATOS OFICIALES PARA TRANSFERENCIA'),
   nodo('h3','', 'Cuenta de Misión Jardines'));
  encabezado.append(titulo,nodo('span','club-bank-symbol','BA'));
  host.append(encabezado);
  const info=nodo('p','club-bank-help',informativo
   ?'Estos son los datos oficiales de Pagos. Primero elige tu fecha, completa tu solicitud y recibe tu folio. Después realiza la transferencia y adjunta el comprobante aquí mismo.'
   :'Realiza tu depósito únicamente a esta cuenta. Después adjunta el comprobante aquí mismo para validarlo con Titan.');
  host.append(info);
  const fields=[
   ['Banco',datos.banco],
   ['Titular',datos.titular],
   ['Cuenta',datos.cuenta],
   ['CLABE',datos.clabe],
   ['Tarjeta',datos.tarjeta]
  ];
  const conceptoValido=limpiar(conceptoTransferencia);
  fields.push(['Concepto de transferencia',conceptoValido||'Selecciona primero tu calle y número de casa.']);
  const body=nodo('dl','club-bank-list');
  for(const [label,value] of fields){
   const fila=nodo('div','club-bank-row'+(label==='Concepto de transferencia'?' is-concept':''));
   fila.append(nodo('dt','',label));
   const dato=nodo('dd','',limpiar(value)||'—');
   fila.append(dato);
   if(limpiar(value)&&!(label==='Concepto de transferencia'&&!conceptoValido)){
    const copy=nodo('button','club-bank-copy','Copiar');
    copy.type='button';
    copy.setAttribute('aria-label','Copiar '+label);
    copy.addEventListener('click',async()=>{
     try{
      await navigator.clipboard.writeText(limpiar(value));
      copy.textContent='Copiado';
     }catch(_){
      copy.textContent='Selecciona para copiar';
      dato.tabIndex=-1;dato.focus();
     }
    });
    fila.append(copy);
   }
   body.append(fila);
  }
  host.append(body);
  if(monto!==null&&Number.isFinite(Number(monto))){
   const total=nodo('div','club-bank-total');
   total.append(nodo('span','', 'Total de la reservación'),nodo('strong','',
    Number(monto).toLocaleString('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:0,maximumFractionDigits:0})));
   host.append(total);
  }
  if(plazo)host.append(nodo('p','club-bank-deadline','Fecha límite para depositar: '+limpiar(plazo)+' (Guadalajara).'));
  host.append(nodo('p','club-bank-warning',
   'En el concepto de la transferencia escribe exactamente la CALLE y el NÚMERO de tu vivienda. No pongas el folio CC como concepto. La fecha se confirma solo cuando Titan verifica el depósito.'));
 }
 window.MJClubCuenta={render,concepto};
})();
