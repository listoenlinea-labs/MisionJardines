(() => {
      const API = 'https://api-misionjardines.listoenlinea.host/api';
      const token = localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
      if (!token) { location.replace('login.html'); return; }

      const byId = id => document.getElementById(id);
      const range = amount => Array.from({ length: amount }, (_, index) => ({ number: String(index + 1) }));
      const fromList = value => value.split(',').map(number => ({ number: number.trim() })).filter(item => item.number);
      const sections = [
        { key: 'Gardenias', houses: range(32) },
        { key: 'Magnolias', houses: range(32) },
        { key: 'Lirios', houses: range(39) },
        { key: 'Rosas', houses: range(42) },
        { key: 'Jardines 1', houses: fromList('116,120,124,125,128,129,132,133,136,137,141,142,144,145,148,149,152,153,156,157,160,161,164,165,168,169,173,177,181,185') },
        { key: 'Jardines 2', houses: fromList('201,205,209,213,217,221,233,237,241,245,249,253,257,269,273,277,281,285,289') },
        { key: 'Jardines 3', houses: fromList('307,311,315,319,323,327,328,331,332,335,336,339,340,343,344,347,348,351,352,355,356,359,360,363,364,367,368,371,372,375,376,379,380,384,388') },
        {
          key: 'Exterior',
          houses: [
            { number: '3614', label: 'Valle de México', lookup: 'Valle de México' },
            { number: '752', label: 'Atotonilco', lookup: 'Atotonilco' },
            { number: '707', label: 'Guadalajara', lookup: 'Guadalajara' }
          ]
        }
      ];

      // Solo orden de pantalla: lookup y numeración de llamadas intactos.
      sections.sort((a,b)=>a.key.localeCompare(b.key,'es-MX',{numeric:true,sensitivity:'base'}));
      sections.forEach(section=>section.houses.sort((a,b)=>String(a.number).localeCompare(String(b.number),'es-MX',{numeric:true})));
      const caller = new TelefoniaEngine({ api: API, token, status: setStatus });
      let activeSection = sections[0];
      let pendingPhones = [];
      let requestNumber = 0;
      const isIPhone = /iPhone|iPod/i.test(navigator.userAgent);
      let selectedHouse = null;
      let modoCaseta = false;
      const caseta = crearConmutadorCaseta({ api, mostrarEstado: setStatus });
      function attempt(house) {
        return fetch(API + '/conmutador/historial', {
          method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
          body:JSON.stringify({grupo:house.lookup,numero:house.number}),
          keepalive:true,cache:'no-store'
        }).catch(()=>{});
      }
      function callFromIPhone(number, house) {
        const raw=String(number||'').trim();
        const digits=raw.replace(/\D/g,'');
        if(!/^\+?[\d\s()\-]{10,22}$/.test(raw)||!/^\d{10,13}$/.test(digits)){
          setStatus('Teléfono no válido para llamada normal.','error');return;
        }
        void attempt(house);
        setStatus('Confirma la llamada desde el marcador del iPhone.','ok');
        window.location.href='tel:'+(raw.startsWith('+')?'+':'')+digits;
      }
      function phoneOnIPhone(phones,house){
        selectedHouse=house;
        pendingPhones=phones.slice(0,2);
        byId('phoneChoiceTitle').textContent=phones.length>1?'¿A cuál deseas llamar?':'¿Llamar a esta vivienda?';
        byId('phoneChoiceDescription').textContent='Se abrirá el marcador del iPhone sin WhatsApp. No mostramos números.';
        const first=document.querySelector('[data-phone-choice="0"]');
        first.textContent=phones.length>1?'A':'Llamar';
        document.querySelector('[data-phone-choice="1"]').hidden=phones.length<2;
        closeCallModal();
        byId('phoneChoiceModal').classList.add('show');
      }
      // Consultar todos los intentos del día; ni paginación ni datos privados.
      const HISTORY_CACHE_MS=15000;
      const historyCache=new Map(),historyDate=byId('historyDate');
      function localToday(){
        const d=new Date();
        return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      }
      // El historial no empieza en Hoy: la API elige el último día registrado.
      historyDate.value='';
      let historySeq=0,historyController=null,historyOpened=false;
      let historyAdjacent={anterior:null,siguiente:null};
      const historyPrevious=byId('historyPrevious'),historyNext=byId('historyNext');
      function setHistoryNavigation(busy=false){
        historyPrevious.disabled=busy||!historyAdjacent.anterior;
        historyNext.disabled=busy||!historyAdjacent.siguiente;
        historyPrevious.title=historyAdjacent.anterior?
          'Ir al '+historyAdjacent.anterior.split('-').reverse().join('/'):'No hay llamadas anteriores';
        historyNext.title=historyAdjacent.siguiente?
          'Ir al '+historyAdjacent.siguiente.split('-').reverse().join('/'):'No hay llamadas posteriores';
      }
      setHistoryNavigation(true);
      function renderHistory(result){
        historyDate.value=result.fecha||localToday();
        historyAdjacent={
          anterior:result.fechaAnterior||null,
          siguiente:result.fechaSiguiente||null
        };
        const rows=Array.isArray(result.registros)?result.registros:[];
        const fragment=document.createDocumentFragment();
        if(!rows.length){
          const empty=document.createElement('p');
          empty.className='history-empty';
          empty.textContent=result.fecha===null?'Todavía no hay intentos de llamada registrados.':
            'No se registraron intentos de llamada en esta fecha.';
          fragment.appendChild(empty);
        }
        for(const item of rows){
          const row=document.createElement('div');
          row.className='history-item';
          const house=document.createElement('strong');
          house.textContent=String(item.grupo||'')+' '+String(item.numero||'');
          const stamp=document.createElement('span');
          const [date,time]=String(item.fecha_hora||'').split(' ');
          stamp.textContent=(date?date.split('-').reverse().join('/'):'')+' · '+(time||'').slice(0,5);
          row.append(house,stamp);fragment.appendChild(row);
        }
        byId('historyList').replaceChildren(fragment);
        byId('historyCount').textContent=rows.length===1?'1 intento de llamada':rows.length+' intentos de llamada';
        byId('historyStatus').textContent='';
        byId('refreshHistory').disabled=false;
        setHistoryNavigation();
      }
      async function loadHistory({force=false,latest=false}={}){
        const fecha=historyDate.value;
        if(!latest&&!/^\d{4}-\d{2}-\d{2}$/.test(fecha)){
          byId('historyStatus').textContent='Selecciona una fecha válida.';
          return;
        }
        const seq=++historySeq;
        historyController?.abort();
        historyController=new AbortController();
        const cached=!latest&&historyCache.get(fecha);
        if(!force&&cached&&Date.now()-cached.at<HISTORY_CACHE_MS){
          renderHistory(cached.data);
          return;
        }
        byId('refreshHistory').disabled=true;
        setHistoryNavigation(true);
        byId('historyStatus').textContent=latest?
          'Buscando la fecha más reciente con llamadas…':
          'Consultando el '+fecha.split('-').reverse().join('/')+'…';
        try{
          const path=latest?'/conmutador/historial':
            '/conmutador/historial?fecha='+encodeURIComponent(fecha);
          const result=await api(path,{signal:historyController.signal});
          if(seq!==historySeq)return;
          if(!Array.isArray(result.registros)||
            (latest?!(!result.fecha||/^\d{4}-\d{2}-\d{2}$/.test(result.fecha)):
              result.fecha!==fecha))
            throw Error('Respuesta de historial inválida.');
          if(result.fecha){
            historyCache.set(result.fecha,{at:Date.now(),data:result});
            if(historyCache.size>5)historyCache.delete(historyCache.keys().next().value);
          }
          renderHistory(result);
        }catch(error){
          if(seq!==historySeq)return;
          byId('historyList').replaceChildren();
          byId('historyCount').textContent='Sin datos verificados para esta fecha';
          byId('historyStatus').textContent=error.message||'No se pudo consultar el historial.';
          if(latest)historyOpened=false; // Reintentar última fecha al volver a la pestaña.
          byId('refreshHistory').disabled=false;
          setHistoryNavigation(true);
        }
      }
      function navigateHistoryDate(direction){
        const fecha=historyAdjacent[direction];
        if(!fecha)return;
        historyDate.value=fecha;
        void loadHistory();
      }
      // La pestaña privada se habilita ÚNICAMENTE tras verificar el rol con el backend.
      let contactosAdmin = null;
      function mostrarPanel(vista) {
        const history = vista === 'historial', contacts = vista === 'contactos';
        byId('homesPanel').hidden = vista !== 'viviendas';
        byId('historyPanel').hidden = !history;
        byId('contactsPanel').hidden = !contacts;
        byId('callStatus').hidden = history || contacts;
        for(const [id,visible] of [['showHomes',vista==='viviendas'],['showHistory',history],['showContacts',contacts]]) {
          byId(id).classList.toggle('active',visible);
          byId(id).setAttribute('aria-pressed',String(visible));
        }
        if(history){
          if(!historyOpened){
            historyOpened=true;
            void loadHistory({latest:true,force:true});
          }else void loadHistory();
        }
        if(contacts) contactosAdmin?.open();
      }
      byId('showHistory').addEventListener('click',()=>mostrarPanel('historial'));
      byId('showHomes').addEventListener('click',()=>mostrarPanel('viviendas'));
      historyDate.addEventListener('change',()=>{void loadHistory();});
      historyPrevious.addEventListener('click',()=>navigateHistoryDate('anterior'));
      historyNext.addEventListener('click',()=>navigateHistoryDate('siguiente'));
      byId('historyToday').addEventListener('click',()=>{
        historyDate.value=localToday();void loadHistory({force:true});
      });
      byId('refreshHistory').addEventListener('click',()=>{
        historyCache.delete(historyDate.value);
        void loadHistory({force:true,latest:!historyDate.value});
      });
      Promise.resolve(window.MJAccessReady).then(autorizado => {
        if(autorizado !== true || window.MJVerifiedRole !== 'ADMINISTRADOR')return;
        contactosAdmin = window.crearContactosConmutadorAdmin({api, sections});
        byId('showContacts').hidden = false;
        byId('showContacts').addEventListener('click',()=>mostrarPanel('contactos'));
      });


      // Modal visible mientras se solicita y confirma una llamada.
      // Los errores se muestran aquí y en la barra de estado existente.
      let callModalVisible=false;
      let callModalReturnFocus=null;
      function openCallModal(message){
        const modal=byId('callProgressModal');
        if(!callModalVisible){
          callModalReturnFocus=document.activeElement;
          callModalVisible=true;
          modal.hidden=false;
          modal.classList.add('show');
        }
        setStatus(message||'Llamando…','loading');
        byId('callProgressClose').focus();
      }
      function closeCallModal(){
        if(!callModalVisible)return;
        callModalVisible=false;
        const modal=byId('callProgressModal');
        modal.classList.remove('show');
        modal.hidden=true;
        if(callModalReturnFocus && typeof callModalReturnFocus.focus==='function'){
          try{callModalReturnFocus.focus();}catch(_){}
        }
        callModalReturnFocus=null;
      }
      byId('callProgressClose').addEventListener('click',closeCallModal);
      byId('callProgressModal').addEventListener('click',event=>{
        if(event.target===byId('callProgressModal'))closeCallModal();
      });

      function setStatus(message, kind) {
        const status = byId('callStatus');
        status.className = 'statusbar' + (kind ? ' ' + kind : '');
        status.textContent = message || '';
        status.hidden = !message;
        if(callModalVisible){
          const variant=kind==='error'?'error':kind==='ok'?'ok':'loading';
          const modal=byId('callProgressModal');
          modal.dataset.status=variant;
          byId('callProgressTitle').textContent=variant==='error'
            ?'No se pudo confirmar la llamada'
            :variant==='ok'?'Resultado de la llamada':'Llamando…';
          byId('callProgressDescription').textContent=message||'Preparando solicitud…';
        }
      }

      async function api(path, options = {}) {
        const headers = { Authorization: 'Bearer ' + token };
        if (options.body) headers['Content-Type'] = 'application/json';
        const response = await fetch(API + path, { ...options, headers, cache: 'no-store' });
        let data = {};
        try { data = await response.json(); } catch (_) {}
        if (response.status === 401) { location.replace('login.html'); throw Error('La sesión expiró'); }
        if (!response.ok || data.ok === false) throw Error(data.message || 'No fue posible consultar el padrón');
        return data;
      }

      function isCommerce(sectionKey, number) {
        return (sectionKey === 'Gardenias' && number === '28') || (sectionKey === 'Lirios' && number === '32');
      }

      function renderTabs() {
        const tabs = byId('streetTabs');
        tabs.innerHTML = '';
        sections.forEach(section => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'street-tab' + (section.key === activeSection.key ? ' active' : '');
          button.textContent = section.key;
          button.setAttribute('role', 'tab');
          button.setAttribute('aria-selected', section.key === activeSection.key ? 'true' : 'false');
          button.addEventListener('click', () => {
            activeSection = section;
            renderTabs();
            renderHouses();
          });
          tabs.appendChild(button);
        });
      }

      function renderHouses() {
        byId('streetTitle').textContent = activeSection.key;
        byId('houseCount').textContent = activeSection.houses.length + (activeSection.houses.length === 1 ? ' domicilio' : ' domicilios');
        const grid = byId('houseGrid');
        grid.innerHTML = '';

        activeSection.houses.forEach(house => {
          const button = document.createElement('button');
          const commerce = isCommerce(activeSection.key, house.number);
          button.type = 'button';
          button.className = 'house-btn' + (commerce ? ' commerce' : '') + (activeSection.key === 'Exterior' ? ' exterior' : '');
          button.dataset.houseNumber = house.number;
          button.dataset.lookup = house.lookup || activeSection.key;

          if (activeSection.key === 'Exterior') {
            const label = document.createElement('small');
            label.textContent = house.label;
            button.appendChild(label);
          }

          const number = document.createElement('span');
          number.textContent = house.number;
          button.appendChild(number);

          if (commerce) {
            const badge = document.createElement('span');
            badge.className = 'commerce-badge';
            badge.textContent = 'Comercio';
            button.appendChild(badge);
          }

          button.setAttribute('aria-label', (house.label ? house.label + ' ' : activeSection.key + ' casa ') + house.number + (commerce ? ', comercio' : ''));
          button.addEventListener('click', () => selectHouse(button, house));
          grid.appendChild(button);
        });
      }

      function openPhoneChoice(phones, house) {
        closeCallModal();
        selectedHouse = house;
        pendingPhones = phones.slice(0, 2);
        byId('phoneChoiceModal').classList.add('show');
        document.querySelector('[data-phone-choice="0"]').focus();
      }

      function closePhoneChoice() {
        pendingPhones = [];
        byId('phoneChoiceModal').classList.remove('show');
      }

      function normalizeWhatsAppNumber(number) {
        let digits = String(number || '').replace(/\D/g, '');
        if (digits.length === 13 && digits.startsWith('521')) digits = '52' + digits.slice(3);
        if (digits.length === 10) digits = '52' + digits;
        return /^52\d{10}$/.test(digits) ? digits : '';
      }

      function openWhatsApp(number, preparedWindow = null) {
        const destination = normalizeWhatsAppNumber(number);
        if (!destination) {
          try { if (preparedWindow && !preparedWindow.closed) preparedWindow.close(); } catch (_) {}
          setStatus('El teléfono registrado no tiene un formato válido para WhatsApp en México.', 'error');
          return;
        }

        const url = 'misionjardines-call://call?phone=' + destination;
        let target = preparedWindow;

        try {
          if (!target || target.closed) target = window.open('', 'mj-whatsapp-caseta');
          if (!target) {
            setStatus('El navegador bloqueó WhatsApp. Habilita ventanas emergentes para este sitio e intenta de nuevo.', 'error');
            return;
          }
          target.opener = null;
          target.location.replace(url);
          setStatus('Enviando la llamada a WhatsApp Desktop desde la cuenta autorizada 33••••8609…', 'ok');
          setTimeout(() => { try { if (target && !target.closed) target.close(); } catch (_) {} }, 1800);
        } catch (_) {
          setStatus('No fue posible iniciar el agente de llamadas. Verifica que el agente Misión Jardines y WhatsApp para Windows estén instalados.', 'error');
        }
      }

      async function selectHouse(button, house) {
        const currentRequest = ++requestNumber;
        const preparedWindow = isIPhone || modoCaseta ? null : caller.prepareWindow();
        openCallModal('Llamando… Buscando el contacto de la vivienda.');
        if (preparedWindow) {
          try {
            preparedWindow.document.title = 'Misión Jardines · WhatsApp';
            preparedWindow.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px">Preparando WhatsApp…</p>';
          } catch (_) {}
        }
        document.querySelectorAll('.house-btn').forEach(item => { item.disabled = true; });
        setStatus('Buscando el teléfono registrado para este domicilio…');

        try {
          const params = new URLSearchParams({
            grupo: house.lookup || activeSection.key,
            numero: house.number
          });
          if (modoCaseta) {
            const domicilio = { grupo: params.get('grupo'), numero: params.get('numero') };
            const contactos = await caseta.contactos(domicilio);
            if (currentRequest !== requestNumber) return;
            if (!contactos.length) {
              setStatus('Esta vivienda no tiene un contacto disponible.', 'error');
              return;
            }
            if (contactos.length === 1) {
              await caseta.llamar(domicilio, contactos[0]);
              return;
            }
            openPhoneChoice(contactos, domicilio);
            byId('phoneChoiceDescription').textContent = 'Contesta el teléfono fijo de caseta cuando timbre.';
            setStatus('');
            return;
          }
          const data = await api('/busqueda/conmutador/telefono?' + params.toString());
          if (currentRequest !== requestNumber) return;

          const phones = Array.isArray(data.telefonos) ? data.telefonos.filter(Boolean).slice(0, 2) : [];
          if (!phones.length) {
            try { if (preparedWindow && !preparedWindow.closed) preparedWindow.close(); } catch (_) {}
            setStatus('Este domicilio no tiene un teléfono registrado en el padrón.', 'error');
            return;
          }

          if (isIPhone) {
            phoneOnIPhone(phones,{lookup:house.lookup||activeSection.key,number:house.number});
            return;
          }
          if (phones.length > 1) {
            try { if (preparedWindow && !preparedWindow.closed) preparedWindow.close(); } catch (_) {}
            setStatus('Este domicilio tiene dos teléfonos. Elige A o B para llamar.');
            openPhoneChoice(phones, { lookup: house.lookup || activeSection.key, number: house.number });
            return;
          }

          void attempt({lookup:house.lookup||activeSection.key,number:house.number});
          await caller.call(phones[0], preparedWindow, openWhatsApp);
        } catch (error) {
          try { if (preparedWindow && !preparedWindow.closed) preparedWindow.close(); } catch (_) {}
          if (currentRequest === requestNumber) setStatus(error.message, 'error');
        } finally {
          if (currentRequest === requestNumber) {
            document.querySelectorAll('.house-btn').forEach(item => { item.disabled = false; });
          }
        }
      }


      document.querySelectorAll('[data-phone-choice]').forEach(button => {
        button.addEventListener('click', async () => {
          const selected = pendingPhones[Number(button.dataset.phoneChoice)];
          const house=selectedHouse;
          closePhoneChoice();
          selectedHouse=null;
          if(!selected)return;
          openCallModal('Llamando… Preparando la comunicación.');
          try{
            if(modoCaseta && house)await caseta.llamar(house, selected);
            else if(isIPhone && house)callFromIPhone(selected,house);
            else{
              if(house)void attempt(house);
              await caller.call(selected, caller.prepareWindow(), openWhatsApp);
            }
          }catch(error){setStatus(error.message||'No se pudo iniciar la llamada.','error');}
        });
      });
      byId('closePhoneChoice').addEventListener('click', closePhoneChoice);
      byId('phoneChoiceModal').addEventListener('click', event => {
        if (event.target === byId('phoneChoiceModal')) closePhoneChoice();
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {closePhoneChoice();closeCallModal();}
      });

      renderTabs();
      renderHouses();
      document.querySelectorAll('.house-btn').forEach(item => { item.disabled = true; });
      caseta.modo().then(async habilitado => {
        modoCaseta = habilitado;
        if (modoCaseta || isIPhone) {
          setStatus('');
          document.querySelectorAll('[data-call-description]').forEach(el => {
            el.textContent = modoCaseta ? 'Elige una vivienda y contesta el teléfono fijo de caseta cuando timbre.'
              : 'Elige una vivienda para llamar desde el iPhone sin WhatsApp.';
          });
          document.querySelectorAll('[data-whatsapp-only]').forEach(el => { el.hidden = true; });
          return;
        }
        await caller.init();
      }).then(() => {
        document.querySelectorAll('.house-btn').forEach(item => { item.disabled = false; });
      }).catch(error => setStatus(error.message, 'error'));
    })();
