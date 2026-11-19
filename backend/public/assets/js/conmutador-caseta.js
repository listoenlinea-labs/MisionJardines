window.crearConmutadorCaseta = function ({ api, mostrarEstado }) {
  let activa = false;
  async function consultar(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      return await api(path, { ...options, signal: controller.signal });
    } catch (error) {
      if (error.name === 'AbortError') throw Error('La central tardó en responder. Puedes volver a intentar.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async modo() {
      return (await consultar('/conmutador/caseta/modo')).habilitado;
    },
    async contactos(domicilio) {
      if (activa) throw Error('Espera a que se envíe la solicitud actual.');
      const params = new URLSearchParams(domicilio);
      return (await consultar('/conmutador/caseta/contactos?' + params)).contactos;
    },
    async llamar(domicilio, contacto) {
      if (activa) return;
      activa = true;
      try {
        mostrarEstado('Enviando solicitud a caseta…');
        const { solicitud } = await consultar('/conmutador/caseta/llamadas', {
          method: 'POST',
          body: JSON.stringify({ ...domicilio, contacto })
        });
        const limite = Date.now() + 10000;
        while (Date.now() < limite) {
          const { estado } = await consultar('/conmutador/caseta/llamadas/' + solicitud);
          if (estado === 'FINALIZADA') {
            mostrarEstado('El intento terminó. Puedes volver a marcar.');
            return;
          }
          if (estado === 'ENVIADA') {
            mostrarEstado('Solicitud enviada. Contesta el teléfono fijo de caseta cuando timbre.', 'ok');
            return;
          }
          if (estado === 'ERROR') throw Error('La central no pudo preparar la llamada.');
          if (estado === 'VENCIDA') break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        throw Error('La central aún no confirma el envío. Si timbra caseta, contesta el teléfono; también puedes volver a intentar.');
      } catch (error) {
        mostrarEstado(error.message, 'error');
      } finally {
        activa = false;
      }
    }
  };
};
