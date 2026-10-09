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

      function setStatus(message, kind) {
        const status = byId('callStatus');
        status.className = 'statusbar' + (kind ? ' ' + kind : '');
        status.textContent = message;
      }

      async function api(path) {
        const response = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token } });
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

      function openPhoneChoice(phones) {
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
        const preparedWindow = caller.prepareWindow();
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
          const data = await api('/busqueda/conmutador/telefono?' + params.toString());
          if (currentRequest !== requestNumber) return;

          const phones = Array.isArray(data.telefonos) ? data.telefonos.filter(Boolean).slice(0, 2) : [];
          if (!phones.length) {
            try { if (preparedWindow && !preparedWindow.closed) preparedWindow.close(); } catch (_) {}
            setStatus('Este domicilio no tiene un teléfono registrado en el padrón.', 'error');
            return;
          }

          if (phones.length > 1) {
            try { if (preparedWindow && !preparedWindow.closed) preparedWindow.close(); } catch (_) {}
            setStatus('Este domicilio tiene dos teléfonos. Elige A o B para llamar.');
            openPhoneChoice(phones);
            return;
          }

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
          closePhoneChoice();
          if (selected) await caller.call(selected, caller.prepareWindow(), openWhatsApp);
        });
      });
      byId('closePhoneChoice').addEventListener('click', closePhoneChoice);
      byId('phoneChoiceModal').addEventListener('click', event => {
        if (event.target === byId('phoneChoiceModal')) closePhoneChoice();
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closePhoneChoice();
      });

      renderTabs();
      renderHouses();
      document.querySelectorAll('.house-btn').forEach(item => { item.disabled = true; });
      caller.init().then(() => {
        document.querySelectorAll('.house-btn').forEach(item => { item.disabled = false; });
      }).catch(error => setStatus(error.message, 'error'));
    })();
