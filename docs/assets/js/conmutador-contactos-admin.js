/* Agenda privada de contactos del conmutador: nunca inicializar para roles ajenos. */
window.crearContactosConmutadorAdmin = function ({ api, sections }) {
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
  const clean = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLocaleLowerCase('es-MX').trim();
  const locales = 'es-MX';
  const domicilios = sections.flatMap(section => section.houses.map(house => ({
    grupo: house.lookup || section.key,
    numero: String(house.number),
    calle: house.label || section.key
  }))).sort((a,b) => a.calle.localeCompare(b.calle,locales,{numeric:true,sensitivity:'base'}) ||
    a.numero.localeCompare(b.numero,locales,{numeric:true}));
  const media = window.matchMedia('(max-width: 700px)');
  const search = $('contactSearch'), street = $('contactStreet'), tbody = $('contactRows');
  const cards = $('contactCards'), info = $('contactCount'), state = $('contactState');
  const previous = $('contactPrevious'), next = $('contactNext'), indicator = $('contactPageIndicator');
  let page = 1, current = [], editing = '', requestId = 0, loaded = false, saving = false;
  const key = row => row.grupo + '|' + row.numero;
  const pageSize = () => media.matches ? 3 : 10;

  [...new Set(domicilios.map(x => x.calle))].sort((a,b) =>
    a.localeCompare(b,locales,{numeric:true,sensitivity:'base'})).forEach(calle => {
    const option = document.createElement('option');
    option.value = calle; option.textContent = calle; street.append(option);
  });
  function say(message, error = false) {
    state.textContent = message || '';
    state.classList.toggle('error',error);
    state.hidden = !message;
  }
  function filtered() {
    const q = clean(search.value).replace(/\s+/g,' ');
    const selected = street.value;
    return domicilios.filter(row => (!selected || row.calle === selected) &&
      (!q || clean(row.calle + ' ' + row.numero).includes(q) ||
        clean(row.calle).includes(q) || clean(row.numero).includes(q)));
  }
  function phoneInputs(row, mobile) {
    const first = escape(row.telefonos?.[0] || '');
    const second = escape(row.telefonos?.[1] || '');
    const type = mobile ? 'mobile' : 'table';
    return '<div class="contact-fields"><label>Contacto A<input type="tel" data-phone-a ' +
      'inputmode="tel" autocomplete="off" maxlength="24" value="' + first +
      '" aria-label="Número A de ' + escape(row.calle+' '+row.numero) + '"></label>' +
      '<label>Contacto B<input type="tel" data-phone-b inputmode="tel" autocomplete="off" ' +
      'maxlength="24" value="' + second + '" aria-label="Número B de ' +
      escape(row.calle+' '+row.numero) + '"></label></div>';
  }
  function actions(row) {
    const active = editing === key(row);
    return active ?
      '<div class="contact-actions"><button class="contact-save" type="button" data-action="save">Guardar</button>' +
      '<button class="contact-cancel" type="button" data-action="cancel">Cancelar</button></div>' :
      '<button class="contact-edit" type="button" data-action="edit">Editar números</button>';
  }
  function displayPhone(phone) {
    return phone ? '<span class="contact-phone">' + escape(phone) + '</span>' :
      '<span class="contact-missing">Sin número</span>';
  }
  function paint() {
    tbody.innerHTML = current.map(row => {
      const active = editing === key(row);
      return '<tr data-contact-key="' + escape(key(row)) + '"' + (active?' class="editing"':'') + '>' +
        '<td>' + escape(row.calle) + '</td><td>' + escape(row.numero) + '</td>' +
        (active ?
          '<td colspan="2">' + phoneInputs(row,false) + '</td>' :
          '<td>' + displayPhone(row.telefonos?.[0]) + '</td><td>' + displayPhone(row.telefonos?.[1]) + '</td>') +
        '<td>' + actions(row) + '</td></tr>';
    }).join('') || '<tr><td colspan="5">No hay viviendas para estos filtros.</td></tr>';
    cards.innerHTML = current.map(row => {
      const active = editing === key(row);
      return '<article class="contact-card'+(active?' editing':'')+'" data-contact-key="'+escape(key(row))+'">' +
        '<div class="contact-line"><span>Calle</span><strong>' + escape(row.calle) + '</strong></div>' +
        '<div class="contact-line"><span>Casa</span><strong>' + escape(row.numero) + '</strong></div>' +
        (active ? '<div class="contact-mobile-editor">' + phoneInputs(row,true) + '</div>' :
          '<div class="contact-line"><span>Contacto A</span><strong>' + displayPhone(row.telefonos?.[0]) + '</strong></div>' +
          '<div class="contact-line"><span>Contacto B</span><strong>' + displayPhone(row.telefonos?.[1]) + '</strong></div>') +
        '<div class="contact-line contact-card-action"><span>Acción</span>' + actions(row) + '</div></article>';
    }).join('') || '<p class="contact-empty">No hay viviendas para estos filtros.</p>';
  }
  async function load() {
    const request = ++requestId, rows = filtered(), size = pageSize();
    const pages = Math.max(1,Math.ceil(rows.length/size));
    page = Math.max(1,Math.min(page,pages));
    const first = (page - 1)*size, selected = rows.slice(first,first+size);
    editing = '';
    indicator.textContent = 'Página ' + page + ' de ' + pages;
    info.textContent = rows.length ?
      'Mostrando ' + (first+1) + '–' + Math.min(first+size,rows.length) + ' de ' + rows.length + ' viviendas' :
      '0 viviendas encontradas';
    previous.disabled = page <= 1;
    next.disabled = page >= pages;
    say('Consultando números del conmutador…');
    if (!selected.length) { current=[];paint();say('');return; }
    try {
      const data = await api('/busqueda/conmutador/contactos-admin/consultar',{
        method:'POST',body:JSON.stringify({domicilios:selected.map(({grupo,numero})=>({grupo,numero}))})
      });
      if (request !== requestId) return;
      const phoneMap = new Map((data.contactos || []).map(item=>[key(item),item.telefonos || []]));
      current = selected.map(item=>({...item,telefonos:phoneMap.get(key(item)) || []}));
      paint(); say('');
    } catch (error) {
      if(request !== requestId)return;
      current = [];paint();say(error.message || 'No se pudieron cargar los contactos',true);
    }
  }
  async function editClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || saving) return;
    const host = button.closest('[data-contact-key]');
    if (!host) return;
    const row = current.find(item=>key(item)===host.dataset.contactKey);
    if (!row) return;
    const action = button.dataset.action;
    if (action === 'edit') { editing=key(row);paint();return; }
    if (action === 'cancel') { editing='';paint();return; }
    if (action !== 'save') return;
    const a = host.querySelector('[data-phone-a]').value.trim();
    const b = host.querySelector('[data-phone-b]').value.trim();
    if ((a && !/^[+()\d\s-]{10,24}$/.test(a)) || (b && !/^[+()\d\s-]{10,24}$/.test(b))) {
      say('Escribe teléfonos válidos de 10 dígitos, sin letras.',true);return;
    }
    saving = true; button.disabled = true;
    try {
      await api('/busqueda/conmutador/contactos-admin', {
        method:'PUT',body:JSON.stringify({grupo:row.grupo,numero:row.numero,telefonos:[a,b]})
      });
      editing = '';say('Números guardados. El conmutador usará estos destinos.',false);
      await load();
      say('Números guardados correctamente.');
    }catch(error){say(error.message || 'No se pudieron guardar los números.',true);button.disabled=false;}
    finally {saving=false;}
  }
  for (const root of [tbody,cards]) root.addEventListener('click',event=>{void editClick(event);});
  search.addEventListener('input',()=>{page=1;void load();});
  street.addEventListener('change',()=>{page=1;void load();});
  $('contactClear').addEventListener('click',()=>{search.value='';street.value='';page=1;void load();});
  previous.addEventListener('click',()=>{if(page>1){page--;void load();}});
  next.addEventListener('click',()=>{page++;void load();});
  $('contactRefresh').addEventListener('click',()=>void load());
  if (media.addEventListener) media.addEventListener('change',()=>{page=1;void load();});
  return { open() { if(!loaded){loaded=true;} void load(); } };
};
