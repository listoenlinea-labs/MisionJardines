(function(root){
 'use strict';
 root.MJRepartoUI={crear({api,headers,changed,money,fechaResuelta=()=>{}}){
  const box=document.getElementById('paymentAllocation');
  const list=document.getElementById('allocationHouses');
  const status=document.getElementById('allocationStatus');
  let catalog=null,mode='',total='',date='',hour='',ready=false,plan=null,revision=0,values=new Map(),loading=false,error='';
  const active=()=>mode==='MANTENIMIENTO'&&catalog?.habilitado;
  const entries=()=>catalog.viviendas.map(h=>({casaId:h.casaId,monto:values.get(h.casaId)||'0'}));
  function valid(){return !active()||!!(ready&&plan&&!loading&&!error);}
  function paintStatus(message){status.textContent=message;status.classList.toggle('invalid',!valid());changed();}
  function reset(){values=new Map();plan=null;revision++;if(catalog)for(const input of list.querySelectorAll('input'))input.value='0.00';}
  async function actualizar(type,proofReady,ocrTotal,fecha,horaOperacion){
   mode=type;total=ocrTotal;date=fecha;hour=horaOperacion||hour;ready=proofReady;plan=null;error='';loading=false;
   const current=++revision;
   if(catalog)for(const h of catalog.viviendas){const info=document.getElementById('allocationPlan'+h.casaId);if(info)info.textContent='';}
   box.hidden=!active();document.getElementById('residentAddress').hidden=!!active();
   if(!active()){changed();return;}
   if(!ready||!total){paintStatus('Adjunta el comprobante para leer el monto que vas a repartir.');return;}
   let normalized;
   try{
    const allocated=entries().reduce((s,e)=>s+root.MJReparto.centavos(e.monto),0);
    paintStatus('Depósito: '+money(total)+' · Asignado: '+money(allocated/100)+' · Por repartir: '+money((root.MJReparto.centavos(total)-allocated)/100));
    normalized=root.MJReparto.normalizar(entries(),total,catalog.viviendas.map(h=>h.casaId));
   }catch(e){error=e.message;paintStatus(status.textContent+' — '+error);return;}
   loading=true;changed();
   try{
    const r=await api('/pagos/reparto/cotizacion',{method:'POST',headers:headers(true),body:JSON.stringify({monto:total,fechaOperacion:date,horaOperacion:hour,reparto:normalized})});
    if(current!==revision)return;
    plan=r.data;
    if(plan.fechaOperacionReal&&plan.fechaOperacionReal!==date){date=plan.fechaOperacionReal;fechaResuelta(date);}
    for(const h of catalog.viviendas){
     const assigned=plan.distribuciones.find(d=>d.casaId===h.casaId);
     const info=document.getElementById('allocationPlan'+h.casaId);
     info.textContent=assigned?'Recargo incluido: '+money(assigned.plan.recargo)+' · Meses: '+assigned.plan.meses+' · Corte objetivo: '+(assigned.plan.fechaFinalObjetivo||'Sin avance'):'Sin asignación';
    }
    loading=false;paintStatus('Reparto verificado: '+money(total)+'. Puedes reportar el pago.');
   }catch(e){if(current!==revision)return;loading=false;error=e.message;paintStatus(error);}
  }
  async function cargar(){
   const r=await api('/pagos/reparto',{headers:headers()});catalog=r.data;
   list.replaceChildren();values=new Map();
   if(!catalog.habilitado)return;
   for(const h of catalog.viviendas){
    const row=document.createElement('div');row.className='allocation-house';
    const label=document.createElement('label');label.htmlFor='allocationAmount'+h.casaId;
    const title=document.createElement('strong');title.textContent=h.calle+' · Casa '+h.numero;
    const debt=document.createElement('span');debt.textContent='Adeudo al '+catalog.fecha+': '+money(h.adeudo)+(h.pendiente?' · Tiene un reporte en revisión':'');
    label.append(title,debt);
    const input=document.createElement('input');input.id=label.htmlFor;input.type='number';input.min='0';input.step='0.01';input.inputMode='decimal';input.value='0.00';input.disabled=h.pendiente;
    input.setAttribute('aria-label','Importe para '+h.calle+' casa '+h.numero);values.set(h.casaId,'0');
    input.addEventListener('input',()=>{values.set(h.casaId,input.value);return actualizar(mode,ready,total,date);});
    const info=document.createElement('small');info.id='allocationPlan'+h.casaId;info.className='allocation-plan';
    row.append(label,input,info);list.append(row);
   }
  }
  return {cargar,actualizar,reset,activo:type=>type==='MANTENIMIENTO'&&catalog?.habilitado,valido:valid,datos:()=>{
   if(!valid()||!active())throw Error('Verifica el reparto antes de reportar.');
   return plan.distribuciones.map(d=>({casaId:d.casaId,monto:d.monto}));
  }};
 }};
})(window);
