    const API = 'https://api-misionjardines.listoenlinea.host/api';
    const token = localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
    if (!token) location.replace('login.html');
    const $ = id => document.getElementById(id);
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const headers = (json = false) => ({ Authorization: 'Bearer ' + token, ...(json ? { 'Content-Type': 'application/json' } : {}) });
    let validity = null;
    let profile = null, config = null, proofData = '', ocrText = '', proofMeta = { name: '', mime: '' }, paymentType = 'MANTENIMIENTO', extras = [], selectedExtra = null;

    function toast(msg) { $('toast').textContent = msg; $('toast').style.display = 'block'; clearTimeout(window.payToast); window.payToast = setTimeout(() => $('toast').style.display = 'none', 3600) }
    async function api(path, options = {}) { const r = await fetch(API + path, options); let d = {}; try { d = await r.json() } catch { } if (r.status === 401) { location.replace('login.html'); throw Error('La sesión expiró') } if (!r.ok || d.ok === false) throw Error(d.message || 'No fue posible completar la solicitud'); return d }
    const money = v => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
    const role = () => { try { const raw = localStorage.getItem('misionJardinesUsuario') || sessionStorage.getItem('misionJardinesUsuario'); const u = JSON.parse(raw || '{}'); return u?.rol?.nombre || u?.rol || '' } catch { return '' } }
    const fullName = u => [u?.nombre, u?.apellidoPaterno, u?.apellidoMaterno].filter(Boolean).join(' ').trim() || 'Residente';
    function storedUser() {
      try {
        return JSON.parse(
          localStorage.getItem('misionJardinesUsuario') ||
          sessionStorage.getItem('misionJardinesUsuario') ||
          '{}'
        );
      } catch { return {} }
    }
    function paintProfile(user) {
      if (!user) return false;
      const house = user.casa || null;
      $('residentName').textContent = fullName(user);
      if (house) {
        $('houseText').textContent = (house.calle || '') + ' · Casa ' + (house.numero || '');
        $('residentStreet').value = house.calle || '';
        $('residentNumber').value = house.numero || '';
        return Boolean(house.calle || house.numero);
      }
      return false;
    }

    async function loadProfile() {
      // Pintar de inmediato con la información guardada al iniciar sesión,
      // para que Calle y Número no dependan de otras llamadas de Pagos.
      const cached = storedUser();
      paintProfile(cached);

      const d = await api('/auth/perfil', { headers: headers() });
      profile = d.usuario;
      const painted = paintProfile(profile);
      if (!painted) throw Error('Tu usuario no tiene vivienda asociada');
    }
    async function loadConfig() { const d = await api('/pagos/config', { headers: headers() }); config = d.data || {}; $('bankName').textContent = config.banco || 'Cuenta por configurar'; $('bankHolder').textContent = config.titular || '—'; $('bankAccount').textContent = config.cuenta || '—'; $('bankClabe').textContent = config.clabe || '—'; $('bankReference').textContent = config.referencia || 'Usa tu calle y número de casa'; $('legalTitle').textContent = config.legal?.titulo || 'Fundamento y aviso de cuotas'; $('legalText').textContent = config.legal?.texto || 'Pendiente de contenido legal.'; updatePaymentSummary() }
    async function loadExtras() { try { const d = await api('/pagos/extraordinarias', { headers: headers() }); extras = d.data || []; renderExtras() } catch (e) { $('extraList').innerHTML = '<div class="empty">' + esc(e.message) + '</div>' } }
    async function loadReceipts() { try { const d = await api('/pagos/mios', { headers: headers() }); renderReceipts(d.data || []) } catch (e) { $('receiptList').innerHTML = '<div class="empty">' + esc(e.message) + '</div>' } }

    function renderExtras() {
      $('extraList').innerHTML = extras.length ? extras.map(x => '<div class="extra' + (selectedExtra && Number(selectedExtra.id) === Number(x.id) ? ' selected' : '') + '" data-extra="' + Number(x.id) + '"><div><strong>' + esc(x.concepto) + '</strong><small>Cuota extraordinaria activa</small></div><b>' + money(x.monto) + '</b></div>').join('') : '<div class="empty">No hay cuotas extraordinarias activas.</div>';
    }
    function renderReceipts(items) {
      $('receiptList').innerHTML = items.length ? items.map(p => '<div class="receipt-item"><div class="receipt-main"><strong>' + esc(p.reciboFolio || p.folioReporte) + '</strong><p>' + esc(p.concepto) + '<br>' + esc(p.calleSnapshot) + ' · Casa ' + esc(p.numeroCasaSnapshot) + '</p><div class="receipt-meta"><span class="pill ' + esc(p.estatus) + '">' + esc(({ PENDIENTE_VALIDACION: 'Pendiente de validación', VALIDADO: 'Validado', RECHAZADO: 'Rechazado' })[p.estatus] || p.estatus) + '</span><span class="pill">' + (p.tipoPago === 'EXTRAORDINARIO' ? 'Extraordinario' : 'Mantenimiento') + '</span></div></div><div class="receipt-side"><b>' + money(p.monto) + '</b>' + (p.id ? '<button class="receipt-view-btn" type="button" data-receipt-id="' + Number(p.id) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"></path><path d="M14 2v5h5"></path><path d="M9 13h6M9 17h4"></path></svg><span>Ver recibo</span></button>' : '<span class="hint">Recibo no disponible</span>') + '</div></div>').join('') : '<div class="empty">Todavía no tienes recibos registrados.</div>';
    }

    async function openReceipt(id) {
      try {
        const response = await fetch(API + '/pagos/' + Number(id) + '/recibo', { headers: headers() });
        if (response.status === 401) { location.replace('login.html'); return }
        if (!response.ok) {
          let message = 'No fue posible abrir el recibo';
          try { const data = await response.json(); message = data.message || message } catch { }
          throw Error(message);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (error) {
        toast(error.message);
      }
    }

    function currentMonthName() { return new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: 'America/Mexico_City' }).format(new Date()).toUpperCase() }
    function currentMexicoTime() {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Mexico_City',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(new Date());
      const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
      return values.hour + ':' + values.minute + ':' + values.second;
    }
    function updatePaymentSummary() {
      const date = $('operationDate').value;
      if (paymentType === 'EXTRAORDINARIO') {
        const amount = Number(selectedExtra?.monto || 0); $('summaryBase').textContent = selectedExtra ? money(amount) : 'Selecciona una cuota'; $('summaryLate').textContent = money(0); $('lateRow').hidden = true; $('summaryTotal').textContent = money(amount); $('amount').min = amount || 1; $('officialConcept').value = selectedExtra ? 'Pago extraordinario correspondiente a ' + selectedExtra.concepto : 'Selecciona una cuota extraordinaria'; return;
      }
      const base = Number(config?.mantenimiento?.montoBase || 300); const limit = Number(config?.mantenimiento?.diaLimite || 10); const lateFee = Number(config?.mantenimiento?.recargoTardio || 50); const day = date ? Number(date.slice(-2)) : 0; const late = day > limit; const total = base + (late ? lateFee : 0); $('lateRow').hidden = false; $('summaryBase').textContent = money(base); $('summaryLate').textContent = money(late ? lateFee : 0); $('lateRow').classList.toggle('late', late); $('summaryTotal').textContent = money(total); $('ruleAmount').textContent = money(total); $('amount').min = '0.01'; $('officialConcept').value = 'Pago de mantenimiento (abono o mensualidades)'; updatePreview();
    }

    function setTab(type) {
      paymentType = type; document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === type)); $('paymentPreview').hidden = type !== 'MANTENIMIENTO'; $('extraCard').hidden = type !== 'EXTRAORDINARIO'; $('maintenanceRule').hidden = type !== 'MANTENIMIENTO'; $('paymentTitle').textContent = type === 'MANTENIMIENTO' ? 'Reportar mantenimiento' : 'Reportar cuota extraordinaria'; updatePaymentSummary();
    }

    function readFile(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) }) }
    function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src }) }
    async function canvasToCompressed(canvas) { let q = .82, data = canvas.toDataURL('image/jpeg', q); while (data.length > 1350000 && q > .42) { q -= .1; data = canvas.toDataURL('image/jpeg', q) } if (data.length > 1500000) throw Error('El comprobante procesado es demasiado grande.'); return data }
    async function imageToData(file) { const raw = await readFile(file); const image = await loadImage(raw); const max = 1500; const scale = Math.min(1, max / Math.max(image.width, image.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); return canvasToCompressed(canvas) }
    async function pdfToData(file) { if (!window.mjPdfJs) throw Error('El lector PDF todavía está cargando. Intenta de nuevo en unos segundos.'); const bytes = new Uint8Array(await file.arrayBuffer()); const pdf = await window.mjPdfJs.getDocument({ data: bytes }).promise; const page = await pdf.getPage(1); const viewport = page.getViewport({ scale: 1.7 }); const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height; await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise; return canvasToCompressed(canvas) }
    function normalizeAmount(value) { const s = String(value || '').replace(/[^0-9.,]/g, ''); if (!s) return ''; const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.'); const n = Number(comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')); return Number.isFinite(n) ? n.toFixed(2) : '' }
    function normalizeDate(v) { let m = String(v || '').match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'); m = String(v || '').match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); return '' }
    function normalizeTime(v) {
      const m = String(v || '').match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
      if (!m) return '';
      return m[1].padStart(2, '0') + ':' + m[2] + ':' + (m[3] || '00');
    }
    function extract(text) { const lines = String(text || '').replace(/\r/g, '').split('\n').map(x => x.trim()).filter(Boolean); const all = lines.join(' '); let folio = ''; for (const re of [/(?:folio|clave\s+de\s+rastreo|operaci[oó]n|movimiento|referencia)\s*[:#-]?\s*([A-Z0-9-]{5,})/i]) { const m = all.match(re); if (m) { folio = m[1]; break } } const dm = all.match(/\b(\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}|\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4})\b/); const tm = all.match(/\b([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/); let amount = ''; const am = all.match(/(?:monto|importe|total|cantidad)\s*(?:pagad[oa])?\s*[:$ ]+\s*\$?\s*([0-9][0-9.,]*)/i); if (am) amount = normalizeAmount(am[1]); if (!amount) { const values = [...all.matchAll(/\$\s*([0-9][0-9.,]*)/g)].map(m => Number(normalizeAmount(m[1]))).filter(Number.isFinite); if (values.length) amount = Math.max(...values).toFixed(2) } return { folio, date: dm ? normalizeDate(dm[1]) : '', time: tm ? normalizeTime(tm[0]) : '', amount } }
    async function runOcr() { if (!proofData) return toast('Primero adjunta un comprobante.'); if (!window.Tesseract) return toast('El lector automático no está disponible.'); $('retryOcr').disabled = true; $('ocrState').textContent = 'Leyendo comprobante…'; $('ocrBar').style.width = '5%'; try { const result = await Tesseract.recognize(proofData, 'spa+eng', { logger: m => { if (m.status === 'recognizing text') { $('ocrBar').style.width = Math.round((m.progress || 0) * 100) + '%'; $('ocrState').textContent = 'Leyendo texto… ' + Math.round((m.progress || 0) * 100) + '%' } } }); ocrText = result?.data?.text || ''; const f = extract(ocrText); if (f.folio) $('operationFolio').value = f.folio; if (f.date) $('operationDate').value = f.date; if (f.time) $('operationTime').value = normalizeTime(f.time); else if (!$('operationTime').value) $('operationTime').value = currentMexicoTime(); if (f.amount) $('amount').value = f.amount; updatePaymentSummary(); $('ocrBar').style.width = '100%'; $('ocrState').textContent = 'Lectura terminada. Revisa los datos antes de enviar.'; toast('Comprobante leído automáticamente.') } catch (e) { console.error(e); $('ocrState').textContent = 'No fue posible leer automáticamente. Puedes completar los campos manualmente.' } finally { $('retryOcr').disabled = false } }

    $('proofInput').addEventListener('change', async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const fallbackTime = currentMexicoTime();
        $('operationTime').value = fallbackTime;
        proofMeta = { name: file.name || 'comprobante', mime: file.type || '' };
        proofData = file.type === 'application/pdf' ? await pdfToData(file) : await imageToData(file);
        $('proofPreview').src = proofData;
        $('fileName').textContent = file.name;
        $('previewBox').classList.add('show');
        ocrText = '';
        await runOcr();
      } catch (err) {
        proofData = '';
        toast(err.message);
      }
    });
    $('receiptList').addEventListener('click', event => {
      const button = event.target.closest('[data-receipt-id]');
      if (!button) return;
      openReceipt(button.dataset.receiptId);
    });
    $('retryOcr').addEventListener('click', runOcr);
    $('operationDate').addEventListener('change', updatePaymentSummary);
    $('amount').addEventListener('input', updatePreview);
    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('extraList').addEventListener('click', e => { const row = e.target.closest('[data-extra]'); if (!row) return; selectedExtra = extras.find(x => Number(x.id) === Number(row.dataset.extra)) || null; renderExtras(); updatePaymentSummary() });

    $('createExtra').addEventListener('click', async () => { const concept = $('extraConcept').value.trim(), amount = Number($('extraAmount').value); if (!concept || !Number.isFinite(amount) || amount <= 0) return toast('Captura concepto y monto válidos.'); try { await api('/pagos/extraordinarias', { method: 'POST', headers: headers(true), body: JSON.stringify({ concepto: concept, monto: amount }) }); $('extraConcept').value = ''; $('extraAmount').value = ''; await loadExtras(); toast('Cuota extraordinaria creada.') } catch (e) { toast(e.message) } });

    $('paymentForm').addEventListener('submit', async e => { e.preventDefault(); if (!proofData) return toast('Adjunta un comprobante.'); if (paymentType === 'EXTRAORDINARIO' && !selectedExtra) return toast('Selecciona una cuota extraordinaria.'); const amount = Number($('amount').value), required = Number(String($('summaryTotal').textContent).replace(/[^0-9.]/g, '')); if (!Number.isFinite(amount) || amount <= 0 || (paymentType === 'EXTRAORDINARIO' && Math.abs(amount - required) > .009)) return toast(paymentType === 'MANTENIMIENTO' ? 'Ingresa un monto mayor que cero.' : 'El comprobante debe corresponder exactamente a ' + money(required) + '.'); const payload = { tipoPago: paymentType, cuotaExtraordinariaId: selectedExtra?.id || null, folioOperacion: $('operationFolio').value.trim(), fechaOperacion: $('operationDate').value, horaOperacion: normalizeTime($('operationTime').value), monto: amount, comprobanteData: proofData, comprobanteNombre: proofMeta.name, comprobanteMime: proofMeta.mime, textoOcr: ocrText }; const btn = $('submitPayment'); btn.disabled = true; btn.textContent = 'Generando recibo…'; try { const d = await api('/pagos', { method: 'POST', headers: headers(true), body: JSON.stringify(payload) }); toast('Pago reportado correctamente.'); await loadReceipts(); if (d.data?.id && d.data?.tieneReciboPdf) await openReceipt(d.data.id); $('paymentForm').reset(); $('previewBox').classList.remove('show'); proofData = ''; ocrText = ''; selectedExtra = null; updatePaymentSummary() } catch (err) { toast(err.message) } finally { btn.disabled = false; btn.textContent = 'Reportar pago y generar recibo' } });

    document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => { const value = $(btn.dataset.copy).textContent.trim(); if (!value || value === '—') return; try { await navigator.clipboard.writeText(value); toast('Dato copiado.') } catch { toast('No fue posible copiar.') } }));

    async function init() {
      $('adminExtraBox').hidden = !['SUPER_ADMIN', 'ADMINISTRADOR'].includes(role());

      // Mostrar el domicilio desde la sesión incluso antes de consultar el API.
      paintProfile(storedUser());

      try {
        await Promise.all([loadProfile(), loadConfig()]);
        $('apiStatus').textContent = 'Conectado';
      } catch (e) {
        $('apiStatus').textContent = 'Revisar conexión';
        toast(e.message);
      }

      // Estas consultas no deben impedir que la vivienda y la cuenta se pinten.
      await Promise.allSettled([loadExtras(), loadReceipts(), loadValidity(), loadAdministration()]);
      setTab('MANTENIMIENTO');
    }
    async function loadValidity() {
      try {
        const d = await api('/pagos/vigencia', { headers: headers() }); validity = d.data;
        $('validityDate').textContent = validity.pendienteConfiguracion ? 'Fecha inicial pendiente' : 'Fecha final: ' + validity.fechaFinal;
        $('validityDetail').textContent = validity.pendienteConfiguracion ? 'Administración debe registrar la fecha final actual.' : (validity.vigenteSegunFecha ? 'Vigente según la fecha calculada. ' : 'Fecha calculada vencida. ') + 'Abono acumulado: ' + money(validity.saldoParcial);
        updatePreview();
      } catch (e) { $('validityDate').textContent = 'No fue posible consultar la vigencia'; $('validityDetail').textContent = e.message; }
    }
    function updatePreview() {
      if (paymentType !== 'MANTENIMIENTO') return;
      if (!validity || validity.pendienteConfiguracion) { $('paymentPreview').textContent = 'Al validar el pago se calculará la vigencia. Primero debe registrarse la fecha inicial.'; return; }
      const cents = v => Math.round(Number(v || 0) * 100);
      const amount = cents($('amount').value), fee = cents(String($('summaryLate').textContent).replace(/[^0-9.]/g, ''));
      const principal = Math.max(0, amount - fee) + cents(validity.saldoParcial);
      const tariff = cents(validity.tarifaMensual), months = Math.floor(principal / tariff);
      const [year, month] = validity.fechaFinal.split('-').map(Number), index = year * 12 + month - 1 + months;
      const date = Math.floor(index / 12) + '-' + String(index % 12 + 1).padStart(2, '0') + '-10';
      $('paymentPreview').textContent = 'Estimación al validar: ' + months + ' mensualidad(es), fecha final ' + date + ', abono restante ' + money((principal % tariff) / 100) + '. Sujeta a revisión del recargo y del depósito.';
    }
    async function loadPending() {
      try {
        const d = await api('/pagos/pendientes', { headers: headers() });
        const box = $('pendingPayments'); box.replaceChildren();
        if (!d.data?.length) { box.textContent = 'No hay comprobantes pendientes.'; return; }
        for (const p of d.data) {
          const card = document.createElement('article'); card.className = 'card pad';
          card.innerHTML = '<h3>' + esc(p.calleSnapshot) + ' · Casa ' + esc(p.numeroCasaSnapshot) + '</h3><p>' + esc(p.folioOperacion) + ' · ' + esc(p.fechaOperacion) + ' · ' + esc(p.tipoPago) + ' · ' + money(p.monto) + '</p><details><summary>Ver comprobante</summary></details><label>Recargo incluido</label><input type="number" min="0" step="0.01" aria-label="Recargo incluido"><label>Observaciones de revisión</label><input maxlength="600" aria-label="Observaciones de revisión"><div class="actions"><button type="button" class="btn btn-primary" data-review="VALIDADO">Validar depósito</button><button type="button" class="btn" data-review="RECHAZADO">Rechazar</button></div>';
          const img = document.createElement('img'); img.alt = 'Comprobante ' + p.folioOperacion; img.style.maxWidth = '100%'; img.loading = 'lazy';
          const details = card.querySelector('details');
          details.addEventListener('toggle', async () => {
            if (!details.open || img.src) return;
            try {
              const proof = await api('/pagos/' + Number(p.id) + '/comprobante', { headers: headers() });
              if (/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(proof.data?.comprobanteData || '')) img.src = proof.data.comprobanteData;
            } catch (e) { toast(e.message); }
          });
          card.querySelector('details').append(img);
          const inputs = card.querySelectorAll('input'); inputs[0].value = p.recargo || 0; inputs[0].disabled = p.tipoPago !== 'MANTENIMIENTO';
          card.querySelectorAll('[data-review]').forEach(button => button.addEventListener('click', async () => {
            if (!confirm(button.dataset.review === 'VALIDADO' ? '¿Confirmas que verificaste este depósito en la cuenta bancaria?' : '¿Rechazar este comprobante?')) return;
            const buttons = card.querySelectorAll('button'); buttons.forEach(b => b.disabled = true);
            try {
              const result = await api('/pagos/' + Number(p.id) + '/revision', { method: 'PATCH', headers: headers(true), body: JSON.stringify({ estatus: button.dataset.review, recargo: inputs[0].value, observaciones: inputs[1].value }) });
              toast(result.data?.vigencia?.pendienteConfiguracion ? 'Pago validado. Falta configurar la fecha inicial de esta vivienda.' : 'Revisión guardada.');
              await Promise.all([loadPending(), loadReceipts(), loadValidity()]);
            } catch (e) { toast(e.message); buttons.forEach(b => b.disabled = false); }
          })); box.append(card);
        }
      } catch (e) { $('pendingPayments').textContent = e.message; }
    }
    async function loadAdministration() {
      if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(role())) return;
      $('adminPayments').hidden = false;
      try {
        const d = await api('/casas', { headers: headers() });
        for (const h of d.casas || []) { const option = document.createElement('option'); option.value = h.id; option.textContent = h.calle + ' · Casa ' + h.numero; $('setupHouse').append(option); }
      } catch (e) { toast(e.message); }
      await loadPending();
    }
    $('refreshPending').addEventListener('click', loadPending);
    $('validitySetup').addEventListener('submit', async event => {
      event.preventDefault(); const date = $('setupDate').value;
      if (!/^\d{4}-\d{2}-10$/.test(date)) return toast('La fecha final debe ser un día 10.');
      const button = event.currentTarget.querySelector('button'); button.disabled = true;
      try {
        await api('/pagos/vigencia/' + Number($('setupHouse').value), { method: 'PUT', headers: headers(true), body: JSON.stringify({ fechaFinal: date }) });
        toast('Fecha inicial registrada.'); await loadValidity();
      } catch (e) { toast(e.message); } finally { button.disabled = false; }
    });
    init();
  
