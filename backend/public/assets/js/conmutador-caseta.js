window.crearConmutadorCaseta = function ({ api, mostrarEstado }) {
  let activa = false;
  return {
    async modo() {
      return (await api('/conmutador/caseta/modo')).habilitado;
    },
    async contactos(domicilio) {
      if (activa) throw Error('Espera a que se envíe la solicitud actual.');
      const params = new URLSearchParams(domicilio);
      return (await api('/conmutador/caseta/contactos?' + params)).contactos;
    },
    async llamar(domicilio, contacto) {
      if (activa) return;
      activa = true;
      try {
        mostrarEstado('Enviando solicitud a caseta…');
        const { solicitud } = await api('/conmutador/caseta/llamadas', {
          method: 'POST',
          body: JSON.stringify({ ...domicilio, contacto })
        });
        const limite = Date.now() + 32000;
        while (Date.now() < limite) {
          const { estado } = await api('/conmutador/caseta/llamadas/' + solicitud);
          if (estado === 'ENVIADA') {
            mostrarEstado('Solicitud enviada. Contesta el teléfono fijo de caseta cuando timbre.', 'ok');
            return;
          }
          if (estado === 'ERROR') throw Error('La central no pudo preparar la llamada.');
          if (estado === 'VENCIDA') break;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        throw Error('La central no confirmó la solicitud a tiempo.');
      } catch (error) {
        mostrarEstado(error.message, 'error');
      } finally {
        activa = false;
      }
    }
  };
};
