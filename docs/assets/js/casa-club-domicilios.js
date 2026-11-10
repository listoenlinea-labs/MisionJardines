(() => {
 'use strict';

 const normalizar=valor=>valor.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 const el=id=>document.getElementById(id);

 // Mantener el foco en la caja de texto también al seleccionar desde un celular.
 function selector(input,list,onChange){
  let opciones=[],visibles=[],activo=-1;
  function cerrar(){
   list.hidden=true;
   input.setAttribute('aria-expanded','false');
   input.removeAttribute('aria-activedescendant');
   activo=-1;
  }
  function marcar(indice){
   activo=indice;
   [...list.children].forEach((row,i)=>row.setAttribute('aria-selected',String(i===activo)));
   input.setAttribute('aria-activedescendant',list.children[activo].id);
   list.children[activo].scrollIntoView({block:'nearest'});
  }
  function elegir(valor){
   input.value=valor;
   cerrar();
   onChange?.();
  }
  function mostrar(){
   cerrar();
   if(document.activeElement!==input||input.disabled)return;
   const buscar=normalizar(input.value);
   visibles=opciones.filter(valor=>normalizar(valor).includes(buscar)).slice(0,12);
   if(!visibles.length)return;
   list.replaceChildren(...visibles.map((valor,i)=>{
    const row=document.createElement('div');
    row.id=list.id+'-'+i;
    row.setAttribute('role','option');
    row.setAttribute('aria-selected','false');
    row.textContent=valor;
    row.addEventListener('pointerdown',e=>e.preventDefault());
    row.addEventListener('click',()=>elegir(valor));
    return row;
   }));
   list.hidden=false;
   input.setAttribute('aria-expanded','true');
  }
  input.addEventListener('focus',mostrar);
  input.addEventListener('input',()=>{mostrar();onChange?.();});
  input.addEventListener('blur',cerrar);
  input.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&!list.hidden){event.preventDefault();cerrar();return;}
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    if(list.hidden)mostrar();
    if(list.hidden)return;
    event.preventDefault();
    const siguiente=event.key==='ArrowDown'?activo+1:activo<0?visibles.length-1:activo-1;
    marcar((siguiente+visibles.length)%visibles.length);
   }else if(event.key==='Enter'&&!list.hidden&&activo>=0){
    event.preventDefault();elegir(visibles[activo]);
   }
  });
  return {opciones(values){opciones=values;mostrar();},cerrar};
 }

 window.MJClubAddress=function(api){
  const calle=el('clubStreet'),numero=el('clubNumber'),mensaje=el('clubAddressHint');
  let calles=[],calleActiva='',peticion=0,catalogoDisponible=false;
  const cacheNumeros=new Map();
  const numeros=selector(numero,el('clubNumberOptions'));
  const callesPicker=selector(calle,el('clubStreetOptions'),actualizarCalle);
  const aviso=text=>{mensaje.textContent=text;mensaje.hidden=!text;};
  const consultar=path=>api('/publico/domicilios'+path).then(data=>data.opciones);
  function actualizarCalle(){
   const exacta=calles.find(valor=>normalizar(valor)===normalizar(calle.value));
   calle.setCustomValidity(catalogoDisponible&&calle.value.trim()&&!exacta?'Elige una calle de las sugerencias.':'');
   if(exacta)calle.value=exacta;
   const activa=exacta||(!catalogoDisponible?calle.value.trim():'');
   if(activa===calleActiva)return;
   calleActiva=activa;
   const actual=++peticion;
   numero.value='';
   numero.disabled=!activa;
   numero.placeholder=activa?'Escribe tu número':'Elige primero tu calle';
   numeros.opciones([]);
   if(catalogoDisponible)aviso('');
   if(!catalogoDisponible||!exacta)return;
   if(cacheNumeros.has(exacta)){numeros.opciones(cacheNumeros.get(exacta));return;}
   consultar('?calle='+encodeURIComponent(exacta)).then(opciones=>{
    cacheNumeros.set(exacta,opciones);
    if(peticion===actual)numeros.opciones(opciones);
   }).catch(()=>{if(peticion===actual)aviso('No se pudieron cargar los números. Puedes escribir tu número de casa.');});
  }
  numero.disabled=true;
  consultar('').then(opciones=>{
   calles=opciones;catalogoDisponible=calles.length>0;
   callesPicker.opciones(calles);
   if(!catalogoDisponible)aviso('Puedes escribir tu calle y número.');
   actualizarCalle();
  }).catch(()=>aviso('No se pudieron cargar las sugerencias. Puedes escribir tu calle y número.'));
  el('clubForm').addEventListener('reset',()=>{
   callesPicker.cerrar();
   numeros.cerrar();
   queueMicrotask(actualizarCalle);
  });
 };
})();
