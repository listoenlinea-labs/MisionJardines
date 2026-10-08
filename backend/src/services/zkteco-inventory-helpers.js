// Nombres físicos de campos reportados por diferentes configuraciones
// DATA_TABLE del C3. No equiparar autorización con presencia física.
function campo(fila, ...nombres) {
  if (!fila || typeof fila !== 'object') return null;
  const byKey = new Map(Object.entries(fila).map(([key, value]) =>
    [key.toLowerCase().replace(/[^a-z0-9]/g, ''), value]));
  for (const name of nombres) {
    const value = byKey.get(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (value !== undefined && value !== null && String(value).trim() !== '')
      return value;
  }
  return null;
}
function claveTarjeta(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D+/g, '');
  return digits ? digits.replace(/^0+(?=\d)/, '') : raw.toLowerCase();
}
const tarjetaFila = row => campo(row, 'CardNo','CardNumber','CardNum');
const pinFila = row => campo(row, 'Pin');
const uidFila = row => campo(row, 'UID');
const puertasFila = row => campo(row,'AuthorizeDoorId');
const zonaFila = row => campo(row,'AuthorizeTimezoneId');
const nombreFila = row => campo(row,'Name');
const inicioFila = row => campo(row,'StartTime');
const finalFila = row => campo(row,'EndTime');
const grupoFila = row => campo(row,'Group');

function diagnosticoInventario(filas, tarjetasLocales=[]) {
  if (!Array.isArray(filas)) throw new Error('El C3 no devolvió una lista de usuarios válida');
  const tarjetas = filas.map(tarjetaFila).map(claveTarjeta).filter(x=>x && x !== '0');
  const local = tarjetasLocales.filter(t=>Boolean(t.enControlador));
  const found = new Set(tarjetas);
  const missingPreviously = local.filter(t=>!found.has(claveTarjeta(t.numeroTarjeta)));
  const fields = [...new Set(filas.flatMap(row=>Object.keys(row || {})))];
  const incomplete = (filas.length > 0 && tarjetas.length === 0) ||
    (filas.length === 0 && local.length > 0);
  return {
    ok: !incomplete,
    panelRows:filas.length,cardRows:tarjetas.length,
    present:found,
    missingPreviously:missingPreviously.length,
    previouslyConfirmed:local.length,fields,
    message:incomplete?'La lectura no devolvió tarjetas identificables; se conservan los estados locales.':null
  };
}
module.exports={campo,claveTarjeta,tarjetaFila,pinFila,uidFila,puertasFila,zonaFila,
  nombreFila,inicioFila,finalFila,grupoFila,diagnosticoInventario};
