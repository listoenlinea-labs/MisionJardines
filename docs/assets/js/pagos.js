    const API = 'https://api-misionjardines.listoenlinea.host/api';
    const token = localStorage.getItem('misionJardinesToken') || sessionStorage.getItem('misionJardinesToken');
    if (!token) location.replace('login.html');
    const $ = id => document.getElementById(id);
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const headers = (json = false) => ({ Authorization: 'Bearer ' + token, ...(json ? { 'Content-Type': 'application/json' } : {}) });
    let validity = null;
    let quote = null, quoteRevision = 0;
    let profile = null, config = null, proofData = '', ocrText = '', proofConfirmed = false, scanRevision = 0, proofMeta = { name: '', mime: '' }, paymentType = 'MANTENIMIENTO', extras = [], selectedExtra = null, selectedClub = null, debts = null;

    let ocrAmount='', reportBusy=false;
    function toast(msg) { $('toast').textContent = msg; $('toast').style.display = 'block'; clearTimeout(window.payToast); window.payToast = setTimeout(() => $('toast').style.display = 'none', 3600) }
    async function api(path, options = {}) { const r = await fetch(API + path, options); let d = {}; try { d = await r.json() } catch { } if (r.status === 401) { location.replace('login.html'); throw Error('La sesión expiró') } if (!r.ok || d.ok === false) {
      const error = Error(d.message || 'No fue posible completar la solicitud');
      error.httpStatus = r.status;
      error.code = d.code; error.camposFaltantes = d.camposFaltantes; error.camposCorreo = d.camposCorreo;
      throw error;
    } return d }
    const money = v => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
    // Solo visual: tarjetas de resumen y recibos sin centavos; no redondea los datos guardados ni los importes bancarios.
    const moneyCard = v => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const configText = (value, fallback) => {
      const text = String(value ?? '').trim();
      return text && !/^[—–-]+$/.test(text) ? text : fallback;
    };
    const role = () => { try { const raw = localStorage.getItem('misionJardinesUsuario') || sessionStorage.getItem('misionJardinesUsuario'); const u = JSON.parse(raw || '{}'); return u?.rol?.nombre || u?.rol || '' } catch { return '' } }
    const fullName = u => [u?.nombre, u?.apellidoPaterno, u?.apellidoMaterno].filter(Boolean).join(' ').trim() || 'Residente';
    const repartoUI=window.MJRepartoUI.crear({api,headers,money,fechaResuelta:date=>{$('operationDate').value=date;},changed:()=>{
      $('submitPayment').disabled=reportBusy||!proofConfirmed||!repartoUI.valido();
    }});
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
      // Referencia apta para apps bancarias: solo ASCII, letras, números y espacios.
      const plain = (street + ' ' + number).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
      $('bankReference').textContent = street && number ? plain : 'Selecciona una vivienda';
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
    async function loadConfig() {
      let response;
      try {
        response = await api('/pagos/config', { headers: headers() });
      } catch (error) {
        // No mostrar datos bancarios incompletos o anteriores cuando falla el API.
        $('bankName').textContent = 'Datos bancarios no disponibles';
        for (const id of ['bankHolder', 'bankAccount', 'bankClabe', 'bankCard']) {
          $(id).textContent = '—';
          $(id).closest('.bank-row')?.querySelector('[data-copy]')?.setAttribute('disabled', '');
        }
        throw error;
      }
      config = response.data || {};
      // Pintar primero los datos oficiales; ninguna sección decorativa debe
      // bloquear la carga bancaria al eliminarse de la página.
      const bankFields = {
        bankName: configText(config.banco, 'BANCO AZTECA'),
        bankHolder: configText(config.titular, 'MARIA DEL ROCIO BAHENA JUAREZ'),
        bankAccount: configText(config.cuenta, '00002128412440'),
        bankClabe: configText(config.clabe, '127320021284124409'),
        bankCard: configText(config.tarjeta, '4027666123124884')
      };
      for (const [id, value] of Object.entries(bankFields)) {
        $(id).textContent = value;
        $(id).closest('.bank-row')?.querySelector('[data-copy]')?.removeAttribute('disabled');
      }
      syncBankReference();

      const base = Number(config.mantenimiento?.montoBase || 300);
      $('maintenanceRateText').textContent = money(base) + ' por mensualidad · '
        + money(config.mantenimiento?.recargoTardio ?? 50) + ' por corte vencido pendiente';
      // El texto largo maintenancePaymentHint fue eliminado voluntariamente.
      // No volver a escribir en un elemento que no existe.
      $('legalTitle').textContent = config.legal?.titulo || 'Fundamento y aviso de cuotas';
      $('legalText').textContent = 'El artículo 1028 del Código Civil del Estado de Jalisco dispone el pago anticipado de cuotas y prevé intereses moratorios conforme al reglamento del condominio y los límites legales. Este aviso no establece por sí mismo un recargo fijo de $50.';
      updatePaymentSummary();
    }
    async function loadExtras() { try { const d = await api('/pagos/extraordinarias', { headers: headers() }); extras = d.data || []; renderExtras() } catch (e) { $('extraList').innerHTML = '<div class="empty">' + esc(e.message) + '</div>' } }
    async function loadReceipts({ preserveOnError = false } = {}) {
      try {
        const old = new Map(receiptItems.map(p => [Number(p.id), p.estatus]));
        const d = await api('/pagos/mios', { headers: headers(), cache: 'no-store' });
        renderReceipts(d.data || []);
        if (receiptItems.some(p => old.get(Number(p.id)) === 'PENDIENTE_VALIDACION' && p.estatus !== 'PENDIENTE_VALIDACION')) {
          if ($('receiptDetailsModal').open && activeReceiptId !== null) {
            const actual = receiptItems.find(p => Number(p.id) === activeReceiptId);
            if (actual) renderReceiptStatus(actual);
          }
          void Promise.allSettled([loadValidity(), loadDebts(), loadExtras()]);
        }
        return true;
      } catch (e) {
        if (!preserveOnError) $('receiptList').innerHTML = '<div class="empty">' + esc(e.message) + '</div>';
        return false;
      }
    }
    async function loadDebts(){
      const d=await api('/pagos/adeudos',{headers:headers()});debts=d.data;
      document.querySelectorAll('.tab').forEach(button=>{
        button.querySelector('.mj-tab-count')?.remove();
        const count=debts.tipos?.[button.dataset.tab]?.length||0;
        if(count){const badge=document.createElement('span');badge.className='mj-tab-count';badge.textContent=count;button.append(badge);}
      });
      renderClub();renderPaymentStatusCards();document.dispatchEvent(new CustomEvent('mj:adeudos',{detail:debts}));
      document.dispatchEvent(new Event('mj:pagos-cambios'));
      if(window.parent!==window)window.parent.postMessage({type:'MJ_PAGOS_CAMBIOS'},location.origin);
    }
    function renderPaymentStatusCards(){
      const item=debts?.resumen?.[paymentType]||{};
      const deuda=Number(item.saldoPendiente??debts?.totales?.[paymentType]??0);
      const favor=Number(item.saldoFavor||0);
      const ultimo=item.ultimoMesPagado;
      const periodo=ultimo?.mes?ultimo.mes+' '+ultimo.anio:'Sin pago';
      const vals=[['Estado',deuda>0?'Pendiente':'Al corriente'],['Último mes pagado',paymentType==='CASA_CLUB'?'No aplica':paymentType==='EXTRAORDINARIO'&&!ultimo?.mes?'Sin pago':periodo],['Saldo pendiente',moneyCard(deuda)],['Saldo a favor',moneyCard(favor)]];
      $('paymentStatusCards').innerHTML=vals.map(([label,value])=>'<div class="ps-card"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>').join('');
    }
    function renderClub(){
      const items=debts?.tipos?.CASA_CLUB||[];
      $('clubPaymentList').innerHTML=items.length?items.map(c=>'<div class="extra'+(selectedClub?.id===c.id?' selected':'')+'" data-club="'+Number(c.id)+'"><div><strong>Reservación '+esc(c.periodo)+'</strong><small>Renta '+money(c.renta)+' · Depósito '+money(c.deposito)+' · Limpieza '+money(c.limpieza)+' · Pagar hasta '+esc(c.fechaLimitePago||'pendiente')+(c.estado==='EN_REVISION'?' · Comprobante en revisión':'')+'</small></div><b>'+money(c.monto)+'</b></div>').join(''):'<div class="empty">No tienes reservaciones aprobadas pendientes de pago.</div>';
    }
    function showDebtModal(){
      const items=debts?.tipos?.[paymentType]||[];if(!items.length)return;
      const names={MANTENIMIENTO:'Mantenimiento',EXTRAORDINARIO:'Cuota extraordinaria',CASA_CLUB:'Casa club'};
      $('debtTitle').textContent='Adeudos de '+names[paymentType];
      $('debtDetails').innerHTML=items.map(c=>'<div class="mj-debt-item '+(paymentType==='EXTRAORDINARIO'?'extra':paymentType==='CASA_CLUB'?'club':'')+'"><strong>'+esc(c.concepto||names[paymentType])+(c.recargo?'<small>Incluye '+money(c.recargo)+' de recargo por corte del día 10 vencido</small>':'')+'</strong><span>'+esc(c.periodo||'')+(c.fechaLimitePago?' · Límite '+esc(c.fechaLimitePago):'')+(c.estado==='EN_REVISION'?' · Comprobante en revisión':'')+'</span><b>'+money(c.monto)+'</b></div>').join('');
      $('debtTotal').textContent=money(debts.totales?.[paymentType]||0);
      if(!$('debtModal').open)$('debtModal').showModal();
    }
    $('closeDebtModal').addEventListener('click',()=>$('debtModal').close());
    $('debtModal').addEventListener('click',event=>{if(event.target===$('debtModal'))$('debtModal').close()});

    function renderExtras() {
      $('extraList').innerHTML = extras.length ? extras.map(x => '<div class="extra' + (selectedExtra && Number(selectedExtra.id) === Number(x.id) ? ' selected' : '') + '" data-extra="' + Number(x.id) + '"><div><strong>' + esc(x.concepto) + '</strong><small>Mensualidad ' + esc(x.periodo) + (x.estado==='EN_REVISION'?' · Comprobante en revisión':' · Pendiente') + '</small></div><b>' + money(x.monto) + '</b></div>').join('') : '<div class="empty">No tienes mensualidades extraordinarias pendientes.</div>';
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
      const period=receiptPeriod(p),status=({PENDIENTE_VALIDACION:'En revisión',VALIDADO:'Validado',RECHAZADO:'Fallido'})[p.estatus]||p.estatus||'';
      return '<article class="receipt-item"><div class="receipt-main"><strong>'+esc(p.reciboFolio||p.folioReporte||'Recibo')+
        '</strong><p><b class="receipt-period-label">'+esc(period.label)+'</b><br>'+esc(p.concepto||'Pago registrado')+'<br>'+
        (p.reparto?.length?p.reparto.map(d=>esc(d.calle)+' · Casa '+esc(d.numero)+': '+money(d.monto)).join('<br>'):esc((p.casa?.calleCorrecta || p.calleSnapshot))+' · Casa '+esc(p.numeroCasaSnapshot))+'</p><div class="receipt-meta"><span class="pill '+esc(p.estatus||'')+'">'+esc(status)+
        '</span><span class="pill">'+esc(p.tipoPago==='EXTRAORDINARIO'?'Extraordinario':p.tipoPago==='CASA_CLUB'?'Casa club':'Mantenimiento')+
        '</span></div></div><div class="receipt-side"><b>'+moneyCard(p.monto)+'</b><button class="receipt-view-btn" type="button" data-receipt-detail="'+Number(p.id)+'">Ver detalle</button></div></article>';
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
    // Refresca solo Mis recibos mediante el mismo endpoint usado por la carga inicial.
    // Se preservan las tarjetas visibles si la red falla temporalmente.
    let receiptRefreshBusy = false;
    $('refreshReceipts').addEventListener('click', async () => {
      if (receiptRefreshBusy) return;
      const button = $('refreshReceipts');
      receiptRefreshBusy = true;
      button.disabled = true;
      button.classList.add('is-loading');
      button.setAttribute('aria-busy', 'true');
      button.title = 'Actualizando historial de pagos…';
      try {
        const updated = await loadReceipts({ preserveOnError: true });
        toast(updated ? 'Historial de pagos actualizado.' : 'No fue posible actualizar el historial. Intenta de nuevo.');
      } finally {
        receiptRefreshBusy = false;
        button.disabled = false;
        button.classList.remove('is-loading');
        button.removeAttribute('aria-busy');
        button.title = 'Actualizar historial de pagos';
      }
    });
    $('showAllReceipts').addEventListener('click',()=>{$('receiptAllModal').showModal();renderReceipts();});
    $('closeReceiptAll').addEventListener('click',()=>$('receiptAllModal').close());
    let activeReceiptId=null;
    $('closeReceiptDetails').addEventListener('click',()=>$('receiptDetailsModal').close());
    $('receiptDetailsModal').addEventListener('close',()=>{activeReceiptId=null});
    function renderReceiptStatus(p){
      const el=$('receiptStatusPanel');
      if(!el||!p)return;
      let v=p.verificacionBancaria||{};
      if(typeof v==='string'){try{v=JSON.parse(v)}catch{v={}}}
      if(!v||typeof v!=='object')v={};
      const etapa=String(v.etapa||'RECIBIDO');
      const validado=p.estatus==='VALIDADO',fallido=p.estatus==='RECHAZADO';
      const releyendo=etapa==='REINTENTO_OCR';
      const consultandoReintento=etapa==='REINTENTO_TITAN';
      const revisado=Boolean(v.fechaRevision);
      const buzonError=etapa==='ERROR_BUZON'||etapa==='ERROR_PROCESO';
      const conAvisos=(Number(v.avisosAutenticados)||0)>0;
      const vinculado=['COINCIDENCIA_VERIFICADA','FALLIDO','VALIDADO','DATOS_INCOMPLETOS','COINCIDENCIA_AMBIGUA'].includes(etapa);
      const fecha=v.fechaRevision?new Date(v.fechaRevision):null;
      const fechaTexto=fecha&&Number.isFinite(fecha.getTime())
        ?new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(fecha)
        :'Aún no se ha ejecutado';
      const titulo=validado?'Pago confirmado':fallido?'Validación fallida':releyendo?'Releyendo comprobante con OCR':consultandoReintento?'Consultando banco Titan':buzonError?'Verificación interrumpida':'Comprobación bancaria en curso';
      const mensaje=String(v.detalle||p.observacionesRevision||'Recibimos el comprobante y estamos esperando el resultado de la consulta a Titan.');
      const refInfo=v.diagnosticoReferencia;
      const bloqueante=v.cotejoAvisos?.filtroBloqueante||'';
      const detallesReferencia=refInfo&&etapa==='SIN_COINCIDENCIA'
        ? ' Referencia guardada y OCR: '+(refInfo.coincideFormularioOcr?'coinciden':'no coincide o no se pudo leer')
          +(bloqueante && bloqueante!=='IDENTIFICADOR'
            ? '. Referencia bancaria: pendiente de cotejar porque antes falta validar '+({DESTINO:'la cuenta',IMPORTE:'el importe',FECHA:'la fecha',VIVIENDA:'la vivienda'}[bloqueante]||'otros datos')+'.'
            : '. Referencia guardada y aviso Titan: '+(refInfo.coincideFormularioAviso?'coinciden':'no coinciden')+'.')
        : '';
      const formatPaso=(n,nombre,detalle,estado)=>{
        const sym=estado==='done'?'✓':estado==='failed'?'!':estado==='current'?'•':String(n);
        return '<li class="'+esc(estado)+'"><span class="receipt-step-circle">'+esc(sym)+'</span><div class="receipt-step-content"><strong>'+
          esc(nombre)+'</strong><p>'+esc(detalle)+'</p></div></li>';
      };
      const pasos=[
        formatPaso(1,'Comprobante recibido','El reporte se guardó correctamente y tiene un folio de seguimiento.','done'),
        formatPaso(2,releyendo?'Nueva lectura OCR en proceso':'Datos OCR extraídos',
          releyendo?'El servidor está releyendo la imagen original para comprobar importe, fecha, hora, identificador y destino.':
          consultandoReintento?'Nueva lectura OCR concluida; datos comprobados nuevamente.':
          'Se leyeron los datos bancarios y el destinatario del comprobante.',releyendo?'current':'done'),
        formatPaso(3,'Consulta de buzón Titan',releyendo?'Iniciará al finalizar la nueva lectura OCR.':
          consultandoReintento?'Buscando una notificación auténtica y compatible en Titan.':
          buzonError?'La conexión o la aplicación de la consulta tuvo un problema; se reintentará.':
          revisado?'Última revisión: '+fechaTexto:'Se programó la búsqueda de avisos bancarios.',
          releyendo?'waiting':consultandoReintento||buzonError?'current':revisado?'done':'current'),
        formatPaso(4,'Remitente del correo',conAvisos?Number(v.avisosAutenticados)+' aviso(s) coinciden con el remitente autorizado.':revisado?'No hay avisos del remitente autorizado utilizables todavía.':'Esperando un aviso del remitente autorizado.',conAvisos?'done':revisado&&!buzonError?'current':'waiting'),
        formatPaso(5,'Comparación de datos bancarios',vinculado?(fallido?mensaje:'Se ha encontrado al menos un identificador relacionado.'):etapa==='SIN_COINCIDENCIA'?mensaje+detallesReferencia:'Se comparan identificador, importe, fecha, cuenta y vivienda.',fallido?'failed':validado?'done':vinculado?'current':conAvisos?'current':'waiting'),
        formatPaso(6,'Resultado',validado?'Banco confirmado; el pago fue validado.':fallido?'No se confirmó el reporte: '+mensaje:'Todavía no existe evidencia suficiente para confirmar o rechazar el depósito.',fallido?'failed':validado?'done':'waiting')
      ];
      el.innerHTML='<section class="receipt-check-header" aria-live="polite"><div class="receipt-check-top"><div><small class="eyebrow">SEGUIMIENTO BANCARIO</small><h3>'+
        esc(titulo)+'</h3><p>'+esc(mensaje)+'</p></div><div class="receipt-check-actions">'+
        (fallido?'<button type="button" class="receipt-bank-retry" data-bank-retry>Reintentar validación ↻</button>':'')+
        '<button type="button" class="receipt-check-refresh" data-check-refresh>Actualizar estado ↻</button></div></div>'+
        '<div class="receipt-check-meta"><span>Última consulta: '+esc(fechaTexto)+
        '</span><span>Avisos consultados: '+Number(v.avisosConsultados||0)+'</span><span>Remitente autorizado: '+Number(v.avisosAutenticados||0)+
        '</span></div></section>'+
        (releyendo||consultandoReintento?
          '<div class="receipt-retry-progress" role="status" aria-live="polite"><span class="receipt-retry-spinner" aria-hidden="true"></span><div><strong>'+
          (releyendo?'Leyendo nuevamente la imagen…':'Comparando con notificaciones bancarias…')+
          '</strong><p>El comprobante original se conserva. La acreditación solo ocurre después de confirmar el banco.</p></div></div>':'')+
        (fallido?'<p class="receipt-check-warning" role="alert"><strong>Motivo específico del fallo:</strong> '+esc(mensaje)+'</p>':'')+
        '<h3 class="receipt-timeline-heading">Etapas de la comprobación</h3><ol class="receipt-timeline">'+pasos.join('')+'</ol>';
    }
    $('receiptDetailsBody').addEventListener('click',async event=>{
      const b=event.target.closest('[data-check-refresh]');if(!b||activeReceiptId===null)return;
      b.disabled=true;b.textContent='Consultando…';
      try{
        const ok=await loadReceipts({preserveOnError:true});
        if(!ok)throw Error('No se pudo consultar el estado. Intenta nuevamente.');
        const actual=receiptItems.find(x=>Number(x.id)===activeReceiptId);
        if($('receiptDetailsModal').open&&actual)renderReceiptStatus(actual);
      }catch(error){toast(error.message)}
      finally{if(b.isConnected){b.disabled=false;b.textContent='Actualizar estado ↻'}}
    });
    // El estado visible se consulta mientras el modal esté abierto.
    // No depende de un mensaje toast oculto detrás del <dialog>.
    let receiptDetailsPolling=false;
    setInterval(async()=>{
      if(document.hidden||!$('receiptDetailsModal').open||activeReceiptId===null||receiptDetailsPolling)return;
      const pending=receiptItems.find(p=>Number(p.id)===activeReceiptId);
      if(!pending||pending.estatus!=='PENDIENTE_VALIDACION')return;
      receiptDetailsPolling=true;
      try{
        const ok=await loadReceipts({preserveOnError:true});
        if(ok&&$('receiptDetailsModal').open){
          const actual=receiptItems.find(p=>Number(p.id)===activeReceiptId);
          if(actual){
            renderReceiptStatus(actual);
            if(actual.estatus!=='PENDIENTE_VALIDACION'){
              const feedback=$('receiptRetryFeedback');
              if(feedback)feedback.hidden=true;
            }
          }
        }
      }finally{receiptDetailsPolling=false;}
    },3000);
    function retryFeedback(message,isError=false){
      const line=$('receiptRetryFeedback');
      if(!line)return;
      line.hidden=false;
      line.classList.toggle('error',Boolean(isError));
      line.textContent=message;
    }
    // Reintenta con la evidencia existente; la aprobación sigue en el worker bancario.
    let bankRetryBusy=false;
    $('receiptDetailsBody').addEventListener('click',async event=>{
      const button=event.target.closest('[data-bank-retry]');
      if(!button||bankRetryBusy||activeReceiptId===null)return;
      const id=activeReceiptId;
      const actual=receiptItems.find(p=>Number(p.id)===id);
      if(actual?.estatus!=='RECHAZADO')return;
      bankRetryBusy=true;
      button.disabled=true;
      button.textContent='Volviendo a leer OCR…';
      retryFeedback('Preparando una nueva lectura del comprobante original…');
      try{
        await api('/pagos/'+id+'/reintentar-validacion',{
          method:'POST',headers:headers(true),body:'{}'
        });
        retryFeedback('Solicitud recibida. El servidor está releyendo el comprobante mediante OCR; después consultará Titan.');
        const ok=await loadReceipts({preserveOnError:true});
        const actualizado=receiptItems.find(p=>Number(p.id)===id);
        if(ok&&$('receiptDetailsModal').open&&activeReceiptId===id&&actualizado)
          renderReceiptStatus(actualizado);
      }catch(error){
        const message=error.httpStatus===404
          ? (/comprobante no encontrado/i.test(error.message||'')
              ? 'No se encontró este comprobante para la vivienda seleccionada. Actualiza el historial e inténtalo nuevamente.'
              : 'El backend no reconoce la solicitud de reintento. Confirma que Hostinger tenga desplegado el último backend.')
          :String(error.message||'No fue posible iniciar el reintento.');
        retryFeedback(message,true);
      }
      finally{
        bankRetryBusy=false;
        if(button.isConnected){button.disabled=false;button.textContent='Reintentar validación ↻';}
      }
    });
    async function openReceiptDetails(id){
      const p=receiptItems.find(x=>Number(x.id)===Number(id));
      if(!p)return toast('No se encontró el pago');
      activeReceiptId=Number(id);
      const groups=[
        {titulo:'Resumen de la operación', campos:[
          ['Vivienda / reparto',p.reparto?.length?p.reparto.map(d=>d.calle+' · Casa '+d.numero+': '+money(d.monto)).join(' / '):String((p.casa?.calleCorrecta||p.calleSnapshot)||'')+' · Casa '+String(p.numeroCasaSnapshot||'')],
          ['Monto depositado',money(p.monto)],['Fecha de operación',p.fechaOperacion],
          ['Hora del depósito',p.horaOperacion],['Tipo de cuota',p.tipoPago]
        ]},
        {titulo:'Identificación bancaria',campos:[
          ['Folio del reporte',p.folioReporte],['Folio del recibo',p.reciboFolio||'Pendiente'],
          ['Identificador bancario',p.folioOperacion]
        ]},
        {titulo:'Concepto y recargos',campos:[
          ['Concepto',p.concepto],['Recargo incluido',money(p.recargo)]
        ]}
      ];
      $('receiptDetailsHeading').textContent='Pago '+String(p.reciboFolio||p.folioReporte||p.id);
      const details=$('receiptDetailsBody');
      details.innerHTML='<div id="receiptStatusPanel"></div><p id="receiptRetryFeedback" class="receipt-retry-feedback" role="status" aria-live="polite" hidden></p><div class="receipt-detail-sections">'+
        groups.map(g=>'<section class="receipt-detail-section"><h3>'+esc(g.titulo)+'</h3><div class="receipt-detail-grid">'+
          g.campos.map(([k,v])=>'<div class="receipt-detail-field"><small>'+esc(k)+'</small><strong>'+esc(v??'—')+'</strong></div>').join('')+
          '</div></section>').join('')+'</div><div class="receipt-proof-block"><b>Comprobante adjunto</b>'+
        '<p id="receiptPhotoStatus">Cargando archivo…</p><img id="receiptPhoto" alt="Comprobante bancario" hidden></div>'+
        '<div class="receipt-detail-actions"><button class="receipt-more" type="button" data-receipt-id="'+Number(p.id)+'">Abrir recibo PDF ↗</button></div>';
      renderReceiptStatus(p);
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
    async function updatePaymentSummary() {
      const revision = ++quoteRevision;
      quote = null;
      const date = $('operationDate').value;
      void repartoUI.actualizar(paymentType,proofConfirmed,ocrAmount,date,normalizeTime($('operationTime').value));
      if(repartoUI.activo(paymentType)){
        $('amount').readOnly=true;
        if(ocrAmount)$('amount').value=ocrAmount;
        $('lateRow').hidden=true;
        $('summaryBase').textContent='Reparto por vivienda';
        $('summaryTotal').textContent=money(ocrAmount);
        $('amount').min='0.01';
        $('officialConcept').value='Mantenimiento distribuido entre viviendas';
        $('paymentPreview').textContent='Los recargos y meses se calculan por separado para cada vivienda. El depósito completo sigue sujeto a validación bancaria.';
        return;
      }
      $('amount').readOnly=!['SUPER_ADMIN','ADMINISTRADOR'].includes(role());

      if (paymentType === 'EXTRAORDINARIO') {
        const amount = Number(selectedExtra?.monto || 0); $('summaryBase').textContent = selectedExtra ? money(amount) : 'Selecciona una cuota'; $('summaryLate').textContent = money(0); $('lateRow').hidden = true; $('summaryTotal').textContent = money(amount); $('amount').min = amount || 1; $('officialConcept').value = selectedExtra ? 'Cuota extraordinaria: ' + selectedExtra.concepto+' · '+selectedExtra.periodo : 'Selecciona una mensualidad extraordinaria'; return;
      }
      if(paymentType==='CASA_CLUB'){
        const amount=Number(selectedClub?.monto||0);$('summaryBase').textContent=selectedClub?money(amount):'Selecciona reservación';$('lateRow').hidden=true;$('summaryTotal').textContent=money(amount);$('amount').min=amount||1;
        $('officialConcept').value=selectedClub?'Casa club '+selectedClub.periodo+' · Renta '+money(selectedClub.renta)+' + depósito '+money(selectedClub.deposito)+' + limpieza '+money(selectedClub.limpieza):'Selecciona una reservación aprobada';return;
      }
      $('lateRow').hidden = false;
      $('amount').removeAttribute('max');
      $('summaryBase').textContent = money(config?.mantenimiento?.montoBase || 300);
      $('summaryLate').textContent = 'Consultando…';
      $('summaryTotal').textContent = '—';
      $('ruleAmount').textContent = '—';
      $('amount').min = '0.01';
      $('officialConcept').value = 'Mantenimiento: recargos por cortes vencidos y mensualidades';
      updatePreview();
      if (!date) { $('summaryLate').textContent = 'Selecciona fecha'; return; }
      try {
        const hora = normalizeTime($('operationTime').value);
        const result = await api('/pagos/cotizacion?fechaOperacion=' + encodeURIComponent(date)
          + '&horaOperacion=' + encodeURIComponent(hora)
          + (Number($('amount').value)>0?'&monto='+encodeURIComponent($('amount').value):''), { headers: headers() });
        if (revision !== quoteRevision || paymentType !== 'MANTENIMIENTO') return;
        // El comprobante BBVA puede mostrar el día operativo SPEI (26), mientras
        // el movimiento ocurrió viernes 23 después de las 18:00.
        const fechaReal = result.data.fechaOperacionReal || date;
        const ajusteSpei = !!result.data.ajusteSpei;
        if (ajusteSpei && fechaReal !== date) {
          $('operationDate').value = fechaReal;
          $('operationDate').dispatchEvent(new Event('input', { bubbles: true }));
        }
        quote = { ...result.data, minimoReporte: result.data.minimoReporte ?? result.data.minimo, fechaOperacion: fechaReal };
        const fechaLegible = fecha => window.MJDateDisplay?.format?.(fecha) || fecha;
        const avisoSpei = ajusteSpei
          ? 'El comprobante muestra ' + fechaLegible(date) + ' como día operativo SPEI. Se reportará con fecha '
            + fechaLegible(fechaReal) + '. El depósito aún requiere confirmación bancaria.'
          : quote.fechaPosterior
            ? 'El comprobante muestra ' + fechaLegible(date) + ', una fecha bancaria posterior a hoy. Puedes reportarlo; '
              + 'los recargos se calculan solo hasta la fecha actual y el pago continuará En revisión hasta confirmar el depósito con el banco.'
            : '';
        $('amount').removeAttribute('max');
        $('summaryBase').textContent = money(quote.base);
        $('summaryLate').textContent = money(quote.recargo);
        $('lateRow').classList.toggle('late', quote.recargo > 0);
        $('summaryTotal').textContent = money(quote.minimo);
        $('ruleAmount').textContent = money(quote.minimo);
        $('amount').min = String(quote.minimoReporte);
        updatePreview();
        if (avisoSpei) $('paymentPreview').textContent = avisoSpei + ' ' + $('paymentPreview').textContent;
      } catch (e) {
        if (revision !== quoteRevision) return;
        $('summaryLate').textContent = 'No disponible';
        $('paymentPreview').textContent = 'No se pudo validar la fecha o cotizar el pago: ' + e.message;
        if (/fecha|futura|depósito|operación/i.test(e.message)) toast(e.message);
      }
    }

    function setTab(type) {
      paymentType = type;renderPaymentStatusCards(); document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === type)); $('paymentPreview').hidden = type !== 'MANTENIMIENTO'; $('extraCard').hidden = type !== 'EXTRAORDINARIO';$('clubPaymentCard').hidden=type!=='CASA_CLUB'; $('maintenanceRule').hidden = type !== 'MANTENIMIENTO'; $('paymentTitle').textContent = type === 'MANTENIMIENTO' ? 'Reportar mantenimiento' : type==='CASA_CLUB'?'Reportar pago de casa club':'Reportar cuota extraordinaria'; updatePaymentSummary();showDebtModal();
    }

    function readFile(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) }) }
    function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src }) }
    async function canvasToCompressed(canvas) { let q = .9, data = canvas.toDataURL('image/jpeg', q); while (data.length > 1350000 && q > .42) { q -= .1; data = canvas.toDataURL('image/jpeg', q) } if (data.length > 1500000) throw Error('El comprobante procesado es demasiado grande.'); return data }
    async function imageToData(file) { const raw = await readFile(file); const image = await loadImage(raw); const max = 2800; const upscale = image.width >= 500 && image.width < 1150 ? Math.min(1.75, 1150 / image.width) : 1; const scale = Math.min(upscale, max / Math.max(image.width, image.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale)); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); return canvasToCompressed(canvas) }
    async function pdfToData(file) { if (!window.mjPdfJs) throw Error('El lector PDF todavía está cargando. Intenta de nuevo en unos segundos.'); const bytes = new Uint8Array(await file.arrayBuffer()); const pdf = await window.mjPdfJs.getDocument({ data: bytes }).promise; const page = await pdf.getPage(1); const viewport = page.getViewport({ scale: 1.7 }); const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height; await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise; return canvasToCompressed(canvas) }
    function normalizeAmount(value) { const s = String(value || '').replace(/[^0-9.,]/g, ''); if (!s) return ''; const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.'); const n = Number(comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')); return Number.isFinite(n) ? n.toFixed(2) : '' }
    function normalizeDate(v) { let m = String(v || '').match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'); m = String(v || '').match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/); if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); return '' }
    function normalizeTime(v) {
      const m = String(v || '').match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
      if (!m) return '';
      return m[1].padStart(2, '0') + ':' + m[2] + ':' + (m[3] || '00');
    }
    const isPhotoDevice = window.matchMedia('(max-width: 900px) and (pointer: coarse)').matches;
    // En celulares, Safari ofrece directamente su selector nativo de fotos, cámara y archivos.
    if (isPhotoDevice) {
      $('proofInput').accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
      $('proofInput').removeAttribute('capture');
    }
    function setDestinationStatus(message, state = '') {
      const el = $('destinationCheck');
      el.hidden = !message;
      el.className = 'proof-validation' + (state ? ' ' + state : '');
      el.textContent = message || '';
    }
    function resetProof() {
      scanRevision++;
      proofData = '';
      ocrText = '';
      ocrAmount='';repartoUI.reset();
      void repartoUI.actualizar(paymentType,false,'','');
      proofConfirmed = false;
      proofMeta = { name: '', mime: '' };
      $('proofInput').value = '';
      $('proofPreview').removeAttribute('src');
      $('previewBox').classList.remove('show');
      $('ocrBar').style.width = '0%';
      $('ocrState').textContent = 'Esperando archivo…';
      for (const id of ['operationFolio', 'amount', 'operationDate', 'operationTime']) $(id).value = '';
      $('submitPayment').disabled = true;
      setDestinationStatus('');
      updatePaymentSummary();
    }
    $('removeProof').addEventListener('click', resetProof);


    function mostrarCamposFaltantes({message,camposFaltantes=[],camposCorreo=[]}) {
      $('missingProofExplanation').textContent = message || 'La imagen no contiene información suficiente para verificar el pago.';
      const campos = Array.isArray(camposFaltantes) && camposFaltantes.length ? camposFaltantes : ['Clave de rastreo o referencia bancaria'];
      $('missingProofFields').replaceChildren(...campos.map(field => {
        const li = document.createElement('li'); li.textContent = field; return li;
      }));
      $('missingProofMail').textContent = Array.isArray(camposCorreo) && camposCorreo.length
        ? 'En la notificación bancaria se identificaron: ' + camposCorreo.join(', ') + '.'
        : 'Si el correo bancario no incluye el folio, necesitas la referencia o clave de rastreo del movimiento.';
      const dialog = $('missingProofModal');
      if (!dialog.open) dialog.showModal();
    }
    $('closeMissingProof').addEventListener('click', () => $('missingProofModal').close());
    $('confirmMissingProof').addEventListener('click', () => $('missingProofModal').close());
    $('missingProofModal').addEventListener('click', event => {
      if (event.target === $('missingProofModal')) $('missingProofModal').close();
    });

    async function runOcr() {
      if (!proofData) return toast('Primero adjunta un comprobante.');
      const revision = ++scanRevision;
      proofConfirmed = false;
      $('submitPayment').disabled = true;
      const retry = $('retryOcr');
      retry.disabled = true;
      $('ocrState').textContent = 'Leyendo comprobante…';
      $('ocrBar').style.width = '5%';
      setDestinationStatus('Verificando nombre y terminación bancaria en Destino…');
      try {
        if (!window.Tesseract || !window.MJComprobante) throw Error('El lector OCR no se ha cargado. Revisa tu conexión.');
        const worker = await Tesseract.createWorker('spa+eng', 1, {
          logger: m => {
            if (scanRevision !== revision) return;
            if (m.status === 'recognizing text') {
              const p = Math.round((m.progress || 0) * 100);
              $('ocrBar').style.width = p + '%';
              $('ocrState').textContent = 'Leyendo texto… ' + p + '%';
            }
          }
        });
        const readings = [];
        try {
          // Primero leer la página completa: preservar la validación existente.
          await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.AUTO });
          const first = await worker.recognize(proofData);
          const firstText = first?.data?.text || '';
          readings.push(firstText);
          if (scanRevision !== revision) return;
          const data = MJComprobante.extract(firstText);
          const destination = MJComprobante.verifyDestination(firstText,
            config?.titular || 'MARIA DEL ROCIO BAHENA JUAREZ',
            config?.destinoUltimos4 || '4409');
          if (!destination.ok || !data.amount || !data.date || !data.time ||
              !(data.claveRastreo || data.referencia || data.folio)) {
            // En capturas bancarias de dos columnas, AUTO puede perder los
            // valores alineados a la derecha. Releer con texto disperso.
            $('ocrState').textContent = 'Releyendo detalles bancarios…';
            try {
              await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT });
              const second = await worker.recognize(proofData);
              if (second?.data?.text?.trim()) readings.push(second.data.text);
            } catch (fallbackError) {
              console.warn('Segunda lectura OCR no disponible:', fallbackError.message);
            }
          }
        } finally {
          await worker.terminate();
        }
        if (scanRevision !== revision) return;
        ocrText = readings.join(MJComprobante.OCR_PASS_MARKER);
        const beneficiary = config?.titular || 'MARIA DEL ROCIO BAHENA JUAREZ';
        const suffix = config?.destinoUltimos4 || '4409';
        const destination = MJComprobante.verifyDestination(ocrText, beneficiary, suffix);
        if (!destination.ok) {
          $('ocrState').textContent = 'Comprobante no aceptado: destinatario no verificado.';
          setDestinationStatus(destination.message + ' Adjunta una captura más clara donde se vea Destino.', 'invalid');
          $('ocrBar').style.width = '0%';
          mostrarCamposFaltantes({message:destination.message,
            camposFaltantes: [
              ...(!destination.owner ? ['Nombre del beneficiario'] : []),
              ...(!destination.suffix ? ['Cuenta destino terminación ' + suffix] : [])
            ]});
          return;
        }
        const extracted = MJComprobante.extract(ocrText);
        const candidatos = MJComprobante.candidatosOperacion(ocrText);
        const identificador = extracted.claveRastreo || extracted.referencia || extracted.folio || candidatos[0] || '';
        // Un código sin etiqueta NO es una aprobación; Titan coteja los códigos
        // explícitos antes de acreditar. La selección se valida en el servidor.
        $('operationFolio').value = identificador;
        $('amount').value = extracted.amount || '';
        ocrAmount=extracted.amount||'';
        $('operationDate').value = extracted.date || '';
        $('operationTime').value = extracted.time || '';
        const missing = !identificador || !extracted.date || !extracted.time || !extracted.amount;
        const camposFaltantes = [
          ...(!identificador ? ['Código de operación o referencia verificable'] : []),
          ...(!extracted.date ? ['Fecha de operación'] : []),
          ...(!extracted.time ? ['Hora de operación'] : []),
          ...(!extracted.amount ? ['Monto depositado'] : [])
        ];
        if (missing && !['SUPER_ADMIN', 'ADMINISTRADOR'].includes(role())) {
          $('ocrState').textContent = 'Lectura incompleta. Vuelve a leer o adjunta un comprobante más claro.';
          setDestinationStatus('No se pudieron leer todos los datos bancarios. Vuelve a leer el comprobante o solicita ayuda a Administración.', 'invalid');
          mostrarCamposFaltantes({message:'No se pudieron leer todos los datos necesarios. Adjunta el detalle del movimiento donde aparezcan los campos indicados.',
            camposFaltantes});
          return;
        }
        proofConfirmed = true;
        $('submitPayment').disabled = false;
        $('ocrBar').style.width = '100%';
        $('ocrState').textContent = 'Lectura completada. Revisa los campos detectados.';
        setDestinationStatus('Destino comprobado en la imagen: ' + beneficiary + ' · cuenta terminación ' + suffix + '. El depósito aún requiere confirmación bancaria.', 'ok');
        updatePaymentSummary();
        if (missing) toast('Comprobante aceptado; revisa y completa los campos que el OCR no pudo leer.');
      } catch (error) {
        if (scanRevision !== revision) return;
        proofConfirmed = false;
        $('ocrBar').style.width = '0%';
        $('ocrState').textContent = 'No se pudo leer el comprobante.';
        setDestinationStatus('La lectura no pudo comprobar el destino: ' + error.message + '. Vuelve a leer o adjunta otra imagen.', 'invalid');
        toast('No se pudo validar el comprobante.');
      } finally {
        retry.disabled = false;
      }
    }

    async function onProofSelected(e) {
      const file = e.target.files?.[0];
      if (!file) return;
      resetProof();
      const selectedRevision = scanRevision;
      try {
        if (isPhotoDevice && file.type === 'application/pdf') throw Error('En celular selecciona una imagen desde la biblioteca de fotos.');
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'].includes(file.type)) throw Error('Formato no admitido. Usa JPG, PNG, WEBP o PDF en computadora.');
        proofMeta = { name: file.name || 'comprobante', mime: file.type || '' };
        const processed = file.type === 'application/pdf' ? await pdfToData(file) : await imageToData(file);
        if (scanRevision !== selectedRevision) return; // A different photo was selected meanwhile.
        proofData = processed;
        $('proofPreview').src = proofData;
        $('fileName').textContent = file.name;
        $('previewBox').classList.add('show');
        await runOcr();
      } catch (error) {
        if (scanRevision !== selectedRevision) return;
        resetProof();
        toast(error.message);
      }
    }
    $('proofInput').addEventListener('change', onProofSelected);

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
    $('amount').addEventListener('input', updatePaymentSummary);
    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('extraList').addEventListener('click', e => { const row = e.target.closest('[data-extra]'); if (!row) return; selectedExtra = extras.find(x => Number(x.id) === Number(row.dataset.extra)) || null; renderExtras(); updatePaymentSummary() });
    $('clubPaymentList').addEventListener('click',e=>{const row=e.target.closest('[data-club]');if(!row)return;selectedClub=(debts?.tipos?.CASA_CLUB||[]).find(c=>Number(c.id)===Number(row.dataset.club))||null;renderClub();updatePaymentSummary();});

    $('adminExtraBox').hidden=true;

    $('paymentForm').addEventListener('submit', async e => { e.preventDefault(); if(reportBusy)return; if(repartoUI.activo(paymentType)&&!repartoUI.valido())return toast('La suma debe coincidir con el depósito y el reparto debe estar cotizado.'); if (!proofData || !proofConfirmed) return toast('Primero adjunta un comprobante cuyo Destino y cuenta hayan sido comprobados por OCR.'); if (paymentType === 'EXTRAORDINARIO' && (!selectedExtra||selectedExtra.estado==='EN_REVISION')) return toast('Selecciona un cargo extraordinario sin comprobante pendiente.'); if(paymentType==='CASA_CLUB'&&(!selectedClub||selectedClub.estado==='EN_REVISION'))return toast('Selecciona una reservación aprobada sin comprobante en revisión.'); const amount = Number($('amount').value), required = Number(String($('summaryTotal').textContent).replace(/[^0-9.]/g, '')); if (!Number.isFinite(amount) || amount <= 0 || (paymentType !== 'MANTENIMIENTO' && Math.abs(amount - required) > .009)) return toast(paymentType === 'MANTENIMIENTO' ? 'Ingresa un monto mayor que cero.' : 'El comprobante debe corresponder exactamente a ' + money(required) + '.');
    if(paymentType==='MANTENIMIENTO' && !repartoUI.activo(paymentType)){
      const date=$('operationDate').value;
      if(!/^20\d{2}-\d{2}-\d{2}$/.test(date) || date<'2026-10-01')
        return toast('El comprobante debe contener una fecha válida desde octubre de 2026.');
      // El servidor es la fuente de verdad para la fecha actual en México.
      if (!quote || quote.fechaOperacion !== date)
        return toast('Espera la cotización del comprobante o vuelve a leer la fecha bancaria.');
      if (quote.modoPrueba && Math.round(amount * 100) !== 1000)
        return toast('Para esta cuenta de prueba el comprobante debe ser de $10.00 exactos.');
      if (Math.round(amount * 100) < Math.round(quote.minimoReporte * 100))
        return toast('El abono debe ser de al menos $0.01.');
    } const payload = { ...(repartoUI.activo(paymentType)?{reparto:repartoUI.datos()}:{}), tipoPago: paymentType, cuotaExtraordinariaId: selectedExtra?.cuotaExtraordinariaId || null, cargoExtraordinarioId:selectedExtra?.id||null,reservaCasaClubId:selectedClub?.id||null, folioOperacion: $('operationFolio').value.trim(), fechaOperacion: $('operationDate').value, horaOperacion: normalizeTime($('operationTime').value), monto: amount, comprobanteData: proofData, comprobanteNombre: proofMeta.name, comprobanteMime: proofMeta.mime, textoOcr: ocrText }; const btn = $('submitPayment'); reportBusy=true; btn.disabled = true; btn.textContent = 'Generando recibo…'; try { const d = await api('/pagos', { method: 'POST', headers: headers(true), body: JSON.stringify(payload) }); toast(d.vigencia?.pendienteConfiguracion ? 'Pago validado sin TAGs destinatarios; Administración debe revisar el acceso.' : (d.data?.estatus === 'VALIDADO' ? 'Pago validado correctamente.' : 'Pago reportado correctamente; pendiente de validación bancaria.')); await Promise.all([loadReceipts(), loadValidity(),loadDebts(),loadExtras(),...(repartoUI.activo(paymentType)?[repartoUI.cargar().catch(e=>toast(e.message))]:[])]); if (d.data?.id && d.data?.estatus==='VALIDADO' && d.data?.tieneReciboPdf) await openReceipt(d.data.id); $('paymentForm').reset(); resetProof(); selectedExtra = null;selectedClub=null; updatePaymentSummary() } catch (err) {
      if (err.code === 'COMPROBANTE_INCOMPLETO' || err.code === 'COMPROBANTE_NO_CONCILIABLE'
        || err.code === 'FOLIO_NO_PRESENTE_EN_CORREO' || err.code === 'BUZON_NO_VERIFICABLE'
        || err.code === 'FOLIO_SIN_RESPALDO_BANCARIO') {
        mostrarCamposFaltantes(err);
      } else toast(err.message);
    } finally { reportBusy=false; btn.disabled = !proofConfirmed||!repartoUI.valido(); btn.textContent = 'Reportar pago y generar recibo' } });

    // Fallback para iOS Safari cuando la Clipboard API no está habilitada.
    function fallbackCopy(value) {
      const input = document.createElement('textarea');
      input.value = value;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.focus();
      input.select();
      let copied = false;
      try { copied = document.execCommand('copy'); }
      finally { input.remove(); }
      return copied;
    }
    document.querySelectorAll('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
      const value = $(btn.dataset.copy).textContent.trim();
      if (!value || value === '—') return;

      try {
        if (navigator.clipboard?.writeText) {
          try { await navigator.clipboard.writeText(value); }
          catch (error) {
            if (!fallbackCopy(value)) throw error;
          }
        } else if (!fallbackCopy(value)) {
          throw Error('El navegador no permitió copiar al portapapeles');
        }
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
      const canEditProof = ['SUPER_ADMIN', 'ADMINISTRADOR'].includes(role());
      for (const id of ['operationFolio', 'amount', 'operationDate', 'operationTime']) $(id).readOnly = !canEditProof;
      if (canEditProof) $('proofFieldHelp').textContent = 'Revisa los datos leídos del comprobante. Administración puede completar o corregir la lectura.';
      $('adminExtraBox').hidden = true; // Los proyectos nacen con su egreso, no aquí.

      // Mostrar el domicilio desde la sesión incluso antes de consultar el API.
      paintProfile(storedUser());

      try {
        await Promise.all([loadProfile(), loadConfig(),repartoUI.cargar()]);
        $('apiStatus').textContent = 'Conectado';
      } catch (e) {
        $('apiStatus').textContent = 'Revisar conexión';
        toast(e.message);
      }

      // Estas consultas no deben impedir que la vivienda y la cuenta se pinten.
      await Promise.allSettled([loadExtras(), loadReceipts(), loadValidity(), loadAdministration(),loadDebts()]);
      // Consultar sin recargar la página mientras existan recibos en revisión.
      let syncBusy = false;
      async function syncPendingReceipts() {
        if (document.hidden || syncBusy || !receiptItems.some(p => p.estatus === 'PENDIENTE_VALIDACION')) return;
        syncBusy = true;
        try { await loadReceipts({preserveOnError:true}); }
        finally { syncBusy = false; }
      }
      setInterval(syncPendingReceipts,10000);
      document.addEventListener('visibilitychange',() => { if (!document.hidden) void syncPendingReceipts(); });
      window.addEventListener('focus',() => void syncPendingReceipts());
      const requested=new URLSearchParams(location.search).get('tab');
      setTab(['MANTENIMIENTO','EXTRAORDINARIO','CASA_CLUB'].includes(requested)?requested:'MANTENIMIENTO');
    }
    // El resumen extenso de vigencia fue retirado de la UI. Conservamos esta
    // consulta con el estado contable de la vivienda.
    async function loadValidity() {
      try {
        const result = await api('/pagos/vigencia', { headers: headers() });
        validity = result.data;
        updatePreview();
      } catch (error) {
        // La cotización del pago conserva sus propios errores y validaciones.
        console.warn('No fue posible consultar las cuotas:', error);
      }
    }
    function updatePreview() {
      if(repartoUI.activo(paymentType))return;
      if (paymentType !== 'MANTENIMIENTO') return;
      const amount = Math.round(Number($('amount').value || 0) * 100);
      if (!quote) { $('paymentPreview').textContent = 'Selecciona la fecha del depósito para consultar los recargos de la vivienda.'; return; }
      if (!quote.aplicaciones || Math.round(Number(quote.monto)*100)!==amount) {
        $('paymentPreview').textContent = 'Adeudo en cuotas a la fecha del depósito: ' + money(quote.adeudoTotal) +
          '. Recargos pendientes: ' + money(quote.recargo) + '. Para completar la siguiente mensualidad: ' + money(quote.minimo) + '.';
        return;
      }
      const cobertura=quote.fechaFinalObjetivo || 'sin mensualidades completas registradas';
      $('paymentPreview').textContent = 'Al validar este depósito se abonarán ' + quote.aplicaciones.length +
        ' periodo(s) de cuotas y se completarán ' + quote.meses + ' mensualidad(es). Recargos abonados: ' + money(quote.recargo) +
        (quote.recargoPendienteDespues>0?' · Recargos aún pendientes: '+money(quote.recargoPendienteDespues):'') +
        '. Cobertura resultante: ' + cobertura + '. ' +
        (quote.abonoParcial ? 'El abono parcial queda registrado para el siguiente pago. ' : '') +
        'Los TAGs asociados se actualizarán después de la validación bancaria; también puedes pagar sin TAG.';
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
        card.setAttribute('aria-label', 'Consultar comprobante pendiente de ' + (p.casa?.calleCorrecta || p.calleSnapshot) + ', casa ' + p.numeroCasaSnapshot);
        card.innerHTML = '<span class="pending-mini-details"><strong>' + esc((p.casa?.calleCorrecta || p.calleSnapshot)) + ' · Casa ' + esc(p.numeroCasaSnapshot) +
          '</strong><span class="pending-mini-month">Mes del depósito: <b>' + esc(paymentMonthLabel(p.fechaOperacion)) + '</b></span><small>' + esc(p.fechaOperacion || 'Sin fecha') + ' · ' + esc(p.tipoPago === 'EXTRAORDINARIO' ? 'Extraordinario' : p.tipoPago==='CASA_CLUB'?'Casa club':'Mantenimiento') +
          '</small><small>Folio ' + esc(p.folioOperacion || '—') + '</small></span><span class="pending-mini-right"><b>' + money(p.monto) +
          '</b><span>Ver detalle ›</span></span>';
        card.addEventListener('click', () => openPendingDetail(p));
        box.append(card);
      }
    }
    async function openPendingDetail(p) {
      const dialog = $('pendingDetail');
      const body = $('pendingDetailBody');
      const type = p.tipoPago === 'EXTRAORDINARIO' ? 'Extraordinario' : p.tipoPago==='CASA_CLUB'?'Casa club':'Mantenimiento';
      body.innerHTML =
        '<div class="pending-detail-heading"><strong>' + esc((p.casa?.calleCorrecta || p.calleSnapshot)) + ' · Casa ' + esc(p.numeroCasaSnapshot) + '</strong><b>' + money(p.monto) + '</b></div>' +
        '<div class="pending-detail-meta"><div><small>Identificador bancario</small><strong>' + esc(p.folioOperacion || '—') + '</strong></div>' +
        '<div><small>Fecha</small><strong>' + esc(p.fechaOperacion || '—') + '</strong></div>' +
        '<div><small>Tipo</small><strong>' + esc(type) + '</strong></div></div>' +
        (p.reparto?.length?'<div class="pending-auto-status">'+p.reparto.map(d=>esc(d.calle)+' · Casa '+esc(d.numero)+': '+money(d.monto)).join('<br>')+'</div>':'')+
        '<div class="pending-proof"><strong>Comprobante bancario</strong><p id="pendingProofStatus">Cargando imagen…</p><img id="pendingProofImage" alt="Comprobante bancario, seleccionar para ampliar" role="button" tabindex="0" hidden><button type="button" class="pending-proof-zoom-button" id="pendingZoomButton" hidden>Ampliar fotografía ↗</button></div>' +
        '<div class="pending-auto-status" role="status">En revisión automática: el sistema confirmará el depósito únicamente cuando el comprobante coincida con una notificación del remitente autorizado en el buzón configurado. No es necesaria una decisión de Administración.</div>';
      dialog.showModal();
      dialog.scrollTop = 0;
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
  
