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
    const configText = (value, fallback) => {
      const text = String(value ?? '').trim();
      return text && !/^[—–-]+$/.test(text) ? text : fallback;
    };
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
        $('houseText').textContent = (house.calleCorrecta || house.calle || '') + ' · Casa ' + (house.numero || '');
        $('residentStreet').value = house.calleCorrecta || house.calle || '';
        $('residentNumber').value = house.numero || '';
        return Boolean(house.calle || house.numero);
      }
      return false;
    }

    function syncBankReference() {
      const house = profile?.casa || profile?.vivienda || storedUser()?.casa || storedUser()?.vivienda;
      const street = (house?.calleCorrecta || house?.calle || $('residentStreet')?.value || '').trim();
      const number = String(house?.numero || $('residentNumber')?.value || '').trim();
      $('bankReference').textContent = street && number ? street + ' · Casa ' + number : 'Selecciona una vivienda';
    }
    async function loadProfile() {
      // Pintar de inmediato con la información guardada al iniciar sesión,
      // para que Calle y Número no dependan de otras llamadas de Pagos.
      const cached = storedUser();
      paintProfile(cached);

      const d = await api('/auth/perfil', { headers: headers() });
      profile = d.usuario;
      const painted = paintProfile(profile);
      syncBankReference();
      if (!painted) throw Error('Tu usuario no tiene vivienda asociada');
    }
    async function loadConfig() { const d = await api('/pagos/config', { headers: headers() }); config = d.data || {}; $('bankName').textContent = configText(config.banco, 'BANCO AZTECA'); $('bankHolder').textContent = configText(config.titular, 'MARIA DEL ROCIO BAHENA JUAREZ'); $('bankAccount').textContent = configText(config.cuenta, '00002128412440'); $('bankClabe').textContent = configText(config.clabe, '127320021284124409'); $('bankCard').textContent = configText(config.tarjeta, '4027666123124884'); $('bankReference').textContent = 'Consultando vivienda…'; $('legalTitle').textContent = config.legal?.titulo || 'Fundamento y aviso de cuotas'; $('legalText').textContent = 'El artículo 1028 del Código Civil del Estado de Jalisco dispone el pago anticipado de cuotas y prevé intereses moratorios conforme al reglamento del condominio y los límites legales. Este aviso no establece por sí mismo un recargo fijo de $50.'; syncBankReference(); updatePaymentSummary() }
    async function loadExtras() { try { const d = await api('/pagos/extraordinarias', { headers: headers() }); extras = d.data || []; renderExtras() } catch (e) { $('extraList').innerHTML = '<div class="empty">' + esc(e.message) + '</div>' } }
    async function loadReceipts() { try { const d = await api('/pagos/mios', { headers: headers() }); renderReceipts(d.data || []) } catch (e) { $('receiptList').innerHTML = '<div class="empty">' + esc(e.message) + '</div>' } }

    function renderExtras() {
      $('extraList').innerHTML = extras.length ? extras.map(x => '<div class="extra' + (selectedExtra && Number(selectedExtra.id) === Number(x.id) ? ' selected' : '') + '" data-extra="' + Number(x.id) + '"><div><strong>' + esc(x.concepto) + '</strong><small>Cuota extraordinaria activa</small></div><b>' + money(x.monto) + '</b></div>').join('') : '<div class="empty">No hay cuotas extraordinarias activas.</div>';
    }
    let receiptItems = [];
    const receiptFilter = {month:'',year:''};
    const monthsReceipt=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    function receiptPeriod(p){
      const str=String(p.concepto||'');
      const match=str.match(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d{2})\b/i);
      if(match){
        const index=monthsReceipt.findIndex(m=>m.toLowerCase()===match[1].toLowerCase());
        if(index>=0)return {month:String(index+1).padStart(2,'0'),year:match[2],label:monthsReceipt[index]+' '+match[2]};
      }
      const d=/^(20\d{2})-(\d{2})-\d{2}/.exec(String(p.fechaOperacion||''));
      if(d&&Number(d[2])>=1&&Number(d[2])<=12)return {year:d[1],month:d[2],label:'Depósito: '+monthsReceipt[Number(d[2])-1]+' '+d[1]};
      return {month:'',year:'',label:'Período no especificado'};
    }
    function receiptHtml(p){
      const period=receiptPeriod(p),status=({PENDIENTE_VALIDACION:'Pendiente de validación',VALIDADO:'Validado',RECHAZADO:'Rechazado'})[p.estatus]||p.estatus||'';
      return '<article class="receipt-item"><div class="receipt-main"><strong>'+esc(p.reciboFolio||p.folioReporte||'Recibo')+
        '</strong><p><b class="receipt-period-label">'+esc(period.label)+'</b><br>'+esc(p.concepto||'Pago registrado')+'<br>'+
        esc((p.casa?.calleCorrecta || p.calleSnapshot))+' · Casa '+esc(p.numeroCasaSnapshot)+'</p><div class="receipt-meta"><span class="pill '+esc(p.estatus||'')+'">'+esc(status)+
        '</span><span class="pill">'+esc(p.tipoPago==='EXTRAORDINARIO'?'Extraordinario':'Mantenimiento')+
        '</span></div></div><div class="receipt-side"><b>'+money(p.monto)+'</b><button class="receipt-view-btn" type="button" data-receipt-detail="'+Number(p.id)+'">Ver detalle</button></div></article>';
    }
    function renderReceipts(items){
      if(items)receiptItems=Array.isArray(items)?items:[];
      const sorted=[...receiptItems].sort((a,b)=>String(b.fechaOperacion||'').localeCompare(String(a.fechaOperacion||''))||Number(b.id)-Number(a.id));
      $('receiptList').innerHTML=sorted.length?sorted.slice(0,2).map(receiptHtml).join(''):'<div class="empty">Aún no hay pagos registrados para esta vivienda.</div>';
      $('showAllReceipts').textContent='Ver todos ('+receiptItems.length+') ↗';
      const years=[...new Set(receiptItems.map(p=>receiptPeriod(p).year).filter(Boolean))].sort().reverse();
      const year=$('receiptYear'),previous=receiptFilter.year;
      year.innerHTML='<option value="">Todos los años</option>'+years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');
      year.value=years.includes(previous)?previous:'';
      receiptFilter.year=year.value;
      const all=sorted.filter(p=>{
        const period=receiptPeriod(p);
        return (!receiptFilter.month||period.month===receiptFilter.month)&&(!receiptFilter.year||period.year===receiptFilter.year);
      });
      $('receiptCount').textContent=all.length+' de '+receiptItems.length+' pagos';
      $('receiptAllList').innerHTML=all.length?all.map(receiptHtml).join(''):'<div class="empty">No hay recibos para el mes y año indicados.</div>';
    }
    for(const id of ['receiptMonth','receiptYear'])$(id).addEventListener('change',()=>{
      receiptFilter.month=$('receiptMonth').value;receiptFilter.year=$('receiptYear').value;renderReceipts();
    });
    $('clearReceiptFilters').addEventListener('click',()=>{
      receiptFilter.month='';receiptFilter.year='';
      $('receiptMonth').value='';$('receiptYear').value='';renderReceipts();
    });
    $('showAllReceipts').addEventListener('click',()=>{$('receiptAllModal').showModal();renderReceipts();});
    $('closeReceiptAll').addEventListener('click',()=>$('receiptAllModal').close());
    $('closeReceiptDetails').addEventListener('click',()=>$('receiptDetailsModal').close());
    async function openReceiptDetails(id){
      const p=receiptItems.find(x=>Number(x.id)===Number(id));
      if(!p)return toast('No se encontró el pago');
      const fields=[
        ['Vivienda',String((p.casa?.calleCorrecta || p.calleSnapshot)||'')+' · Casa '+String(p.numeroCasaSnapshot||'')],
        ['Folio del reporte',p.folioReporte],['Folio del recibo',p.reciboFolio||'Pendiente'],
        ['Folio bancario',p.folioOperacion],['Fecha de operación',p.fechaOperacion],
        ['Hora',p.horaOperacion],['Monto depositado',money(p.monto)],
        ['Recargo incluido',money(p.recargo)],['Tipo',p.tipoPago],['Concepto',p.concepto],
        ['Estatus',p.estatus],['Observaciones',p.observacionesRevision||'Sin observaciones']
      ];
      $('receiptDetailsHeading').textContent='Pago '+String(p.reciboFolio||p.folioReporte||p.id);
      const details=$('receiptDetailsBody');
      details.innerHTML='<div class="receipt-detail-grid">'+fields.map(([name,value])=>'<div class="receipt-detail-field"><small>'+esc(name)+'</small><strong>'+esc(value||'—')+'</strong></div>').join('')+
        '</div><div class="receipt-proof-block"><b>Comprobante adjunto</b><p id="receiptPhotoStatus">Cargando archivo…</p><img id="receiptPhoto" alt="Comprobante bancario" hidden></div>'+
        '<div class="receipt-detail-actions"><button class="receipt-more" type="button" data-receipt-id="'+Number(p.id)+'">Abrir recibo PDF ↗</button></div>';
      $('receiptDetailsModal').showModal();
      try{
        const proof=await api('/pagos/'+Number(p.id)+'/comprobante-mio',{headers:headers()});
        if(!$('receiptDetailsModal').open||!$('receiptPhotoStatus'))return;
        const data=String(proof.data?.comprobanteData||'');
        if(/^data:image\/(png|jpeg|jpg|webp);base64,[a-zA-Z0-9+/=]+$/.test(data)){
          $('receiptPhoto').src=data;$('receiptPhoto').hidden=false;$('receiptPhotoStatus').hidden=true;
        }else $('receiptPhotoStatus').textContent='Comprobante adjunto: '+String(proof.data?.comprobanteNombre||'Archivo PDF u otro formato; consulta el recibo.');
      }catch(e){if($('receiptPhotoStatus'))$('receiptPhotoStatus').textContent=e.message;}
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
      const base = Number(config?.mantenimiento?.montoBase || 300); const limit = Number(config?.mantenimiento?.diaLimite || 10); const lateFee = Number(config?.mantenimiento?.recargoTardio || 50); const day = date ? Number(date.slice(-2)) : 0; const late = day > limit; const total = base + (late ? lateFee : 0); $('lateRow').hidden = false; $('summaryBase').textContent = money(base); $('summaryLate').textContent = money(late ? lateFee : 0); $('lateRow').classList.toggle('late', late); $('summaryTotal').textContent = money(total); $('ruleAmount').textContent = money(total); $('amount').min = String(total); $('officialConcept').value = 'Mantenimiento desde octubre 2026 (mensualidades completas, meses pendientes primero)'; updatePreview();
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
    for(const container of ['receiptList','receiptAllList','receiptDetailsBody']){
      $(container).addEventListener('click',event=>{
        const detail=event.target.closest('[data-receipt-detail]');
        if(detail){void openReceiptDetails(detail.dataset.receiptDetail);return;}
        const pdf=event.target.closest('[data-receipt-id]');
        if(pdf)void openReceipt(pdf.dataset.receiptId);
      });
    }
    $('retryOcr').addEventListener('click', runOcr);
    $('operationDate').addEventListener('change', updatePaymentSummary);
    $('amount').addEventListener('input', updatePreview);
    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('extraList').addEventListener('click', e => { const row = e.target.closest('[data-extra]'); if (!row) return; selectedExtra = extras.find(x => Number(x.id) === Number(row.dataset.extra)) || null; renderExtras(); updatePaymentSummary() });

    $('createExtra').addEventListener('click', async () => { const concept = $('extraConcept').value.trim(), amount = Number($('extraAmount').value); if (!concept || !Number.isFinite(amount) || amount <= 0) return toast('Captura concepto y monto válidos.'); try { await api('/pagos/extraordinarias', { method: 'POST', headers: headers(true), body: JSON.stringify({ concepto: concept, monto: amount }) }); $('extraConcept').value = ''; $('extraAmount').value = ''; await loadExtras(); toast('Cuota extraordinaria creada.') } catch (e) { toast(e.message) } });

    $('paymentForm').addEventListener('submit', async e => { e.preventDefault(); if (!proofData) return toast('Adjunta un comprobante.'); if (paymentType === 'EXTRAORDINARIO' && !selectedExtra) return toast('Selecciona una cuota extraordinaria.'); const amount = Number($('amount').value), required = Number(String($('summaryTotal').textContent).replace(/[^0-9.]/g, '')); if (!Number.isFinite(amount) || amount <= 0 || (paymentType === 'EXTRAORDINARIO' && Math.abs(amount - required) > .009)) return toast(paymentType === 'MANTENIMIENTO' ? 'Ingresa un monto mayor que cero.' : 'El comprobante debe corresponder exactamente a ' + money(required) + '.');
    if(paymentType==='MANTENIMIENTO'){
      const date=$('operationDate').value;
      const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      if(!date || date<'2026-10-01' || date>today)return toast('Selecciona una fecha real desde octubre 2026, no futura.');
      const price=Number(date.slice(-2))>10?350:300;
      if(Math.round(amount*100)<price*100 || Math.round(amount*100)%(price*100)!==0)
        return toast('Para esa fecha se requieren mensualidades completas de '+money(price)+'. Revisa el monto del banco.');
    } const payload = { tipoPago: paymentType, cuotaExtraordinariaId: selectedExtra?.id || null, folioOperacion: $('operationFolio').value.trim(), fechaOperacion: $('operationDate').value, horaOperacion: normalizeTime($('operationTime').value), monto: amount, comprobanteData: proofData, comprobanteNombre: proofMeta.name, comprobanteMime: proofMeta.mime, textoOcr: ocrText }; const btn = $('submitPayment'); btn.disabled = true; btn.textContent = 'Generando recibo…'; try { const d = await api('/pagos', { method: 'POST', headers: headers(true), body: JSON.stringify(payload) }); toast(d.vigencia?.pendienteConfiguracion ? 'Pago validado. Falta configurar la fecha inicial de esta vivienda.' : (d.data?.estatus === 'VALIDADO' ? 'Pago validado correctamente.' : 'Pago reportado correctamente; pendiente de validación bancaria.')); await Promise.all([loadReceipts(), loadValidity()]); if (d.data?.id && d.data?.tieneReciboPdf) await openReceipt(d.data.id); $('paymentForm').reset(); $('previewBox').classList.remove('show'); proofData = ''; ocrText = ''; selectedExtra = null; updatePaymentSummary() } catch (err) { toast(err.message) } finally { btn.disabled = false; btn.textContent = 'Reportar pago y generar recibo' } });

    document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
      const value = $(btn.dataset.copy).textContent.trim();
      if (!value || value === '—') return;

      try {
        await navigator.clipboard.writeText(value);
        clearTimeout(btn._copyResetTimer);
        btn.textContent = 'Copiado';
        btn.classList.add('copied');
        btn.setAttribute('aria-label', 'Dato copiado');

        btn._copyResetTimer = setTimeout(() => {
          btn.textContent = 'Copiar';
          btn.classList.remove('copied');
          btn.setAttribute('aria-label', 'Copiar dato');
        }, 1500);

        toast('Dato copiado.');
      } catch {
        toast('No fue posible copiar.');
      }
    }));

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
        $('validityDate').textContent = validity.pendienteConfiguracion ? 'Sin pagos validados desde octubre 2026' : 'Fecha final: ' + validity.fechaFinal;
        $('validitySync').textContent = ({ COMPLETADO: 'Fecha confirmada en los tags del controlador.',
          PENDIENTE: 'Actualización de tags pendiente.', ERROR: 'Actualización pendiente; se reintentará automáticamente.',
          SIN_TAGS: 'Falta vincular los tags de esta vivienda al controlador.', SIMULACION: 'Sincronización en modo de prueba.',
          SIN_CONFIGURAR: 'Octubre 2026 es el inicio automático al validar el primer pago.',
          ALTA_C3_CONFIRMADA: 'TAG nuevo confirmado por TCP; las vigencias de TAGs anteriores no se modificaron.' })[validity.sincronizacion] || 'Actualización de tags pendiente.';
        $('validityDetail').textContent = validity.pendienteConfiguracion ? 'Administración debe registrar la fecha final actual.' : (validity.vigenteSegunFecha ? 'Vigente según la fecha calculada. ' : 'Fecha calculada vencida. ') + 'Abono acumulado: ' + money(validity.saldoParcial);
        updatePreview();
      } catch (e) { $('validityDate').textContent = 'No fue posible consultar la vigencia'; $('validityDetail').textContent = e.message; }
    }
    function updatePreview() {
      if (paymentType !== 'MANTENIMIENTO') return;
      const operationDate=$('operationDate').value;
      const fee=Number(operationDate?.slice(-2)||0)>10?350:300;
      const amount=Math.round(Number($('amount').value||0)*100);
      const unit=fee*100;
      if(!operationDate || amount<=0){
        $('paymentPreview').textContent='La vigencia se calculará después de validar el depósito. Inicio: octubre 2026.';
        return;
      }
      if(amount%unit!==0 || amount<unit){
        $('paymentPreview').textContent='Para esta fecha, cada mensualidad completa cuesta '+money(fee)+'. No se admiten importes inferiores o parciales.';
        return;
      }
      const months=amount/unit;
      const prevDate=validity&&!validity.pendienteConfiguracion?validity.fechaFinal:'2026-10-10';
      const [year,month]=prevDate.split('-').map(Number),index=year*12+month-1+months;
      const end=Math.floor(index/12)+'-'+String(index%12+1).padStart(2,'0')+'-10';
      $('paymentPreview').textContent='Estimación si Administración confirma el depósito: '+
        months+' mensualidad(es); fecha final '+end+
        '. Se abonan primero los meses pendientes desde octubre de 2026. El TAG seguirá vencido si la fecha aún es anterior a hoy.';
    }
    let pendingItems = [];
    const pendingFilters = { street: '', house: '', month: '', year: '' };
    function filterPending() {
      const street = pendingFilters.street.trim().toLocaleLowerCase('es-MX');
      const house = pendingFilters.house.trim().toLocaleLowerCase('es-MX');
      return pendingItems.filter(p => {
        const date = String(p.fechaOperacion || '').slice(0, 10);
        const parts = date.split('-');
        return (!street || String((p.casa?.calleCorrecta || p.calleSnapshot) || '').toLocaleLowerCase('es-MX').includes(street))
          && (!house || String(p.numeroCasaSnapshot || '').toLocaleLowerCase('es-MX').includes(house))
          && (!pendingFilters.month || parts[1] === pendingFilters.month)
          && (!pendingFilters.year || parts[0] === pendingFilters.year);
      }).sort((a,b)=>String(a.casa?.calleCorrecta||a.calleSnapshot||'').localeCompare(String(b.casa?.calleCorrecta||b.calleSnapshot||''),'es-MX',{numeric:true,sensitivity:'base'})||String(a.numeroCasaSnapshot||'').localeCompare(String(b.numeroCasaSnapshot||''),'es-MX',{numeric:true})||String(b.fechaOperacion||'').localeCompare(String(a.fechaOperacion||'')));
    }
    function paymentMonthLabel(value) {
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
      if (!match) return 'MES NO DISPONIBLE';
      const month = Number(match[2]);
      if (month < 1 || month > 12) return 'MES NO DISPONIBLE';
      return ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'][month - 1] + ' ' + match[1];
    }
    function renderPending() {
      const box = $('pendingPayments');
      box.replaceChildren();
      const items = filterPending();
      $('pendingCount').textContent = items.length + ' de ' + pendingItems.length + ' comprobantes';
      if (!items.length) {
        box.innerHTML = '<div class="pending-empty">No hay comprobantes con estos filtros.</div>';
        return;
      }
      for (const p of items) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'pending-mini-card';
        card.setAttribute('aria-label', 'Revisar comprobante de ' + (p.casa?.calleCorrecta || p.calleSnapshot) + ', casa ' + p.numeroCasaSnapshot);
        card.innerHTML = '<span class="pending-mini-details"><strong>' + esc((p.casa?.calleCorrecta || p.calleSnapshot)) + ' · Casa ' + esc(p.numeroCasaSnapshot) +
          '</strong><span class="pending-mini-month">Mes del depósito: <b>' + esc(paymentMonthLabel(p.fechaOperacion)) + '</b></span><small>' + esc(p.fechaOperacion || 'Sin fecha') + ' · ' + esc(p.tipoPago === 'EXTRAORDINARIO' ? 'Extraordinario' : 'Mantenimiento') +
          '</small><small>Folio ' + esc(p.folioOperacion || '—') + '</small></span><span class="pending-mini-right"><b>' + money(p.monto) +
          '</b><span>Ver detalle ›</span></span>';
        card.addEventListener('click', () => openPendingDetail(p));
        box.append(card);
      }
    }
    async function openPendingDetail(p) {
      const dialog = $('pendingDetail');
      const body = $('pendingDetailBody');
      const type = p.tipoPago === 'EXTRAORDINARIO' ? 'Extraordinario' : 'Mantenimiento';
      body.innerHTML =
        '<div class="pending-detail-heading"><strong>' + esc((p.casa?.calleCorrecta || p.calleSnapshot)) + ' · Casa ' + esc(p.numeroCasaSnapshot) + '</strong><b>' + money(p.monto) + '</b></div>' +
        '<div class="pending-detail-meta"><div><small>Folio / operación</small><strong>' + esc(p.folioOperacion || '—') + '</strong></div>' +
        '<div><small>Fecha</small><strong>' + esc(p.fechaOperacion || '—') + '</strong></div>' +
        '<div><small>Tipo</small><strong>' + esc(type) + '</strong></div></div>' +
        '<div class="pending-proof"><strong>Comprobante bancario</strong><p id="pendingProofStatus">Cargando imagen…</p><img id="pendingProofImage" alt="Comprobante bancario, seleccionar para ampliar" role="button" tabindex="0" hidden><button type="button" class="pending-proof-zoom-button" id="pendingZoomButton" hidden>Ampliar fotografía ↗</button></div>' +
        '<div class="pending-fields"><div><label for="pendingFee">Recargo incluido</label><input id="pendingFee" type="number" min="0" step="0.01"></div>' +
        '<div><label for="pendingNotes">Observaciones de revisión</label><textarea id="pendingNotes" maxlength="600" rows="3" placeholder="Agrega una nota si es necesario"></textarea></div></div>' +
        '<div class="pending-detail-actions"><button type="button" class="btn btn-primary" data-detail-review="VALIDADO">Validar depósito</button>' +
        '<button type="button" class="btn btn-danger" data-detail-review="RECHAZADO">Rechazar</button></div>';
      const fee = $('pendingFee');
      fee.value = p.recargo || 0;
      fee.disabled = p.tipoPago !== 'MANTENIMIENTO';
      dialog.showModal();
      dialog.scrollTop = 0;
      body.querySelectorAll('[data-detail-review]').forEach(button => button.addEventListener('click', async () => {
        if (!confirm(button.dataset.detailReview === 'VALIDADO' ? '¿Confirmas que verificaste este depósito en la cuenta bancaria?' : '¿Rechazar este comprobante?')) return;
        const buttons = body.querySelectorAll('[data-detail-review]');
        buttons.forEach(b => b.disabled = true);
        try {
          const result = await api('/pagos/' + Number(p.id) + '/revision', {
            method: 'PATCH', headers: headers(true),
            body: JSON.stringify({ estatus: button.dataset.detailReview, recargo: fee.value, observaciones: $('pendingNotes').value })
          });
          toast(result.data?.vigencia?.pendienteConfiguracion ? 'Pago validado. Falta configurar la fecha inicial de esta vivienda.' : 'Revisión guardada.');
          dialog.close();
          await Promise.all([loadPending(), loadReceipts(), loadValidity()]);
        } catch (e) { toast(e.message); buttons.forEach(b => b.disabled = false); }
      }));
      try {
        const proof = await api('/pagos/' + Number(p.id) + '/comprobante', { headers: headers() });
        if (!dialog.open || !body.isConnected || $('pendingProofStatus')?.textContent !== 'Cargando imagen…') return;
        const value = proof.data?.comprobanteData || '';
        if (/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(value)) {
          $('pendingProofImage').src = value;
          $('pendingProofImage').hidden = false;
          $('pendingZoomButton').hidden = false;
          $('pendingProofStatus').hidden = true;
        } else { $('pendingProofStatus').textContent = 'Imagen no disponible.'; }
      } catch (e) { if (dialog.open && $('pendingProofStatus')) $('pendingProofStatus').textContent = e.message; }
    }
    async function loadPending() {
      try {
        const d = await api('/pagos/pendientes', { headers: headers() });
        pendingItems = Array.isArray(d.data) ? d.data : [];
        const years = [...new Set(pendingItems.map(p => String(p.fechaOperacion || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y)))].sort().reverse();
        const yearSelect = $('pendingYear');
        const selected = yearSelect.value;
        yearSelect.innerHTML = '<option value="">Todos los años</option>' + years.map(y => '<option value="' + y + '">' + y + '</option>').join('');
        yearSelect.value = years.includes(selected) ? selected : '';
        pendingFilters.year = yearSelect.value;
        renderPending();
      } catch (e) {
        $('pendingPayments').innerHTML = '<div class="pending-empty">' + esc(e.message) + '</div>';
        $('pendingCount').textContent = 'No disponible';
      }
    }
    ['pendingStreet','pendingHouse','pendingMonth','pendingYear'].forEach(id => {
      $(id).addEventListener(id === 'pendingStreet' || id === 'pendingHouse' ? 'input' : 'change', () => {
        pendingFilters.street = $('pendingStreet').value;
        pendingFilters.house = $('pendingHouse').value;
        pendingFilters.month = $('pendingMonth').value;
        pendingFilters.year = $('pendingYear').value;
        renderPending();
      });
    });
    $('clearPendingFilters').addEventListener('click', () => {
      ['pendingStreet','pendingHouse','pendingMonth','pendingYear'].forEach(id => $(id).value = '');
      Object.keys(pendingFilters).forEach(key => pendingFilters[key] = '');
      renderPending();
    });
    const photoZoom = $('pendingPhotoZoom');
    const zoomProof = () => {
      const img = $('pendingProofImage');
      if (!img || img.hidden || !img.src || !$('pendingDetail').open) return;
      $('pendingZoomImage').src = img.src;
      photoZoom.showModal();
    };
    $('pendingDetailBody').addEventListener('click', event => {
      if (event.target.closest('#pendingProofImage, #pendingZoomButton')) zoomProof();
    });
    $('pendingDetailBody').addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.id === 'pendingProofImage') {
        event.preventDefault(); zoomProof();
      }
    });
    $('closePendingPhotoZoom').addEventListener('click', () => photoZoom.close());
    photoZoom.addEventListener('click', event => { if (event.target === photoZoom) photoZoom.close(); });
    photoZoom.addEventListener('close', () => { $('pendingZoomImage').removeAttribute('src'); });
    $('closePendingDetail').addEventListener('click', () => $('pendingDetail').close());
    async function loadAdministration() {
      if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(role())) return;
      $('adminPayments').hidden = false;
      try {
        const d = await api('/casas', { headers: headers() });
        for (const h of [...(d.casas || [])].sort((a,b)=>String(a?.calleCorrecta||a?.calle||'').localeCompare(String(b?.calleCorrecta||b?.calle||''),'es-MX',{numeric:true,sensitivity:'base'})||String(a?.numero||'').localeCompare(String(b?.numero||''),'es-MX',{numeric:true}))) { const option = document.createElement('option'); option.value = h.id; option.textContent = (h.calleCorrecta || h.calle) + ' · Casa ' + h.numero; $('setupHouse').append(option); }
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
  
