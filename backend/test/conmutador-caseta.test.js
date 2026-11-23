const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

Object.assign(process.env, {
  DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: 'caseta_test',
  DB_USER: 'test', DB_PASSWORD: 'unused', JWT_SECRET: 'jwt-test',
  CONMUTADOR_CASETA_HABILITADO: 'true', CONMUTADOR_CASETA_TOKEN: 'agent-test-credential-for-unit-tests'
});
const db = require('../src/config/database');
const { Casa, Usuario, UsuarioCasa } = require('../src/models');
const app = express();
app.use(express.json());
app.use('/api/conmutador/caseta', require('../src/routes/conmutador-caseta.routes'));
app.use('/api/busqueda', require('../src/routes/busqueda.routes'));

test('Seguridad solicita por vivienda y solo el agente autenticado recibe el número', async t => {
  const destino = '5550000100';
  let fila = null;
  let historial;
  const seguimiento = new Map();
  let override = null;
  let storedOwner = null;
  const linkedCasa = {id:42,calle:'Rosas',calleCorrecta:'Rosas',numero:'12',telefono:null,
    async update(data,options){assert.deepEqual(options.fields,['telefono']);this.telefono=data.telefono;return this;}};
  t.mock.method(Usuario, 'findByPk', async id => ({
    id, estatus: 'ACTIVO', rol: { nombre: id === 3 ? 'CONDOMINO' : id === 4 ? 'ADMINISTRADOR' : id === 5 ? 'SUPER_ADMIN' : 'SEGURIDAD', activo: true }
  }));
  t.mock.method(UsuarioCasa, 'findOne', async () => null);
  t.mock.method(Casa, 'findAll', async opciones => {
    if(opciones.attributes?.includes('telefono')) return [linkedCasa];
    if(opciones.attributes?.includes('nombre')) return [{calle:'Rosas',calleCorrecta:'Rosas',numero:'12',nombre:'Jorge Hermosillo'}];
    assert.deepEqual(opciones.include, []);
    return [];
  });
  t.mock.method(db, 'transaction', async run => run({}));
  t.mock.method(db, 'query', async (sql, opciones = {}) => {
    const campos = opciones.replacements || {};
    if(sql.includes('SELECT grupo, numero, propietario FROM conmutador_contactos_propietarios'))
      return storedOwner === null ? [] : [{grupo:'Rosas',numero:'12',propietario:storedOwner}];
    if(sql.includes('INSERT INTO conmutador_contactos_propietarios')){
      storedOwner = campos.propietario;return [];
    }
    if (sql.includes('FROM conmutador_contactos_administrados')) return override ?
      [{ telefono_a: override[0], telefono_b: override[1] }] : [];
    if (sql.includes('INSERT INTO conmutador_contactos_administrados')) {
      override = [campos.a, campos.b]; return [];
    }
    if (sql.includes('SHOW COLUMNS')) return ['telefono', 'calle', 'numero'].map(Field => ({ Field }));
    if (sql.includes('condominos_importacion')) return [{ telefono: '+52' + destino }];
    if (sql.includes('CREATE TABLE')) return [];
    if (sql.includes('INSERT INTO conmutador_intentos_llamada')) {
      historial = campos;
      return [];
    }
    if (sql.includes('INSERT INTO conmutador_llamadas_seguimiento')) {
      seguimiento.set(campos.solicitud, {
        usuarioId:campos.usuarioId,grupo:campos.grupo,
        numero:campos.numero,estado:'PENDIENTE',confirmado:false
      });
      return [];
    }
    if (sql.includes('UPDATE conmutador_llamadas_seguimiento')) {
      const entry=seguimiento.get(campos.solicitud);
      if(entry&&['PENDIENTE','ENVIADA'].includes(entry.estado)){
        entry.estado=campos.estado;
        if(['ENVIADA','FINALIZADA'].includes(campos.estado))entry.confirmado=true;
      }
      return [undefined,entry?1:0];
    }
    if (sql.includes("SET solicitud = ")) {
      if (fila && !['FINALIZADA', 'ERROR'].includes(fila.estado)) return [undefined, 0];
      fila = { ...campos, estado: 'PENDIENTE' };
      return [undefined, 1];
    }
    if (sql.includes("SET estado = 'RECLAMADA'")) {
      if (fila.estado !== 'PENDIENTE') return [undefined, 0];
      Object.assign(fila, { estado: 'RECLAMADA', reclamo: campos.reclamo });
      return [undefined, 1];
    }
    if (sql.includes('TIMESTAMPDIFF')) {
      const { solicitud, destino, reclamo } = fila;
      return [{ solicitud, destino, reclamo, vigencia_ms: 20000 }];
    }
    if (sql.includes('SET destino = NULL')) {
      fila.destino = null;
      return [undefined, 1];
    }
    if (sql.includes('SET estado = :estado')) {
      if (campos.solicitud !== fila.solicitud || campos.reclamo !== fila.reclamo) return [undefined, 0];
      if (campos.estado === 'FINALIZADA') assert.match(sql, /THEN UTC_TIMESTAMP/);
      fila.estado = campos.estado;
      return [undefined, 1];
    }
    if (sql.includes('SELECT CASE')) return fila.usuarioId === campos.usuarioId ? [{ estado: fila.estado }] : [];
    assert.fail('Consulta inesperada: ' + sql);
  });
  const servidor = app.listen(0);
  await new Promise(resolve => servidor.once('listening', resolve));
  t.after(() => new Promise(resolve => servidor.close(resolve)));

  const jwtPara = usuarioId => jwt.sign({ usuarioId }, process.env.JWT_SECRET);
  const guardia = jwtPara(1);
  const agente = process.env.CONMUTADOR_CASETA_TOKEN;
  const base = '/api/conmutador/caseta';
  async function llamar(ruta, token, datos) {
    const respuesta = await fetch('http://127.0.0.1:' + servidor.address().port + ruta, {
      method: datos ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: datos ? JSON.stringify(datos) : undefined
    });
    const json = respuesta.headers.get('content-type')?.includes('application/json')
      ? await respuesta.json() : null;
    return { codigo: respuesta.status, json };
  }

  const direccion = { grupo: 'Rosas', numero: '12' };
  const contacto = await llamar(base + '/contactos?grupo=Rosas&numero=12', guardia);
  assert.deepEqual(contacto.json, { ok: true, contactos: ['A'] });
  assert.equal((await llamar(base + '/contactos?grupo=Rosas&numero=12', jwtPara(3))).codigo, 403);
  assert.equal((await llamar('/api/busqueda/conmutador/telefono?grupo=Rosas&numero=12', guardia)).codigo, 403);
  assert.equal((await llamar('/api/busqueda/conmutador?calle=Rosas&numero=12', guardia)).codigo, 200);
  const creada = await llamar(base + '/llamadas', guardia, { ...direccion, contacto: 'A' });
  assert.equal(creada.codigo, 202);
  assert.deepEqual(Object.keys(creada.json), ['ok', 'solicitud']);
  assert.deepEqual(historial, { usuarioId: 1, ...direccion });
  assert.deepEqual(seguimiento.get(creada.json.solicitud), {
    usuarioId:1,...direccion,estado:'PENDIENTE',confirmado:false
  },'aceptar solicitud no confirma la llamada');
  assert.equal((await llamar(base + '/llamadas', guardia, { ...direccion, contacto: 'A' })).codigo, 409);
  assert.equal((await llamar(base + '/agente/siguiente', guardia, {})).codigo, 401);
  const orden = await llamar(base + '/agente/siguiente', agente, {});
  assert.equal(orden.json.destino, destino);
  assert.equal(fila.destino, null);
  assert.equal((await llamar(base + '/agente/siguiente', agente, {})).codigo, 204);
  const { solicitud, reclamo } = orden.json;
  assert.equal((await llamar(base + '/agente/resultado', agente, { solicitud, reclamo, estado: 'ENVIADA' })).codigo, 204);
  assert.equal(seguimiento.get(solicitud).estado,'ENVIADA');
  assert.equal(seguimiento.get(solicitud).confirmado,true);
  assert.deepEqual((await llamar(base + '/llamadas/' + solicitud, guardia)).json, { ok: true, estado: 'ENVIADA' });
  assert.equal((await llamar(base + '/llamadas/' + solicitud, jwtPara(2))).codigo, 404);
  assert.equal((await llamar(base + '/llamadas', guardia, { ...direccion, contacto: 'A' })).codigo, 409);
  assert.equal((await llamar(base + '/agente/resultado', agente, { solicitud, reclamo, estado: 'FINALIZADA' })).codigo, 204);
  assert.equal(seguimiento.get(solicitud).estado,'FINALIZADA');
  assert.deepEqual((await llamar(base + '/llamadas/' + solicitud, guardia)).json, { ok: true, estado: 'FINALIZADA' });
  // La agenda privada no debe entregar números a Seguridad, Mesa o Super Admin.
  const adminQuery = '/api/busqueda/conmutador/contactos-admin/consultar';
  const solicitado = { domicilios: [direccion] };
  assert.equal((await llamar(adminQuery, guardia, solicitado)).codigo, 403);
  assert.equal((await llamar(adminQuery, jwtPara(5), solicitado)).codigo, 403);
  const adminLista = await llamar(adminQuery, jwtPara(4), solicitado);
  assert.equal(adminLista.codigo, 200);
  assert.deepEqual(adminLista.json.contactos[0].telefonos, ['+52' + destino]);
  assert.equal(adminLista.json.contactos[0].propietario,'Jorge Hermosillo');
  const adminGuardado = async (token, telefonos) => {
    const response = await fetch('http://127.0.0.1:' + servidor.address().port +
      '/api/busqueda/conmutador/contactos-admin', {
        method:'PUT',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({...direccion,telefonos})
      });
    return { codigo: response.status, json: await response.json() };
  };
  assert.equal((await adminGuardado(guardia,['5551112233',''])).codigo,403);
  assert.equal((await adminGuardado(jwtPara(4),['123',''])).codigo,400);
  assert.equal((await adminGuardado(jwtPara(4),['5551112233',''])).codigo,200);
  assert.equal(linkedCasa.telefono,'525551112233','el cambio del conmutador se comparte con recibos');
  const actualizado = await llamar('/api/busqueda/conmutador/telefono?grupo=Rosas&numero=12',jwtPara(4));
  assert.deepEqual(actualizado.json.telefonos,['5551112233']);
  // Nueva edición de un solo contacto y el nombre, sin alterar datos del padrón.
  const editarFicha = async (token, telefono, propietario) => {
    const response = await fetch('http://127.0.0.1:' + servidor.address().port +
      '/api/busqueda/conmutador/contactos-admin', {
        method:'PUT',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({...direccion,telefono,propietario})
      });
    return {codigo:response.status,json:await response.json()};
  };
  assert.equal((await editarFicha(guardia,'5554447788','Otra persona')).codigo,403);
  assert.equal((await editarFicha(jwtPara(4),'123','Ana')).codigo,400);
  const nuevo = await editarFicha(jwtPara(4),'5554447788','Ana María');
  assert.equal(nuevo.codigo,200);
  assert.equal(nuevo.json.propietario,'Ana María');
  assert.deepEqual(nuevo.json.telefonos,['5554447788','']);
  assert.equal(nuevo.json.sincronizadoRecibos,true);
  assert.equal(linkedCasa.telefono,'525554447788');
  assert.deepEqual((await llamar(adminQuery,jwtPara(4),solicitado)).json.contactos[0],{
    ...direccion,telefonos:['5554447788'],propietario:'Ana María'
  });
  assert.equal((await editarFicha(jwtPara(4),'','Sin número')).codigo,200);
  const sinNumero = (await llamar(adminQuery,jwtPara(4),solicitado)).json.contactos[0];
  assert.deepEqual(sinNumero.telefonos,[]);
  assert.equal(sinNumero.propietario,'Sin número');
  assert.equal(linkedCasa.telefono,null,'borrar A debe quitar el teléfono de vivienda sin alterar otros contactos');
  assert.deepEqual((await llamar('/api/busqueda/conmutador/telefono?grupo=Rosas&numero=12',jwtPara(4))).json.telefonos,[]);
  linkedCasa.telefono='523355001122';
  assert.deepEqual((await llamar('/api/busqueda/conmutador/telefono?grupo=Rosas&numero=12',jwtPara(4))).json.telefonos,['3355001122'],
   'si conmutador no tiene A recupera el teléfono guardado en recibos');
  linkedCasa.telefono=null;
  // Restaurar número antes de comprobar el reintento de llamada heredado.
  assert.equal((await editarFicha(jwtPara(4),'5554447788','Ana María')).codigo,200);

  assert.deepEqual((await llamar(base+'/contactos?grupo=Rosas&numero=12',guardia)).json.contactos,['A']);
  const reintento = await llamar(base + '/llamadas', guardia, { ...direccion, contacto: 'A' });
  assert.equal(reintento.codigo, 202);
  assert.notEqual(reintento.json.solicitud, solicitud);
  await llamar(base + '/agente/resultado', agente, { solicitud, reclamo, estado: 'FINALIZADA' });
  assert.equal(fila.estado, 'PENDIENTE');
  assert.equal(seguimiento.get(reintento.json.solicitud).confirmado,false,
    'el resultado tardío de otra solicitud no debe confirmar la nueva');
  // El agente sí recoge el segundo intento, pero falla al preparar la llamada.
  const ordenErronea=await llamar(base+'/agente/siguiente',agente,{});
  assert.equal(ordenErronea.json.solicitud,reintento.json.solicitud);
  assert.equal((await llamar(base+'/agente/resultado',agente,{
    solicitud:ordenErronea.json.solicitud,reclamo:ordenErronea.json.reclamo,estado:'ERROR'
  })).codigo,204);
  assert.equal(seguimiento.get(reintento.json.solicitud).estado,'ERROR');
  assert.equal(seguimiento.get(reintento.json.solicitud).confirmado,false,
    'ERROR no se puede incluir como llamada enviada');
  // Reintentos duplicados o con reclamo antiguo nunca promueven ERROR a ENVIADA.
  assert.equal((await llamar(base+'/agente/resultado',agente,{
    solicitud:ordenErronea.json.solicitud,reclamo:ordenErronea.json.reclamo,estado:'ENVIADA'
  })).codigo,204);
  assert.equal(seguimiento.get(reintento.json.solicitud).estado,'ERROR');
});
