// Cliente de caseta: la orden de MySQL tiene una vigencia de 30 segundos.
// El navegador no debe declarar un fallo a los 10 s si el agente va más lento.
// No reenvía llamadas automáticamente cuando una confirmación es incierta.
window.crearConmutadorCaseta = function ({ api, mostrarEstado }) {
  var activa = false;
  var ESPERA_CONFIRMACION_MS = 38000;
  var INTERVALO_MS = 1800;

  function pausa(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
  }

  async function consultar(path, options, tiempoMs) {
    options = options || {};
    tiempoMs = tiempoMs || 12000;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timeout;
    var timeoutError = new Error('La conexión con Hostinger tardó demasiado.');
    timeoutError.codigo = 'TIMEOUT_RED';
    var vencido = false;
    var timer = new Promise(function(_resolve, reject) {
      timeout = setTimeout(function() {
        vencido = true;
        if (controller) controller.abort();
        reject(timeoutError);
      }, tiempoMs);
    });
    try {
      var config = Object.assign({}, options);
      if (controller) config.signal = controller.signal;
      return await Promise.race([api(path, config), timer]);
    } catch (error) {
      if (vencido || (error && error.name === 'AbortError')) throw timeoutError;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function caducidadUltimoEstado(estado) {
    if (estado === 'PENDIENTE') {
      return 'La solicitud llegó al servidor, pero la computadora de caseta no la recogió antes de vencer (30 segundos). Comprueba que el agente de caseta siga encendido y conectado.';
    }
    if (estado === 'RECLAMADA') {
      return 'La computadora de caseta recibió la solicitud, pero no confirmó que se enviara la llamada antes de vencer. Revisa el agente de caseta y Asterisk.';
    }
    return 'La caseta no confirmó el envío dentro de los 30 segundos. Si el teléfono de caseta está sonando, contéstalo; no envíes otra solicitud mientras siga sonando.';
  }

  function esTemporal(error) {
    if (error && error.codigo === 'TIMEOUT_RED') return true;
    // Errores de red (sin HTTP), frecuentes al cambiar de WiFi/datos móviles.
    return error && error.name === 'TypeError';
  }

  return {
    async modo() {
      return (await consultar('/conmutador/caseta/modo')).habilitado;
    },
    async contactos(domicilio) {
      if (activa) throw Error('Hay una llamada en curso. Espera su confirmación.');
      var params = new URLSearchParams(domicilio);
      return (await consultar('/conmutador/caseta/contactos?' + params.toString())).contactos;
    },
    async llamar(domicilio, contacto) {
      if (activa) {
        mostrarEstado('Ya hay una solicitud en curso. Evita duplicar la llamada.', 'error');
        return { ok: false, codigo: 'EN_CURSO' };
      }
      activa = true;
      var solicitud = null;
      var ultimoEstado = null;
      var ultimoErrorRed = null;
      try {
        mostrarEstado('Llamando… Enviando solicitud a caseta.', 'loading');
        try {
          var respuesta = await consultar('/conmutador/caseta/llamadas', {
            method: 'POST',
            body: JSON.stringify(Object.assign({}, domicilio, { contacto: contacto }))
          }, 15000);
          solicitud = respuesta.solicitud;
        } catch (error) {
          if (esTemporal(error)) {
            throw Error('El iPhone perdió la confirmación de Hostinger al enviar la solicitud. Podría estar en curso. Si timbra caseta, contesta; no vuelvas a marcar mientras suene. Revisa la conexión del iPhone.');
          }
          throw error;
        }
        if (typeof solicitud !== 'string' || !/^[a-f0-9-]{36}$/i.test(solicitud)) {
          throw Error('Hostinger recibió la petición, pero no devolvió un identificador de llamada válido.');
        }
        mostrarEstado('Llamando… Solicitud recibida; esperando a la computadora de caseta.', 'loading');

        var limite = Date.now() + ESPERA_CONFIRMACION_MS;
        while (Date.now() < limite) {
          try {
            var estado = (await consultar('/conmutador/caseta/llamadas/' + solicitud, {}, 10000)).estado;
            var ultimoEstadoAnterior = ultimoEstado;
            ultimoEstado = estado;
            ultimoErrorRed = null;
            if (estado === 'ENVIADA') {
              mostrarEstado('Llamada enviada a caseta. Contesta el teléfono fijo cuando timbre.', 'ok');
              return { ok: true, estado: estado };
            }
            if (estado === 'FINALIZADA') {
              mostrarEstado('La solicitud terminó en caseta. Puedes iniciar otra llamada.', 'ok');
              return { ok: true, estado: estado };
            }
            if (estado === 'ERROR') throw Error('El agente de caseta reportó un error al preparar la llamada en Asterisk. Revisa los registros del agente en la computadora.');
            if (estado === 'VENCIDA') throw Error(caducidadUltimoEstado(ultimoEstadoAnterior || 'PENDIENTE'));
            if (estado !== 'PENDIENTE' && estado !== 'RECLAMADA') {
              throw Error('Hostinger devolvió un estado de llamada no reconocido: ' + String(estado));
            }
            mostrarEstado(estado === 'RECLAMADA'
              ? 'Llamando… La computadora de caseta recibió la solicitud; preparando el envío.'
              : 'Llamando… Hostinger recibió la solicitud; esperando al agente de caseta.', 'loading');
          } catch (error) {
            if (!esTemporal(error)) throw error;
            ultimoErrorRed = error;
            mostrarEstado('Llamando… El iPhone perdió temporalmente la respuesta. Intentando recuperar la confirmación, sin repetir la llamada.', 'loading');
          }
          if (Date.now() < limite) await pausa(INTERVALO_MS);
        }
        if (ultimoErrorRed) {
          throw Error('El iPhone no pudo consultar el resultado por una falla de red. La solicitud podría haber sonado en caseta. Contesta si timbra y verifica antes de intentar otra vez.');
        }
        throw Error(caducidadUltimoEstado(ultimoEstado));
      } catch (error) {
        mostrarEstado(error.message || 'No fue posible verificar el intento de llamada.', 'error');
        return { ok: false, error: error.message || 'Error de llamada' };
      } finally {
        activa = false;
      }
    }
  };
};
