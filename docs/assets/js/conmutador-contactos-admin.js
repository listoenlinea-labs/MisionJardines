/* Agenda privada del conmutador; visible solo tras comprobar rol ADMINISTRADOR. */
window.crearContactosConmutadorAdmin = function ({ api, sections }) {
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
  const clean = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('es-MX').trim();
  const digits = value => String(value||'').replace(/\D/g,'');
  const locale = 'es-MX';
  const addresses = sections.flatMap(section => section.houses.map(house => ({
    grupo:house.lookup||section.key,numero:String(house.number),calle:house.label||section.key
  }))).sort((a,b) => a.calle.localeCompare(b.calle,locale,{numeric:true,sensitivity:'base'}) ||
    a.numero.localeCompare(b.numero,locale,{numeric:true}));
  const key = row => row.grupo+'|'+row.numero;
  const media = window.matchMedia('(max-width: 700px)');
  const search = $('contactSearch'), street = $('contactStreet'), statusFilter = $('contactStatusFilter');
  const tbody = $('contactRows'), cards = $('contactCards'), state = $('contactState');
  const count = $('contactCount'), previous = $('contactPrevious'), next = $('contactNext');
  const indicator = $('contactPageIndicator');
  let records=[],page=1,editing='',busy=false,loaded=false,loading=null,requestVersion=0;
  const pageSize = () => media.matches?3:10;
  [...new Set(addresses.map(row=>row.calle))].sort((a,b)=>a.localeCompare(b,locale,{numeric:true,sensitivity:'base'}))
    .forEach(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;street.append(option);});
  function message(text,error=false) {
    state.hidden=!text;state.textContent=text||'';state.classList.toggle('error',error);
  }
  function matches(row) {
    if(street.value && street.value!==row.calle)return false;
    const hasPhone=(row.telefonos||[]).some(Boolean);
    if(statusFilter.value==='sin'&&hasPhone)return false;
    if(statusFilter.value==='con'&&!hasPhone)return false;
    const q=clean(search.value).replace(/\s+/g,' ');
    if(!q)return true;
    const phoneQuery=digits(q);
    const phoneSearch=/^[+()\d\s-]+$/.test(search.value.trim()) && phoneQuery.length>=2;
    return clean(row.calle+' '+row.numero).includes(q) || clean(row.calle).includes(q) ||
      clean(row.numero).includes(q) || clean(row.propietario).includes(q) ||
      (phoneSearch&&(row.telefonos||[]).some(phone=>digits(phone).includes(phoneQuery)));
  }
  function actions(row) {
    if(editing===key(row))return '<div class="contact-actions"><button class="contact-save" type="button" data-action="save">Guardar</button>'+
      '<button class="contact-cancel" type="button" data-action="cancel">Cancelar</button></div>';
    return '<button class="contact-edit" type="button" data-action="edit">Editar contacto</button>';
  }
  function fieldEditor(row) {
    return '<div class="contact-fields">'+
      '<label>Propietario<input data-owner type="text" maxlength="150" autocomplete="off" value="'+escape(row.propietario||'')+'"></label>'+
      '<label>Contacto<input data-phone type="tel" maxlength="24" inputmode="tel" autocomplete="off" value="'+escape(row.telefonos?.[0]||'')+'"></label></div>';
  }
  function ownerDisplay(row) {
    return row.propietario?'<strong class="contact-owner">'+escape(row.propietario)+'</strong>':
      '<span class="contact-missing">Sin nombre</span>';
  }
  function phoneDisplay(row) {
    return row.telefonos?.[0]?'<strong class="contact-phone">'+escape(row.telefonos[0])+'</strong>':
      '<span class="contact-missing">Sin número</span>';
  }
  function paint() {
    const filtered=records.filter(matches);
    const total=Math.max(1,Math.ceil(filtered.length/pageSize()));
    page=Math.min(total,Math.max(1,page));
    const start=(page-1)*pageSize();
    const visible=filtered.slice(start,start+pageSize());
    count.textContent=filtered.length?
      'Mostrando '+(start+1)+'–'+Math.min(start+pageSize(),filtered.length)+' de '+filtered.length+' viviendas':
      '0 viviendas encontradas';
    indicator.textContent='Página '+page+' de '+total;
    previous.disabled=page<=1||busy;
    next.disabled=page>=total||busy;
    tbody.innerHTML=visible.map(row=>{
      const edit=editing===key(row);
      return '<tr data-contact-key="'+escape(key(row))+'"'+(edit?' class="editing"':'')+'>'+
        '<td>'+escape(row.calle)+'</td><td>'+escape(row.numero)+'</td>'+
        (edit?'<td colspan="2">'+fieldEditor(row)+'</td>':
          '<td>'+ownerDisplay(row)+'</td><td>'+phoneDisplay(row)+'</td>')+
        '<td>'+actions(row)+'</td></tr>';
    }).join('')||'<tr><td colspan="5">No hay viviendas para esos filtros.</td></tr>';
    cards.innerHTML=visible.map(row=>{
      const edit=editing===key(row);
      return '<article class="contact-card'+(edit?' editing':'')+'" data-contact-key="'+escape(key(row))+'">'+
        '<div class="contact-line"><span>Calle</span><strong>'+escape(row.calle)+'</strong></div>'+
        '<div class="contact-line"><span>Casa</span><strong>'+escape(row.numero)+'</strong></div>'+
        (edit?'<div class="contact-mobile-editor">'+fieldEditor(row)+'</div>':
          '<div class="contact-line"><span>Propietario</span>'+ownerDisplay(row)+'</div>'+
          '<div class="contact-line"><span>Contacto</span>'+phoneDisplay(row)+'</div>')+
        '<div class="contact-line contact-card-action"><span>Acciones</span>'+actions(row)+'</div></article>';
    }).join('')||'<p class="contact-empty">No hay viviendas para esos filtros.</p>';
  }
  async function reload(force=false) {
    if(busy)return;
    if(loaded&&!force){paint();return;}
    if(loading)return loading;
    const version=++requestVersion;
    message('Consultando todos los contactos del conmutador…');
    loading=(async()=>{
      try{
        const data=await api('/busqueda/conmutador/contactos-admin/consultar',{
          method:'POST',body:JSON.stringify({domicilios:addresses.map(({grupo,numero})=>({grupo,numero}))})
        });
        if(version!==requestVersion)return;
        const map=new Map((data.contactos||[]).map(row=>[key(row),row]));
        records=addresses.map(address=>{
          const source=map.get(key(address));
          return {...address,telefonos:Array.isArray(source?.telefonos)?source.telefonos:[],
            propietario:String(source?.propietario||'')};
        });
        loaded=true;editing='';paint();message('');
      }catch(error){
        message(error.message||'No fue posible consultar la agenda.',true);
        if(!loaded){records=[];paint();}
      }finally{loading=null;}
    })();
    return loading;
  }
  async function editClick(event) {
    const button=event.target.closest('button[data-action]');
    if(!button||busy)return;
    const host=button.closest('[data-contact-key]');
    const record=records.find(row=>key(row)===host?.dataset.contactKey);
    if(!record)return;
    if(button.dataset.action==='edit'){editing=key(record);paint();return;}
    if(button.dataset.action==='cancel'){editing='';paint();return;}
    if(button.dataset.action!=='save')return;
    const propietario=host.querySelector('[data-owner]').value.trim();
    const telefono=host.querySelector('[data-phone]').value.trim();
    if(propietario.length>150||telefono&&!/^[+()\d\s-]{10,24}$/.test(telefono)) {
      message('Verifica el nombre y el número de contacto.',true);return;
    }
    busy=true;button.disabled=true;
    try {
      const result=await api('/busqueda/conmutador/contactos-admin',{
        method:'PUT',body:JSON.stringify({grupo:record.grupo,numero:record.numero,propietario,telefono})
      });
      record.propietario=result.propietario;
      record.telefonos=(result.telefonos||[]).filter(Boolean);
      editing='';paint();message(result.sincronizadoRecibos===false?'Contacto guardado en el conmutador. No se encontró una vivienda única para sincronizar con Recibos.':'Propietario y teléfono guardados y sincronizados con Recibos.');
    }catch(error){
      message(error.message||'No se pudieron guardar los cambios.',true);
      button.disabled=false;
    }finally{busy=false;}
  }
  for(const root of [tbody,cards])root.addEventListener('click',event=>void editClick(event));
  function refilter(){page=1;editing='';paint();}
  search.addEventListener('input',refilter);
  street.addEventListener('change',refilter);
  statusFilter.addEventListener('change',refilter);
  $('contactClear').addEventListener('click',()=>{search.value='';street.value='';statusFilter.value='todos';refilter();});
  previous.addEventListener('click',()=>{if(page>1){page--;editing='';paint();}});
  next.addEventListener('click',()=>{page++;editing='';paint();});
  $('contactRefresh').addEventListener('click',()=>void reload(true));
  media.addEventListener?.('change',refilter);
  return {open(){void reload();}};
};
