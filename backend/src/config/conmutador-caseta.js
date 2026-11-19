function casetaHabilitada() {
  return process.env.CONMUTADOR_CASETA_HABILITADO === 'true';
}

module.exports = { casetaHabilitada };
