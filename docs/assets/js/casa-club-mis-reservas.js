'use strict';
// El acceso se obtiene exclusivamente del enlace privado enviado al correo.
// El backend extrae la dirección del registro validado, no de un campo libre.
(()=>{
 const match=/^#mis-reservas=(\d+)\.([0-9a-f]{64})$/.exec(location.hash);
 if(!match)return;
 const $=id=>document.getElementById(id);
 const view=$('clubEmailReservationsView');
 if(!view)return;
 document.querySelectorAll('.club-panel').forEach(panel=>panel.hidden=true);
 view.hidden=false;
 $('clubTabs').hidden=true;
 const status=$('clubEmailReservationsStatus'),list=$('clubEmailReservationsList');
 const fecha=iso=>{
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));
  return m?m[3]+'-'+['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'][Number(m[2])-1]+'-'+m[1]:String(iso||'');
 };
 const labels={
  PENDIENTE:['Pendiente','pending','La solicitud está en revisión.'],
  APROBADA:['Aprobada','approved','La fecha fue aprobada.'],
  RECHAZADA:['Rechazada','rejected','La solicitud fue rechazada.'],
  CANCELADA:['Cancelada','cancelled','La reservación ya no está activa.']
 };
 const addText=(parent,tag,text,className)=>{
  const element=document.createElement(tag);
  element.textContent=String(text??'');
  if(className)element.className=className;
  parent.appendChild(element);
  return element;
 };
 async function load(){
  list.replaceChildren();
  status.textContent='Consultando tus reservaciones…';
  try{
   const resp=await fetch((window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api')+
    '/casa-club/publico/mis-reservas',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({reservaId:Number(match[1]),claveAcceso:match[2]}),
    cache:'no-store',credentials:'omit'
   });
   const json=await resp.json().catch(()=>({}));
   if(!resp.ok||!json.ok)throw Error(json.message||'No fue posible consultar el historial.');
   const rows=Array.isArray(json.data?.reservas)?json.data.reservas:[];
   const mail=$('clubEmailReservationsMailbox');
   mail.hidden=false;
   mail.textContent='Reservaciones asociadas a '+String(json.data?.correo||'este correo');
   status.textContent=rows.length?rows.length+' reservación(es) encontrada(s).':
    'No se encontraron reservaciones asociadas a este correo.';
   for(const row of rows){
    const info=labels[row.estatus]||['Estado desconocido','unknown','Consulta a Administración.'];
    const card=document.createElement('article');
    card.className='club-email-reservation';
    const head=document.createElement('div');head.className='club-email-reservation-head';
    addText(head,'strong',fecha(row.fecha),'club-email-reservation-date');
    addText(head,'span',info[0],'club-email-state '+info[1]);
    card.appendChild(head);
    addText(card,'p',String(row.folio||'Reserva'),'club-email-reservation-folio');
    const msg=row.estatus==='APROBADA'?
     (row.pagado?'Aprobada y con pago verificado.':'Fecha aprobada; pago aún no confirmado.') : info[2];
    addText(card,'p',msg,'club-email-reservation-detail');
    if(row.estatus==='RECHAZADA'){
     const reason=document.createElement('div');reason.className='club-email-rejection';
     addText(reason,'strong','Motivo del rechazo');
     addText(reason,'p',row.motivoRechazo||'Administración no indicó el motivo.');
     card.appendChild(reason);
    }
    list.appendChild(card);
   }
  }catch(e){
   status.textContent=e.message||'No se pudo consultar tu historial.';
   status.classList.add('error');
  }
 }
 void load();
})();
