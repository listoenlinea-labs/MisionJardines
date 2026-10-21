(function(root){
 'use strict';
 const labels={MANTENIMIENTO:'Mantenimiento',EXTRAORDINARIO:'Cuotas extraordinarias',CASA_CLUB:'Casa club'};
 const normal=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const displayDay=value=>{const [year,month,day]=value.split('-');return day+'-'+['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'][Number(month)-1]+'-'+year;};
 const dateOnly=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 function paymentDate(value,hour){
  if(!value)return null;
  const text=String(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)){
   if(!dateOnly(text))return null;
   const time=/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(String(hour||''))?String(hour).padEnd(8,':00'):'';
   return {day:text,time,key:text+(time?' '+time:'')};
  }
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const day=p.year+'-'+p.month+'-'+p.day,time=p.hour+':'+p.minute+':'+p.second;
  return {day,time,key:day+' '+time};
 }
 function selectPayments(rows,{from='',to='',concept='',search='',order='desc'}={}){
  if((from&&!dateOnly(from))||(to&&!dateOnly(to)))return {error:'Selecciona fechas válidas.',rows:[]};
  if(from&&to&&from>to)return {error:'La fecha Desde debe ser igual o anterior a Hasta.',rows:[]};
  const query=normal(search).trim();
  const result=rows.map(p=>({...p,date:paymentDate(p.fecha,p.hora)})).filter(p=>
   (!concept||p.tipoPago===concept)&&(!query||normal([p.nombre,p.calle,p.numero,p.referencia].join(' ')).includes(query))
   &&(!from||(p.date&&p.date.day>=from))&&(!to||(p.date&&p.date.day<=to)));
  result.sort((a,b)=>{
   if(!a.date||!b.date){if(!a.date&&b.date)return 1;if(a.date&&!b.date)return -1;}
   const byDate=String(a.date?.key||'').localeCompare(String(b.date?.key||''));
   return (order==='asc'?byDate:-byDate)||String(a.calle).localeCompare(String(b.calle),'es',{numeric:true})
    ||String(a.numero).localeCompare(String(b.numero),'es',{numeric:true})
    ||String(a.referencia||'').localeCompare(String(b.referencia||''));
  });
  return {rows:result,error:null};
 }
 function createView(doc){
  const $=id=>doc.getElementById('paymentDates'+id);
  let rows=[],page=1,available=false;
  const money=n=>Number(n||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
  const inputDate=input=>{
   const label=input.previousElementSibling;
   label.textContent=input.value?displayDay(input.value):'Elegir fecha';
   label.classList.toggle('is-empty',!input.value);
  };
  function render(){
   const {rows:result,error}=selectPayments(rows,{from:$('From').value,to:$('To').value,concept:$('Concept').value,search:$('Search').value,order:$('Order').value});
   $('From').setCustomValidity(error||'');
   $('From').setAttribute('aria-invalid',String(Boolean(error)));
   const pages=Math.max(1,Math.ceil(result.length/20));page=Math.max(1,Math.min(page,pages));
   const total=result.reduce((sum,p)=>sum+Math.round(Number(p.monto||0)*100),0)/100;
   $('Summary').textContent=!available?'El servidor aún no proporciona este historial. Actualiza también el backend.':error||result.length+' pagos · Total: '+money(total);
   const cell=(title,value)=>'<td data-label="'+title+'">'+esc(value)+'</td>';
   $('Rows').innerHTML=available&&!error&&result.length?result.slice((page-1)*20,page*20).map(p=>'<tr>'+
    cell('Fecha del pago',p.date?displayDay(p.date.day)+(p.date.time?' '+p.date.time:''):'Sin fecha registrada')+
    cell('Residente registrado',p.nombre||'Sin residente')+cell('Vivienda',[p.calle,p.numero].join(' '))+
    cell('Concepto',labels[p.tipoPago]||p.tipoPago)+cell('Monto',money(p.monto))+
    cell('Referencia',p.referencia||'Sin referencia')+cell('Forma de pago',p.formaPago||'Sin dato')+'</tr>').join(''):
    '<tr><td colspan="7">'+esc(!available?'Historial no disponible.':error||'No hay pagos que coincidan con los filtros.')+'</td></tr>';
   $('Page').textContent='Página '+page+' de '+pages;
   $('Prev').disabled=page===1||!available||Boolean(error);
   $('Next').disabled=page===pages||!available||Boolean(error);
  }
  for(const key of ['From','To','Concept','Search','Order']){
   const input=$(key);
   input.addEventListener(key==='Search'?'input':'change',()=>{
    if(key==='From'||key==='To')inputDate(input);
    page=1;render();
   });
  }
  $('Prev').addEventListener('click',()=>{page--;render();});
  $('Next').addEventListener('click',()=>{page++;render();});
  $('Clear').addEventListener('click',()=>{
   for(const key of ['From','To','Concept','Search'])$(key).value='';
   $('Order').value='desc';inputDate($('From'));inputDate($('To'));page=1;render();
  });
  return {setData(data){available=Array.isArray(data);rows=available?data:[];page=1;render();}};
 }
 if(typeof module==='object'&&module.exports)module.exports={selectPayments,paymentDate,createView};
 else{
  let view;
  root.MJPaymentDates={setData(data){view??=createView(root.document);view.setData(data);}};
 }
})(typeof window==='undefined'?{}:window);
