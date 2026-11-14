/* Contenido del recorrido general de Misión Jardines.
   Solo describe interfaces existentes. No modifica permisos ni datos. */
(() => {
  'use strict';
  const steps = [];
  function section(page, group, rows) {
    for (const [selector, title, description] of rows) {
      steps.push({page, group, selector, title, description});
    }
  }

  const welcome = role => [
    {page: null, group:'Bienvenida', selector:'.mj-side-tab',
     title:'Bienvenido a Misión Jardines',
     description:'Este recorrido explica tu herramienta según tu rol. Avanza con Siguiente y Atrás; para tu seguridad, la guía no pulsa botones ni envía formularios. Puedes salir y volver a abrirla desde el botón Ayuda / Tour.'},
    {page: null, group:'Navegación', selector:'.mj-shared-sidebar .mj-side-nav',
     title:'Así se organiza el portal',
     description:'Este es el menú de módulos disponibles para tu rol. En celular abre el menú con la pestaña amarilla. Las opciones de otros roles no se muestran ni pueden utilizarse.'}
  ];

  function payments(role) {
    const admin = role === 'ADMINISTRADOR' || role === 'SUPER_ADMIN';
    section('pagos.html','Pagos',[
      ['#paymentStatusCards', 'Resumen de tu situación',
       'Revisa aquí los indicadores relacionados con cuotas y pagos. Los datos se consultan en el sistema; si una transacción sigue en revisión, todavía no debe contarse como validada.'],
      ['#bankClabe', 'Cuenta bancaria autorizada',
       'Usa los datos bancarios oficiales mostrados aquí para hacer la transferencia. Verifica el destino y el concepto antes de pagar; no deposites a cuentas compartidas por terceros.'],
      ['#maintenanceRateText', 'Cuotas y recargos',
       'La cuota de mantenimiento base es de $300. El sistema calcula los recargos aplicables por cortes vencidos y muestra el importe vigente. Revisa el desglose de tu vivienda antes de realizar el depósito.'],
      ['#extraCard', 'Aportaciones extraordinarias',
       'Los proyectos extraordinarios permiten abonos flexibles de distintos importes, sin obligación de una periodicidad fija. Cada abono se acumula hacia la meta individual de la vivienda; no equivale a mantenimiento.'],
      ['#clubPaymentCard', 'Pagos de Casa Club',
       'Si tienes una reservación de Casa Club pendiente de pago, puede aparecer aquí. El pago corresponde a una fecha concreta y se comprueba de manera independiente del mantenimiento.'],
      ['#paymentTitle', 'Selecciona el tipo de comprobante',
       'Identifica si reportarás mantenimiento, una cuota extraordinaria o Casa Club. Cada concepto se valida y contabiliza por separado: no cambies el tipo para aplicar un pago a otro servicio.'],
      ['#proofInput', 'Sube tu comprobante real',
       'Selecciona una fotografía, captura o PDF legible. El sistema extrae automáticamente referencia, monto, fecha y hora; revisa que el comprobante corresponda al depósito realizado.'],
      ['#destinationCheck', 'Confirma el destinatario',
       'Esta validación ayuda a comprobar que el dinero fue enviado a la cuenta oficial. No sirve una captura de una cuenta o beneficiario distinto.'],
      ['#operationFolio', 'Referencia y lectura OCR',
       'La clave de rastreo, folio o referencia permite relacionar el comprobante con la notificación bancaria. Si hay un error o faltan datos, revisa el archivo antes de enviar.'],
      ['#paymentPreview', 'Importe y mensualidades',
       'Comprueba el desglose de lo que cubre el depósito. Los pagos anticipados, los saldos pendientes y los recargos se calculan de acuerdo con la vivienda y el concepto.'],
      ['#paymentAllocation', 'Repartir un pago entre viviendas',
       'Si tu cuenta permite administrar más de una vivienda, puede habilitarse la distribución. La suma asignada debe coincidir exactamente con el depósito; no es un segundo pago.'],
      ['#submitPayment', 'Enviar a validación bancaria',
       'Una captura no acredita por sí sola el pago. Después del envío puede quedar En revisión hasta que exista coincidencia bancaria; si falla, consulta el motivo y corrige el comprobante. Evita reenviar la misma transferencia.'],
      ['#receiptList', 'Historial y recibos',
       'Consulta el estado de tus reportes y los recibos disponibles. VALIDADO significa conciliado; En revisión aún espera verificación y Fallido indica que no pasó los controles.'],
    ]);
    if (admin) section('pagos.html','Pagos · Administración',[
      ['#adminPayments', 'Seguimiento administrativo',
       'Administración consulta aquí comprobantes por revisar y su historial. La verificación del depósito es automática cuando coincide con la notificación bancaria; el listado no representa autorización para aprobar pagos sin comprobación.'],
      ['#pendingPayments', 'Comprobantes pendientes',
       'Filtra y revisa los reportes con estado pendiente. Puedes consultar el detalle, los datos bancarios y el resultado de validación sin modificar la transacción durante el tour.'],
      ['#adminPaymentHistory', 'Historial por período',
       'Selecciona las fechas y consulta movimientos, incluyendo abonos y recargos. Es importante distinguir fecha de depósito, concepto y resultado de conciliación para evitar duplicados.']
    ]);
  }

  function club(role) {
    const admin = ['ADMINISTRADOR','SUPER_ADMIN'].includes(role);
    section('casa-club.html','Casa Club',[
      ['#clubAvailabilityCard .section-header', 'Calendario y disponibilidad',
       'Verde es disponible, amarillo indica en revisión o apartado, rojo es reservado y gris significa no disponible o fecha pasada. Las fechas ocupadas no se pueden elegir.'],
      ['#calendarDays', 'Cómo elegir el día',
       'Toca una fecha verde habilitada. La selección no confirma el evento. En teléfono se abre una ventana para completar y guardar la solicitud antes del envío definitivo.'],
      ['#clubReservationCard', 'Datos de la reservación',
       'La fecha, la vivienda, nombre, teléfono, correo, relación con la vivienda y motivo deben ser correctos. Una cuenta de residente usa su vivienda asociada; el enlace público requiere capturarla.'],
      ['#clubRegulationsAcceptance', 'Leer y aceptar el reglamento',
       'Es obligatorio abrir, leer hasta el final y aceptar el reglamento. Sin aceptación no se puede enviar la solicitud. La guía no sustituye ese paso.'],
      ['#clubInstructionsOpen', 'Consulta monto y cuenta oficiales',
       'Después de apartar tu fecha y obtener el folio, utiliza exclusivamente la cuenta y concepto indicados. No transfieras antes de disponer de las instrucciones de esa reservación.'],
      ['#clubSubmit', 'Envía la solicitud',
       'La solicitud registra la fecha elegida y se valida que la vivienda pueda reservar. Un apartado pendiente no equivale a un pago confirmado. En móvil se usa el botón de envío del calendario tras guardar los datos.'],
      ['#clubCalendarHint', 'Qué recibirás por correo',
       'En tu correo llegará el folio, fecha, vivienda, monto, cuenta, fecha límite y un enlace privado para subir el comprobante. Si no llega, revisa spam y contacta a Administración.'],
      ['#clubProofIntro', 'Sube el comprobante por enlace privado',
       'El enlace recibido por correo identifica tu reservación concreta. Ahí podrás adjuntar imagen o PDF, consultar el estado y, cuando esté habilitado, obtener el recibo; no compartas ese acceso.'],
      ['#clubAvailabilityCard .legend', 'Restricciones para reservar',
       'No se aceptan fechas ocupadas, deshabilitadas o vencidas. El solicitante debe estar al corriente de mantenimiento, cumplir el reglamento y no tener una restricción vigente por tarjetas rojas.'],
    ]);
    if (admin) section('casa-club.html','Casa Club · Administración',[
      ['[data-tab="administracion"]', 'Administración de reservaciones',
       'Desde esta pestaña revisas fecha, vivienda, solicitante, pagos, observaciones y estados. Las reservas históricas de Google pueden aparecer solo para consulta; no deben tratarse como pagos nuevos.'],
      ['[data-tab="aprobacion"]', 'Aprobación y conciliación',
       'Administración puede aprobar una fecha sin registrar dinero o verificar manualmente un depósito con folio válido cuando corresponda. No marques Pagado sin evidencia bancaria.'],
      ['[data-tab="tarjetas"]', 'Tarjetas rojas',
       'Aquí se gestionan restricciones relacionadas con el reglamento de Casa Club. Una cuarta tarjeta roja activa puede impedir que una vivienda reserve durante el período correspondiente.'],
      ['#clubTabs', 'Fechas, pagos y cancelaciones',
       'Cancelar o liberar una fecha es distinto de devolver dinero. Consulta los detalles antes de decidir: los pagos y comprobantes históricos no se eliminan por cancelar un evento.']
    ]);
    else section('casa-club.html','Casa Club · Residente',[
      ['[data-tab="mis-reservas"]', 'Tus reservaciones',
       'Consulta aquí tus solicitudes, el estado de la fecha y las acciones permitidas. Una reservación pendiente puede requerir pago o aprobación, y un comprobante en revisión no se debe subir de nuevo.'],
      ['#clubTabs', 'Cómo consultar el seguimiento',
       'Además de Mis reservas en el portal, el correo de la solicitud incluye un acceso privado para consultar únicamente las reservaciones asociadas a ese correo.']
    ]);
  }

  function admin() {
    section('index.html','Inicio',[
      ['.hl-welcome', 'Panel principal',
       'En Inicio tienes una visión general de la comunidad y sus noticias. Utiliza el menú para pasar a cuotas, pagos, residentes y control de acceso.']
    ]);
    section('analisis-cuotas.html','Análisis de cuotas',[
      ['#financialSummary', 'Resumen financiero del período',
       'Los indicadores resumen el período elegido: casas con pago, pendientes y montos. Elige año y mes para evitar mezclar meses distintos. Las cifras cambian al registrar o conciliar movimientos.'],
      ['#financeYear', 'Año y mes de consulta',
       'Selecciona el año y mes que deseas analizar y utiliza Actualizar análisis cuando sea necesario. Los pagos anticipados deben atribuirse a las mensualidades que cubren.'],
      ['#financeTabMaintenance', 'Pestaña Mantenimiento',
       'Esta vista muestra cuánto ha pagado cada vivienda, su último mes cubierto, saldo pendiente, estado y TAGs. Un abono con adeudo conserva obligaciones pendientes aunque exista un movimiento registrado.'],
      ['#financeSearch', 'Buscar una vivienda',
       'Busca por calle, número o nombre. Puedes combinar calle, estado, fecha y ordenamiento para localizar casas morosas o con pagos recientes.'],
      ['#financeStatus', 'Interpretar los estados',
       'Pagado y Pendiente no significan lo mismo que Abono con adeudo. Revisa si se cubrió el mes consultado, cuánto se abonó, la deuda restante y el historial, antes de reportar una casa como corriente.'],
      ['#financeHouseRows', 'Tabla de cuotas por vivienda',
       'Consulta la vivienda, estado, importe pagado, último mes, saldo y TAGs. Desde las acciones disponibles puedes abrir historial, registrar pagos autorizados o revisar comprobantes.'],
      ['#financeTabExtra', 'Pestaña Cuotas extraordinarias',
       'Cambia a Cuotas extraordinarias y selecciona un proyecto. Los residentes pueden abonar semanal, mensual u ocasionalmente hasta su meta por casa; el aporte no debe confundirse con mantenimiento.'],
      ['#financeTabClub', 'Pestaña Casa Club',
       'Esta pestaña reúne los movimientos de Casa Club de forma separada. Sus importes y su validación bancaria no se suman a cuotas de mantenimiento ni afectan los TAGs.'],
      ['#financeIncomeCard', 'Gráfica de ingresos',
       'Observa cuánto se recaudó y cómo se distribuye por calle o período. En celular puedes deslizar las gráficas horizontalmente.'],
      ['#financeBalanceCard', 'Saldo a favor o en contra',
       'La diferencia es ingresos menos egresos del período. Una cifra positiva refleja saldo a favor y una negativa saldo en contra; revisa que ambos usen el mismo período y concepto.'],
      ['#financeExpenseCard', 'Gráfica de egresos',
       'Consulta los gastos registrados y su desglose para identificar en qué se utilizaron los recursos. No confundas el flujo de egresos con adeudos de viviendas.'],
      ['#financeExpensesSection', 'Registrar y consultar egresos',
       'Los gastos se documentan con fecha, categoría, concepto e importe. Filtra el historial antes de generar conclusiones financieras o corregir un movimiento.'],
      ['#financeManualReceiptOpen', 'Recibos manuales',
       'Puedes emitir un recibo manual indicando vivienda, fecha, folio, concepto, importe, sello y notas. Úsalo solo para operaciones respaldadas y verifica los datos antes de descargar el PDF.'],
      ['#financeDownloadAllReceipts', 'Recibos y respaldos',
       'Aquí están la descarga de comprobantes/recibos y las opciones de Google Drive. Conserva un respaldo antes de hacer cambios importantes. Los formatos monetarios se muestran sin centavos.']
    ]);
    payments('ADMINISTRADOR');
    club('ADMINISTRADOR');
    section('bases_datos.html','Residentes',[
      ['#filterText', 'Buscar residentes y contactos',
       'Filtra por nombre, calle, número o contacto para localizar rápidamente la vivienda. Comprueba que estás editando la casa correcta antes de guardar un teléfono o correo.'],
      ['#residentsTable', 'Padrón de viviendas',
       'Consulta y actualiza la información de residentes, inquilinos y contactos cuando corresponda. Los cambios al padrón no deben confundirse con pagos o permisos de TAGs.']
    ]);
    section('verificacion-cuentas.html','Verificación de cuentas',[
      ['#requestList', 'Aprobar accesos con cuidado',
       'Revisa identidad, vivienda y rol antes de aprobar una cuenta. Una asociación incorrecta podría dar acceso a información de otra vivienda.']
    ]);
    section('zkteco.html','Control de acceso',[
      ['#accessTabTags', 'TAGs vehiculares',
       'Consulta los TAGs por vivienda o número, su vigencia y estado. Bloquear, activar o modificar un TAG puede afectar físicamente el acceso y requiere autorización.'],
      ['#accessTabRemotes', 'Controles remotos',
       'La pestaña Controles lleva un inventario separado por vivienda: asignación, vigencia y bloqueo administrativo. No equivale a operar directamente el receptor físico.'],
      ['#diagnoseConnection', 'Diagnóstico y sincronización',
       'Antes de cambios masivos revisa conexión, diagnósticos y registros. Sincronizar o actualizar acceso tiene efectos reales y debe ejecutarse fuera del tour.']
    ]);
    section('seguridad.html','Operación de caseta',[
      ['#gateScene', 'Estado de la pluma',
       'La interfaz permite observar y operar la pluma cuando hay conexión y autorización. Nunca utilices Abrir o Cerrar durante una explicación o prueba sin coordinación con caseta.'],
      ['#seguridadCuotasPanel', 'Cuotas visibles para operación',
       'El personal autorizado puede consultar el estado por vivienda para orientar el acceso según las políticas vigentes; no debe registrar cobros aquí.']
    ]);
    section('visitas.html','Visitas',[
      ['#visitHouseGrid', 'Viviendas y visitas',
       'Selecciona una vivienda para consultar o registrar una visita autorizada. Revisa la fecha, tipo de visitante y persona que autorizó.'],
      ['#visitTable', 'Bitácora de visitas',
       'El historial conserva los movimientos para consultar entradas y salidas. Antes de cambiar el estado de una visita confirma identidad y autorización.']
    ]);
    section('conmutador.html','Conmutador',[
      ['#streetTabs', 'Selecciona calle',
       'Filtra la calle y luego la vivienda; el conmutador busca proteger los datos personales y no expone nombres ni teléfonos directamente.'],
      ['#showHistory', 'Historial de intentos',
       'Consulta la vivienda y el momento del intento de llamada. El registro no garantiza que se haya completado una comunicación.']
    ]);
    section('anuncios.html','Comunidad',[
      ['#boardGrid', 'Avisos y anuncios',
       'Consulta los comunicados vigentes. Publica o modifica anuncios solo si tu rol y las políticas de la comunidad lo permiten.']
    ]);
    section('calendario.html','Comunidad',[
      ['#calendarGrid', 'Calendario comunitario',
       'Consulta eventos y fechas relevantes del fraccionamiento y los próximos compromisos comunitarios.']
    ]);
  }

  function resident() {
    payments('CONDOMINO');
    club('CONDOMINO');
  }

  function security() {
    section('conmutador.html','Conmutador',[
      ['#streetTabs', 'Selecciona la calle',
       'En la caseta comienza por la calle correcta. Después elige la vivienda a la que necesitas comunicarte; no uses números personales guardados por fuera del sistema.'],
      ['#houseGrid', 'Selecciona la casa',
       'Cada botón corresponde a una vivienda. El conmutador no muestra nombres ni teléfonos; antes de intentar llamar confirma calle y número.'],
      ['#showHistory', 'Historial de llamadas',
       'Usa Historial de llamadas para revisar fecha, hora y vivienda de cada intento. No debe considerarse confirmación de que el residente contestó.'],
      ['#callStatus', 'Estado de la comunicación',
       'Consulta aquí los mensajes de la conexión. En dispositivos iPhone el marcador puede solicitar confirmación; el teléfono conserva sus propias limitaciones.']
    ]);
    section('visitas.html','Visitas',[
      ['#visitTabHomes', 'Elegir vivienda para visita',
       'Selecciona la calle y casa correctas antes de registrar una entrada. Identifica si es visitante, proveedor u otro tipo de acceso y quién autoriza.'],
      ['#visitHouseGrid', 'Panel por vivienda',
       'Puedes localizar la vivienda desde la cuadrícula. No registres entradas para una casa distinta por similitud de nombres o números.'],
      ['#newVisitButton', 'Nueva visita',
       'Este botón abre el formulario. Registra nombre, fecha y hora, tipo y datos de identificación necesarios. El tour no abre ni guarda ese formulario.'],
      ['#visitTable', 'Historial de visitas',
       'Consulta entradas, salidas, autorizaciones y filtros de la bitácora. Verifica el registro previo antes de crear una visita duplicada.'],
      ['#filterStatus', 'Filtros por estado',
       'Usa calle, casa, tipo y estado para encontrar rápidamente una visita. Antes de marcar entrada o salida confirma que es la persona autorizada.']
    ]);
    section('seguridad.html','Seguridad',[
      ['#metricInside', 'Resumen de operaciones',
       'Las tarjetas muestran conteos de residentes o visitantes dentro, movimientos del día y otros indicadores de caseta. Consúltalas para entender la actividad actual.'],
      ['#seguridadCuotasPanel', 'Estado de cuotas por vivienda',
       'Busca por calle y número para revisar el estado de mantenimiento y restricciones relacionadas con el acceso. Este panel es de consulta operativa, no para registrar dinero.'],
      ['#segCuotasCalle', 'Filtros de cuotas',
       'Filtra por calle, casa y estado para detectar una vivienda específica. Confirma siempre la dirección antes de comunicar un adeudo o aplicar un criterio de acceso.'],
      ['#gateScene', 'Control de pluma',
       'El panel muestra el estado de la pluma. Abrir y Cerrar producen acciones físicas cuando están habilitados; utilízalos solo después de confirmar autorización y que el paso está despejado.'],
      ['#accessForm', 'Bitácora de accesos',
       'Cuando corresponda registra quién ingresa, a quién visita, motivo y datos disponibles. Evita duplicar movimientos o revelar información personal de terceros.'],
      ['#accessTable', 'Historial de entradas y salidas',
       'Consulta y filtra la bitácora para localizar un evento. Las acciones sobre filas pueden registrar una salida o modificar un movimiento real; aquí solo te las explicamos.'],
      ['#incidentList', 'Incidencias',
       'Los incidentes se documentan con ubicación, descripción, prioridad y momento del hecho. Registra datos claros y verifica si ya existe un reporte para evitar duplicados.']
    ]);
  }

  window.MJPortalTourContent = {
    getSteps(role) {
      steps.length = 0;
      steps.push(...welcome(role));
      if (['SUPER_ADMIN', 'ADMINISTRADOR'].includes(role)) admin();
      else if (role === 'CONDOMINO') resident();
      else if (role === 'SEGURIDAD') security();
      return steps.slice();
    }
  };
})();
