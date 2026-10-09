const { Op } = require('sequelize');
const { withC3, getDirectConfig } = require('./zkteco-c3-client.service');
const {
  isPullSdkBridgeConfigured,
  provisionUser: provisionUserViaPullSdk,
  setUserValidity: setUserValidityViaPullSdk,
  setUserAccess: setUserAccessViaPullSdk,
  deleteUser: deleteUserViaPullSdk
} = require('./zkteco-pullsdk-bridge.service');
const ZkTarjeta = require('../models/ZkTarjeta');
const Casa = require('../models/Casa');
const inventario = require('./zkteco-inventory-helpers');

const pad2 = n => String(n).padStart(2,'0');
const toDateNumber = value => {
  if (!value) return 0;
  const d = value instanceof Date ? value : new Date(value + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return 0;
  return Number(`${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}`);
};
const fromDateNumber = value => {
  const s=String(value||'');
  if(!/^\d{8}$/.test(s)||s==='00000000') return null;
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
};
const yesterday = () => {
  const d=new Date(); d.setDate(d.getDate()-1);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
};
const normalizeTokens = raw => String(raw||'')
  .split(/[\s,;|/]+/)
  .map(v=>v.trim())
  .filter(Boolean);

const normalizeCardKey = value => {
  const raw=String(value??'').trim();
  if(!raw) return '';
  const digits=raw.replace(/\D+/g,'');
  if(!digits) return raw.toLowerCase();
  return digits.replace(/^0+(?=\d)/,'');
};
const canonicalCardNo = value => {
  const key=normalizeCardKey(value);
  if(!/^\d+$/.test(key)) throw new Error('El número de TAG debe contener únicamente dígitos');
  return key;
};

const normalizeStreetKey = value => String(value||'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase()
  .replace(/\bavenida\b/g,'av')
  .replace(/\./g,'')
  .replace(/\s+/g,' ')
  .trim();

const canonicalStreet = value => {
  const key=normalizeStreetKey(value);
  if(key==='atotonilco'||key==='av atotonilco') return 'Av. Atotonilco';
  if(key==='guadalajara'||key==='av guadalajara') return 'Av. Guadalajara';
  if(key==='valle de mexico'||key==='av valle de mexico') return 'Av. Valle de México';
  return String(value||'').trim();
};

const canonicalOnlyHouse = (street,number) => {
  const canonical=canonicalStreet(street);
  const n=String(number??'').trim();
  if(canonical==='Av. Atotonilco') return n==='752';
  if(canonical==='Av. Guadalajara') return n==='707';
  if(canonical==='Av. Valle de México') return n==='3614';
  return true;
};

const normalizeDepartmentKey = (street,number) => {
  const canonical=canonicalStreet(street);
  return `${normalizeStreetKey(canonical)} ${String(number??'').trim().toLowerCase()}`.replace(/\s+/g,' ').trim();
};

const departmentMatchesHouse = (department,street,number) => {
  const dept=String(department||'').trim();
  if(!dept) return false;
  const match=dept.match(/^(.*?)[\s-]+([0-9]+(?:\.[0-9]+)?)$/);
  if(!match) return false;
  return normalizeDepartmentKey(match[1],match[2])===normalizeDepartmentKey(street,number);
};

async function testDirectConnection(){
  const config=getDirectConfig();
  return withC3(async client=>({
    ok:true,
    mode:'DIRECT',
    host:config.host,
    port:config.port,
    ...client.info
  }));
}

async function syncUsers(){
  const payload=await withC3(async client=>{
    const users=await client.getData('user');
    let auth=[];
    let authReadable=true;
    try{auth=await client.getData('userauthorize');}
    catch(_){authReadable=false;}
    return {users,auth,authReadable};
  });

  if(!Array.isArray(payload.users) || !Array.isArray(payload.auth)) {
    throw new Error('El C3 devolvió un inventario incompleto. Se conserva la información anterior.');
  }
  const houses=await Casa.findAll({attributes:['id','calle','numero','controles']});
  const houseById=new Map(houses.map(h=>[Number(h.id),h]));
  const byCard=new Map();
  for(const house of houses){
    for(const token of normalizeTokens(house.controles)){
      const key=normalizeCardKey(token);
      if(key) byCard.set(key,Number(house.id));
    }
  }

  const currentCards=await ZkTarjeta.findAll();
  const diagnostico=inventario.diagnosticoInventario(payload.users,currentCards);
  if(!diagnostico.ok) {
    throw new Error(diagnostico.message+' Campos leídos: '+diagnostico.fields.join(', ').slice(0,220));
  }
  // Conocer los usuarios que respondió el C3 no demuestra que devolvió
  // el inventario COMPLETO. Solo confirmar coincidencias positivas.
  // Una ausencia individual se presenta como diagnóstico y nunca provoca
  // poner en_controlador=false por una sola lectura de red.
  const existingByNormalized=new Map();
  const indexExisting=item=>{
    const key=normalizeCardKey(item.numeroTarjeta);
    if(!key)return;
    const list=existingByNormalized.get(key)||[];
    list.push(item);
    existingByNormalized.set(key,list);
  };
  currentCards.forEach(indexExisting);

  // IMPORTANT: do not mark everything as absent before a sync succeeds.
  // If one row fails halfway through, the old implementation left valid
  // physical cards incorrectly displayed as "No existe en C3".
  const liveKeys=new Set();
  for(const row of payload.users){
    const key=inventario.claveTarjeta(inventario.tarjetaFila(row));
    if(key&&key!=='0')liveKeys.add(key);
  }

  // Si userauthorize vuelve vacío cuando conocemos TAGs activos, puede
  // tratarse de una lectura parcial. Nunca convertirlos todos en BLOQUEADO.
  const permisosVerificables=payload.authReadable &&
    !(payload.auth.length===0 && currentCards.some(c=>!c.bloqueado));
  const authByPin=new Map(payload.auth.map(row=>[String(inventario.pinFila(row)??'').trim(),row]));
  let processed=0,linked=0;

  for(const row of payload.users){
    const card=String(inventario.tarjetaFila(row)??'').trim();
    const key=inventario.claveTarjeta(card);
    if(!key||key==='0') continue;

    const pin=String(inventario.pinFila(row)??'').trim()||null;
    const auth=pin?authByPin.get(pin):null;
    const candidates=existingByNormalized.get(key)||[];

    // Prefer the exact literal CardNo. If ZKAccess/app stored a leading-zero
    // variation, fall back to the same normalized card without creating a duplicate.
    const existing=
      candidates.find(item=>String(item.numeroTarjeta??'').trim()===card)||
      candidates.find(item=>Number(item.casaId||0)===Number(byCard.get(key)||0))||
      candidates[0]||
      null;

    const groupId=Number(inventario.grupoFila(row)||0)||null;
    const casaId=existing?.casaId??byCard.get(key)??null;
    if(casaId) linked++;

    const values={
      // Preserve the application's literal CardNo when the normalized value is
      // already known. This avoids unique-key conflicts such as 05112344 vs 5112344.
      numeroTarjeta:existing?existing.numeroTarjeta:card,
      uidDispositivo:Number(inventario.uidFila(row)||0)||null,
      pinDispositivo:pin,
      nombreDispositivo:String(inventario.nombreFila(row)??'').trim()||null,
      departamento:existing?.departamento||null,
      departamentoId:existing?.departamentoId||null,
      grupoDispositivo:groupId,
      // userauthorize is the physical source of truth for whether a TAG may open a door.
      // When a TAG is blocked we remove that row, but keep the last known profile locally
      // so it can be restored on activation.
      puertasAutorizadas:auth
        ? (Number(inventario.puertasFila(auth)||0)||null)
        : (existing?.puertasAutorizadas||null),
      timezoneId:auth
        ? (Number(inventario.zonaFila(auth)||0)||null)
        : (existing?.timezoneId||null),
      fechaInicio:fromDateNumber(inventario.inicioFila(row)) || existing?.fechaInicio || null,
      fechaFin:fromDateNumber(inventario.finalFila(row)) || existing?.fechaFin || null,
      casaId,
      bloqueado:permisosVerificables
        ? (!auth || Number(inventario.puertasFila(auth)||0)<=0)
        : Boolean(existing?.bloqueado),
      origen:existing?.origen||'ZKTECO',
      enControlador:true,
      ultimaLectura:new Date()
    };

    if(existing){
      await existing.update(values);
    }else{
      const created=await ZkTarjeta.create(values);
      indexExisting(created);
      currentCards.push(created);
    }

    if(casaId){
      const house=houseById.get(Number(casaId));
      if(house){
        const merged=mergeControls(house.controles,existing?.numeroTarjeta||card,false);
        if(String(house.controles||'')!==merged){
          await house.update({controles:merged});
        }
      }
    }
    processed++;
  }

  // Confirmaciones positivas se guardan arriba. No declarar inexistentes
  // tarjetas que no aparecieron en ESTA lectura: puede haber inventario parcial,
  // C3 equivocado, campos omitidos o una interrupción temporal del PullSDK.
  // Un diagnóstico físico explícito mostrará cuáles faltaron en la lectura.
  const sinConfirmarEnLectura=currentCards.filter(item=>
    !liveKeys.has(inventario.claveTarjeta(item.numeroTarjeta))).length;
  const reconocidos=currentCards.length-sinConfirmarEnLectura;

  // Inventory import is read-only on the controller: never enqueue validity
  // writes here. Payments and tag mutations have their own delivery events.

  return {
    ok:true,
    totalPanel:payload.users.length,
    procesados:processed,
    vinculados:linked,
    autorizaciones:payload.auth.length,
    autorizacionesConfiables:permisosVerificables,
    ausentes:0,
    noObservados:sinConfirmarEnLectura,
    reconocidos,
    previamenteConfirmados:diagnostico.previouslyConfirmed,
    camposDeTarjeta:diagnostico.fields.filter(x=>/card|pin|uid/i.test(x)),
    advertencia:[sinConfirmarEnLectura?'Hay TAGs no vistos; no se marcaron eliminados.':null,
      !permisosVerificables?'Autorizaciones de puertas no verificadas; estados manuales conservados.':null
    ].filter(Boolean).join(' ') || null
  };
}

// Diagnóstico de solo lectura para comprobar por qué una vivienda muestra
// "No confirmado en C3". No crea/bloquea/activa TAGs ni cambia el padrón.
async function diagnosticarVivienda(casaId) {
  const id=Number(casaId);
  if(!Number.isSafeInteger(id)||id<=0)throw Object.assign(new Error('Vivienda inválida'),{status:400});
  const casa=await Casa.findByPk(id,{attributes:['id','calle','numero','controles']});
  if(!casa)throw Object.assign(new Error('Vivienda no encontrada'),{status:404});
  const locales=await ZkTarjeta.findAll({where:{casaId:id},order:[['numeroTarjeta','ASC']]});
  const controles=normalizeTokens(casa.controles);
  const allCards=new Map();
  for(const raw of controles) {
    const key=inventario.claveTarjeta(raw);
    if(key)allCards.set(key,{numeroTarjeta:raw,enControlador:null});
  }
  for(const local of locales) {
    const key=inventario.claveTarjeta(local.numeroTarjeta);
    if(key)allCards.set(key,local);
  }
  const lectura=await withC3(async client=>{
    const usuarios=await client.getData('user');
    let permisos=null,errorPermisos=null;
    try{permisos=await client.getData('userauthorize');}
    catch(e){errorPermisos=e.message;}
    return {usuarios,permisos,errorPermisos,panel:client.info};
  });
  const evaluacion=inventario.diagnosticoInventario(lectura.usuarios,locales);
  if(!evaluacion.ok)throw Object.assign(new Error(evaluacion.message),{status:502});
  const byCard=new Map();
  for(const row of lectura.usuarios) {
    const key=inventario.claveTarjeta(inventario.tarjetaFila(row));
    if(key&&key!=='0')byCard.set(key,row);
  }
  const permisosConfiables=Boolean(lectura.permisos) &&
    !(lectura.permisos.length===0 && locales.some(c=>!c.bloqueado));
  const authByPin=new Map((lectura.permisos||[])
    .map(row=>[String(inventario.pinFila(row)??'').trim(),row]));
  return {
    casaId:id,calle:casa.calle,numero:casa.numero,
    panel:{serial:lectura.panel.serial||null,firmware:lectura.panel.firmware||null,
      usuariosLeidos:lectura.usuarios.length,tarjetasIdentificadas:evaluacion.cardRows,
      camposUsuario:evaluacion.fields,permisosLeidos:lectura.permisos?.length??null,
      errorPermisos:lectura.errorPermisos,
      permisosConfiables},
    tarjetas:[...allCards.values()].map(local=>{
      const key=inventario.claveTarjeta(local.numeroTarjeta);
      const fisico=byCard.get(key);
      const pin=String(inventario.pinFila(fisico)??'').trim();
      const autorizacion=pin?authByPin.get(pin):null;
      const autorizado=autorizacion?Number(inventario.puertasFila(autorizacion)||0)>0:false;
      return {
        numeroTarjeta:String(local.numeroTarjeta),
        registradoLocalmente:Boolean(local.id),
        ultimoEstadoLocal:local.enControlador===null?'SIN_REGISTRO':local.enControlador?'CONFIRMADO_ANTERIORMENTE':'NO_CONFIRMADO',
        fisicamenteObservado:Boolean(fisico),
        estadoFisico:!fisico?'NO_OBSERVADO_EN_ESTA_LECTURA':
          !permisosConfiables?'PRESENTE_AUTORIZACION_DESCONOCIDA':
          autorizado?'PRESENTE_AUTORIZADO':'PRESENTE_SIN_AUTORIZACION',
        fechaFinC3:fisico?fromDateNumber(inventario.finalFila(fisico)):null
      };
    })
  };
}

async function findPanelUserByCard(client,card){
  const rows=await client.getData('user');
  const wanted=normalizeCardKey(card);
  return rows.find(row=>inventario.claveTarjeta(inventario.tarjetaFila(row))===wanted)||null;
}

function getWriteMode(){
  const mode=String(process.env.ZKTECO_WRITE_MODE||'AUTO').trim().toUpperCase();
  return ['AUTO','DIRECT','PULLSDK'].includes(mode)?mode:'AUTO';
}

async function readControllerWithRetry(callback,{attempts=5,delayMs=700}={}){
  let lastError=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      return await withC3(callback);
    }catch(error){
      lastError=error;
      if(attempt<attempts) await new Promise(resolve=>setTimeout(resolve,delayMs*attempt));
    }
  }
  throw lastError||new Error('No fue posible leer el C3-200');
}

async function findPanelAuthorizationByPin(client,pin){
  const rows=await client.getData('userauthorize');
  return rows.find(row=>String(row.Pin??'').trim()===String(pin??'').trim())||null;
}

async function executePanelWrite({label,direct,pullSdk,verify,mode=getWriteMode()}){

  if(mode==='PULLSDK'){
    if(!isPullSdkBridgeConfigured()){
      throw new Error(`ZKTECO_WRITE_MODE=PULLSDK pero el bridge no está configurado (${label})`);
    }
    await pullSdk();
    const verified=await verify();
    if(!verified) throw new Error(`El PullSDK respondió, pero el C3-200 no confirmó: ${label}`);
    return 'PULLSDK';
  }

  let directError=null;
  try{
    await direct();
  }catch(error){
    directError=error;
  }

  let directVerified=false;
  let verifyError=null;
  try{
    directVerified=Boolean(await verify());
  }catch(error){
    verifyError=error;
  }

  if(directVerified) return 'DIRECT';

  if(mode==='DIRECT'){
    throw directError||verifyError||new Error(`El C3-200 no confirmó la escritura directa: ${label}`);
  }

  if(!isPullSdkBridgeConfigured()){
    throw directError||verifyError||new Error(
      `La escritura directa no quedó confirmada y no hay bridge de respaldo: ${label}`
    );
  }

  await pullSdk();
  const fallbackVerified=await verify();
  if(!fallbackVerified){
    throw new Error(`Ni DIRECT ni PullSDK dejaron confirmado el estado esperado: ${label}`);
  }
  return 'PULLSDK_FALLBACK';
}

async function directSetUserValidity({pin,cardNo,startDate,endDate,group=1}){
  const values={
    Pin:String(pin),
    CardNo:canonicalCardNo(cardNo),
    Password:'',
    Group:Number(group||1)||1
  };
  const startNumber=toDateNumber(startDate);
  const endNumber=toDateNumber(endDate);
  if(startNumber) values.StartTime=startNumber;
  if(endNumber) values.EndTime=endNumber;

  await withC3(client=>client.putRecord('user',values));
}

async function directSetUserAccess({pin,authorized,doorMask=3,timezoneId=1}){
  if(authorized){
    await withC3(client=>client.putRecord('userauthorize',{
      Pin:String(pin),
      AuthorizeTimezoneId:Math.max(1,Number(timezoneId)||1),
      AuthorizeDoorId:Math.max(1,Number(doorMask)||3)
    }));
    return;
  }
  await withC3(client=>client.deleteRecord('userauthorize',{Pin:String(pin)}));
}

async function directProvisionUser({cardNo,pin,startDate,endDate,doorMask=3,timezoneId=1}){
  let userError=null;
  try{
    await directSetUserValidity({pin,cardNo,startDate,endDate,group:1});
  }catch(error){
    userError=error;
  }

  let authError=null;
  try{
    await directSetUserAccess({pin,authorized:true,doorMask,timezoneId});
  }catch(error){
    authError=error;
  }

  if(userError||authError){
    const error=new Error(
      [userError&&`user: ${userError.message}`,authError&&`userauthorize: ${authError.message}`]
        .filter(Boolean).join(' | ')
    );
    error.cause=userError||authError;
    throw error;
  }
}

async function directDeleteUser({pin}){
  let authError=null;
  try{
    await withC3(client=>client.deleteRecord('userauthorize',{Pin:String(pin)}));
  }catch(error){
    authError=error;
  }

  let userError=null;
  try{
    await withC3(client=>client.deleteRecord('user',{Pin:String(pin)}));
  }catch(error){
    userError=error;
  }

  if(authError||userError){
    const error=new Error(
      [authError&&`userauthorize: ${authError.message}`,userError&&`user: ${userError.message}`]
        .filter(Boolean).join(' | ')
    );
    error.cause=authError||userError;
    throw error;
  }
}


async function writeUserValidity(card,fechaInicio,fechaFin,{mode=getWriteMode()}={}){
  const snapshot=await readControllerWithRetry(async client=>{
    const user=await findPanelUserByCard(client,card);
    if(!user) throw new Error(`Tarjeta ${card} no encontrada en el C3-200`);
    const pin=String(inventario.pinFila(user)??'').trim();
    if(!pin) throw new Error('No fue posible determinar el Pin del TAG en el C3-200');
    // Do not write when permissions cannot be read. An absent authorization is
    // valid (manually blocked); retain and verify its absence too.
    const permissions=await client.getData('userauthorize');
    return {user,pin,permissions:permissions.filter(row=>String(inventario.pinFila(row)??'').trim()===pin)};
  });
  const {user:current,pin}=snapshot;
  const cardNo=String(inventario.tarjetaFila(current)??'').trim();
  const fieldKey=key=>key.toLowerCase().replace(/[^a-z0-9]/g,'');
  const values=Object.fromEntries(Object.entries(current).filter(([key])=>fieldKey(key)!=='uid'));
  // PUTDATA may replace omitted user fields on C3 firmware. Resend all read
  // user fields except the controller-generated UID, changing only the dates.
  const setField=(names,value)=>{
    const key=Object.keys(current).find(key=>names.includes(fieldKey(key)));
    if(!key) throw new Error(`El C3 no devolvió el campo ${names[0]}; se cancela la escritura de vigencia`);
    values[key]=value;
  };
  setField(['pin'],pin);
  setField(['cardno','cardnumber','cardnum'],cardNo);
  if(fechaInicio) setField(['starttime'],toDateNumber(fechaInicio));
  if(fechaFin) setField(['endtime'],toDateNumber(fechaFin));
  const signature=rows=>JSON.stringify(rows.map(row=>Object.entries(row)
    .map(([key,value])=>[fieldKey(key),String(value??'')])
    .sort(([a],[b])=>a.localeCompare(b))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  const verify=async()=>{
    const observed=await readControllerWithRetry(async client=>({
      user:await findPanelUserByCard(client,cardNo),
      permissions:(await client.getData('userauthorize')).filter(row=>String(inventario.pinFila(row)??'').trim()===pin)
    }));
    if(!observed.user) throw new Error(`El C3-200 no confirmó la escritura: TAG ${cardNo} ausente tras actualizar vigencia`);
    const actual=new Map(Object.entries(observed.user).map(([key,value])=>[fieldKey(key),value]));
    const expected=new Map(Object.entries(values).map(([key,value])=>[fieldKey(key),value]));
    if(inventario.uidFila(current)!==null) expected.set('uid',inventario.uidFila(current));
    for(const [key,value] of expected){
      const observedValue=actual.get(key);
      const equal=['cardno','cardnumber','cardnum'].includes(key)
        ? normalizeCardKey(observedValue)===normalizeCardKey(value)
        : observedValue!==undefined && String(observedValue)===String(value);
      if(!equal){
        const detail=['starttime','endtime'].includes(key)?` (esperado ${value}, leído ${observedValue??'ausente'})`:'';
        // Never log passwords or other user field contents.
        throw new Error(`El C3-200 no confirmó la escritura: TAG ${cardNo}, campo ${key} diferente${detail}`);
      }
    }
    if(signature(observed.permissions)!==signature(snapshot.permissions)){
      throw new Error(`El C3-200 no confirmó la escritura: cambiaron las autorizaciones del TAG ${cardNo}`);
    }
    return true;
  };
  const writeMode=await executePanelWrite({mode,label:`actualizar vigencia del TAG ${cardNo}`,
    direct:()=>withC3(client=>client.putRecord('user',values)),
    pullSdk:()=>setUserValidityViaPullSdk({pin,cardNo,startDate:fechaInicio,endDate:fechaFin}),verify});
  return {numeroTarjeta:cardNo,fechaInicio,fechaFin,writeMode};
}

async function setCardBlocked(cardId,blocked){
  const tarjeta=await ZkTarjeta.findByPk(cardId);
  if(!tarjeta) throw new Error('Tarjeta no encontrada');

  const state=await readControllerWithRetry(async client=>{
    const current=await findPanelUserByCard(client,tarjeta.numeroTarjeta);
    if(!current) return {current:null,auth:null};
    let auth=null;
    try{auth=await findPanelAuthorizationByPin(client,String(current.Pin??tarjeta.pinDispositivo??'').trim());}
    catch(_){}
    return {current,auth};
  });

  if(!state.current) throw new Error('La tarjeta no existe en el controlador');

  const pin=String(state.current.Pin??tarjeta.pinDispositivo??'').trim();
  if(!pin) throw new Error('No fue posible determinar el Pin del TAG en el C3-200');

  if(blocked){
    const doorMask=Number(state.auth?.AuthorizeDoorId||tarjeta.puertasAutorizadas||3)||3;
    const timezoneId=Number(state.auth?.AuthorizeTimezoneId||tarjeta.timezoneId||1)||1;

    const verify=async()=>{
      const auth=await readControllerWithRetry(client=>findPanelAuthorizationByPin(client,pin));
      return !auth||Number(auth.AuthorizeDoorId||0)<=0;
    };

    await executePanelWrite({
      label:`bloquear TAG ${tarjeta.numeroTarjeta}`,
      direct:()=>directSetUserAccess({pin,authorized:false,doorMask,timezoneId}),
      pullSdk:()=>setUserAccessViaPullSdk({pin,authorized:false,doorMask,timezoneId}),
      verify
    });

    await tarjeta.update({
      bloqueado:true,
      pinDispositivo:pin,
      puertasAutorizadas:doorMask,
      timezoneId,
      fechaFinOriginal:tarjeta.fechaFinOriginal||null,
      ultimaLectura:new Date()
    });
  }else{
    const doorMask=Number(tarjeta.puertasAutorizadas||3)||3;
    const timezoneId=Number(tarjeta.timezoneId||1)||1;

    const currentStart=fromDateNumber(state.current.StartTime);
    const currentEnd=fromDateNumber(state.current.EndTime);
    const restoreEnd=tarjeta.fechaFinOriginal||tarjeta.fechaFin||currentEnd||'2099-12-31';
    if(tarjeta.fechaFinOriginal){
      await writeUserValidity(
        tarjeta.numeroTarjeta,
        currentStart||tarjeta.fechaInicio||'2020-01-01',
        restoreEnd
      );
    }

    const verify=async()=>{
      const auth=await readControllerWithRetry(client=>findPanelAuthorizationByPin(client,pin));
      return Boolean(auth&&Number(auth.AuthorizeDoorId||0)>0);
    };

    await executePanelWrite({
      label:`activar TAG ${tarjeta.numeroTarjeta}`,
      direct:()=>directSetUserAccess({pin,authorized:true,doorMask,timezoneId}),
      pullSdk:()=>setUserAccessViaPullSdk({pin,authorized:true,doorMask,timezoneId}),
      verify
    });

    const restored=await readControllerWithRetry(client=>findPanelAuthorizationByPin(client,pin));
    if(!restored||Number(restored.AuthorizeDoorId||0)<=0){
      throw new Error('El C3-200 no confirmó la autorización de puertas del TAG');
    }

    await tarjeta.update({
      bloqueado:false,
      pinDispositivo:pin,
      puertasAutorizadas:Number(restored.AuthorizeDoorId||doorMask)||doorMask,
      timezoneId:Number(restored.AuthorizeTimezoneId||timezoneId)||timezoneId,
      fechaFin:tarjeta.fechaFinOriginal||tarjeta.fechaFin,
      fechaFinOriginal:null,
      ultimaLectura:new Date()
    });
  }

  return tarjeta.reload();
}
async function setHouseBlocked(casaId,blocked){
  const casa=await Casa.findByPk(casaId,{attributes:['id','calle','numero','controles']});
  if(!casa) throw new Error('Vivienda no encontrada');
  const controls=normalizeTokens(casa.controles);
  let tarjetas=await ZkTarjeta.findAll({where:{casaId:Number(casa.id),enControlador:true}});
  if(!tarjetas.length&&controls.length){
    const all=await ZkTarjeta.findAll({where:{enControlador:true}});
    const wanted=new Set(controls.map(normalizeCardKey));
    tarjetas=all.filter(t=>wanted.has(normalizeCardKey(t.numeroTarjeta)));
  }
  if(!tarjetas.length) throw new Error('La vivienda no tiene controles activos en el C3-200');
  const results=[];
  for(const tarjeta of tarjetas){
    try{
      await setCardBlocked(tarjeta.id,blocked);
      results.push({numeroTarjeta:tarjeta.numeroTarjeta,ok:true});
    }catch(error){
      results.push({numeroTarjeta:tarjeta.numeroTarjeta,ok:false,error:error.message});
    }
  }
  const failed=results.filter(r=>!r.ok);
  if(failed.length) {
    const error=new Error(`Se actualizaron ${results.length-failed.length} de ${results.length} controles`);
    error.results=results;
    throw error;
  }
  return {casaId:casa.id,calle:casa.calle,numero:casa.numero,bloqueado:blocked,total:results.length,results};
}


function mergeControls(raw,card,remove=false){
  const values=normalizeTokens(raw);
  const filtered=values.filter(v=>v!==String(card));
  if(!remove&&!filtered.includes(String(card))) filtered.push(String(card));
  return filtered.join(', ');
}

function removeControlNormalized(raw,card){
  const key=normalizeCardKey(card);
  return normalizeTokens(raw)
    .filter(value=>normalizeCardKey(value)!==key)
    .join(', ');
}
async function setCardHouse(cardId,casaId){
  const tarjeta=await ZkTarjeta.findByPk(cardId);
  if(!tarjeta) throw new Error('Control no encontrado');
  const target=await Casa.findByPk(casaId,{attributes:['id','calle','numero','controles']});
  if(!target) throw new Error('Vivienda no encontrada');
  if(tarjeta.casaId&&Number(tarjeta.casaId)!==Number(casaId)){
    const old=await Casa.findByPk(tarjeta.casaId,{attributes:['id','controles']});
    if(old) await old.update({controles:mergeControls(old.controles,tarjeta.numeroTarjeta,true)});
  }
  await target.update({controles:mergeControls(target.controles,tarjeta.numeroTarjeta,false)});
  await tarjeta.update({casaId:Number(casaId)});
  return tarjeta.reload();
}

async function nextPanelIds(client){
  const rows=await client.getData('user');
  const maxUid=rows.reduce((m,r)=>Math.max(m,Number(r.UID||0)),0);
  const numericPins=rows.map(r=>Number(r.Pin)).filter(Number.isFinite);
  const maxPin=numericPins.length?Math.max(...numericPins):0;
  return {uid:maxUid+1,pin:String(maxPin+1),rows};
}

async function resolveAuthorizationProfile(client,casaId){
  const existing=await ZkTarjeta.findAll({
    where:{casaId:Number(casaId),bloqueado:false},
    order:[['ultimaLectura','DESC']]
  });
  const authRows=await client.getData('userauthorize');
  for(const card of existing){
    const pin=String(card.pinDispositivo||'').trim();
    const auth=authRows.find(r=>String(r.Pin??'').trim()===pin);
    if(auth){
      return {
        timezoneId:Number(auth.AuthorizeTimezoneId||1),
        doorMask:Number(auth.AuthorizeDoorId||3)
      };
    }
  }
  const usable=authRows.find(r=>Number(r.AuthorizeDoorId||0)>0);
  return {
    timezoneId:Number(usable?.AuthorizeTimezoneId||1),
    doorMask:Number(usable?.AuthorizeDoorId||3)
  };
}

async function resolveDepartmentProfile(casaId,casa){
  const reference=await ZkTarjeta.findOne({
    where:{casaId:Number(casaId),departamentoId:{[Op.ne]:null}},
    order:[['ultimaLectura','DESC']]
  });
  return {
    departamentoId:Number(reference?.departamentoId||0)||null,
    departamento:String(reference?.departamento||`${canonicalStreet(casa.calle)} ${casa.numero}`).trim()
  };
}

const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));

async function readBackUserByCard(client,card,{attempts=6,delayMs=350}={}){
  for(let attempt=1;attempt<=attempts;attempt++){
    const rows=await client.getData('user');
    const found=rows.find(r=>normalizeCardKey(r.CardNo)===card)||null;
    if(found)return found;
    if(attempt<attempts)await wait(delayMs);
  }
  return null;
}

async function readBackAuthorization(client,pin,{attempts=6,delayMs=350}={}){
  for(let attempt=1;attempt<=attempts;attempt++){
    const rows=await client.getData('userauthorize');
    const found=rows.find(r=>String(r.Pin??'').trim()===String(pin).trim())||null;
    if(found&&Number(found.AuthorizeDoorId||0)>0)return found;
    if(attempt<attempts)await wait(delayMs);
  }
  return null;
}

async function provisionTagOnController({casa,requestedCard,displayName,start,end}){
  const card=canonicalCardNo(requestedCard);

  const state=await readControllerWithRetry(async client=>{
    const ids=await nextPanelIds(client);
    const profile=await resolveAuthorizationProfile(client,casa.id);
    const existing=ids.rows.find(r=>normalizeCardKey(r.CardNo)===card)||null;
    return {ids,profile,existing};
  });

  if(state.existing){
    const pin=String(state.existing.Pin??'').trim();
    return {
      uid:Number(state.existing.UID||0)||null,
      pin,
      cardNo:String(state.existing.CardNo??card),
      timezoneId:Number(state.profile.timezoneId||1),
      doorMask:Number(state.profile.doorMask||3),
      writeMode:'EXISTING'
    };
  }

  const usedPins=new Set(state.ids.rows.map(r=>String(r.Pin??'').trim()).filter(Boolean));
  const preferredPin=String(Number(card));
  const pin=!usedPins.has(preferredPin)&&preferredPin!=='0'?preferredPin:String(state.ids.pin);
  const profile=state.profile;
  const doorMask=Number(profile.doorMask||3)||3;
  const timezoneId=Number(profile.timezoneId||1)||1;

  const verify=async()=>{
    const result=await readControllerWithRetry(async client=>{
      const user=await findPanelUserByCard(client,card);
      if(!user) return null;
      const realPin=String(user.Pin??pin).trim();
      const auth=await findPanelAuthorizationByPin(client,realPin);
      return {user,auth};
    });
    return Boolean(result?.user&&result?.auth&&Number(result.auth.AuthorizeDoorId||0)>0);
  };

  const writeMode=await executePanelWrite({
    label:`crear TAG ${card}`,
    direct:()=>directProvisionUser({
      cardNo:card,
      pin,
      startDate:start,
      endDate:end,
      doorMask,
      timezoneId
    }),
    pullSdk:()=>provisionUserViaPullSdk({
      cardNo:card,
      pin,
      name:String(displayName||'').slice(0,24),
      startDate:start,
      endDate:end,
      doorMask,
      timezoneId
    }),
    verify
  });

  const created=await readControllerWithRetry(client=>findPanelUserByCard(client,card));
  if(!created) throw new Error(`El C3-200 no devolvió el nuevo CardNo ${card}`);

  const realPin=String(created.Pin??pin).trim();
  const auth=await readControllerWithRetry(client=>findPanelAuthorizationByPin(client,realPin));
  if(!auth||Number(auth.AuthorizeDoorId||0)<=0){
    throw new Error('El usuario existe en el C3-200, pero userauthorize no confirmó acceso a las puertas.');
  }

  return {
    uid:Number(created.UID||0)||null,
    pin:realPin,
    cardNo:String(created.CardNo??card),
    timezoneId:Number(auth.AuthorizeTimezoneId||timezoneId)||timezoneId,
    doorMask:Number(auth.AuthorizeDoorId||doorMask)||doorMask,
    writeMode
  };
}
async function createTagForHouse(casaId,{numeroTarjeta,nombre,fechaInicio,fechaFin}={}){
  const casa=await Casa.findByPk(casaId,{attributes:['id','calle','numero','controles']});
  if(!casa) throw new Error('Vivienda no encontrada');

  const requestedCard=String(numeroTarjeta||'').trim();
  if(!requestedCard) throw new Error('Captura el número del TAG/control');
  const card=canonicalCardNo(requestedCard);

  const existingRows=await ZkTarjeta.findAll();
  const staleLocal=existingRows.find(item=>normalizeCardKey(item.numeroTarjeta)===card)||null;

  // The local mirror may keep a row after the physical TAG was removed from the C3.
  // Verify the controller before rejecting a re-create request.
  if(staleLocal){
    const physical=await withC3(client=>findPanelUserByCard(client,card));
    if(physical){
      throw new Error('Ese TAG/control ya existe físicamente en el C3-200');
    }
    if(staleLocal.enControlador!==false){
      await staleLocal.update({enControlador:false});
    }
  }

  const start=fechaInicio||new Date().toISOString().slice(0,10);
  const end=fechaFin||'2099-12-31';
  const departmentProfile=await resolveDepartmentProfile(casa.id,casa);
  const displayName=String(nombre||departmentProfile.departamento).trim().slice(0,48);

  const result=await provisionTagOnController({
    casa,
    requestedCard,
    displayName,
    start,
    end
  });

  const realCard=canonicalCardNo(result.cardNo);

  if(staleLocal){
    const previousCard=String(staleLocal.numeroTarjeta||realCard).trim();
    if(staleLocal.casaId&&Number(staleLocal.casaId)!==Number(casa.id)){
      const oldHouse=await Casa.findByPk(staleLocal.casaId,{attributes:['id','controles']});
      if(oldHouse){
        await oldHouse.update({controles:removeControlNormalized(oldHouse.controles,previousCard)});
      }
    }

    await staleLocal.update({
      casaId:Number(casa.id),
      uidDispositivo:result.uid,
      pinDispositivo:result.pin,
      nombreDispositivo:displayName,
      departamentoId:departmentProfile.departamentoId,
      departamento:departmentProfile.departamento,
      grupoDispositivo:1,
      puertasAutorizadas:result.doorMask,
      timezoneId:result.timezoneId,
      fechaInicio:start,
      fechaFin:end,
      fechaFinOriginal:null,
      bloqueado:false,
      origen:'APP',
      enControlador:true,
      ultimaLectura:new Date()
    });
    await casa.update({controles:mergeControls(casa.controles,previousCard,false)});
    return {
      ...staleLocal.toJSON(),
      numeroSolicitado:requestedCard,
      numeroTarjetaReal:realCard,
      normalizado:requestedCard!==realCard,
      reutilizado:true
    };
  }

  const tarjeta=await ZkTarjeta.create({
    casaId:Number(casa.id),
    uidDispositivo:result.uid,
    numeroTarjeta:realCard,
    pinDispositivo:result.pin,
    nombreDispositivo:displayName,
    departamentoId:departmentProfile.departamentoId,
    departamento:departmentProfile.departamento,
    grupoDispositivo:1,
    puertasAutorizadas:result.doorMask,
    timezoneId:result.timezoneId,
    fechaInicio:start,
    fechaFin:end,
    bloqueado:false,
    origen:'APP',
    enControlador:true,
    ultimaLectura:new Date()
  });
  await casa.update({controles:mergeControls(casa.controles,realCard,false)});
  return {
    ...tarjeta.toJSON(),
    numeroSolicitado:requestedCard,
    numeroTarjetaReal:realCard,
    normalizado:requestedCard!==realCard,
    reutilizado:false
  };
}

async function addExistingTagToController(cardId){
  const tarjeta=await ZkTarjeta.findByPk(cardId);
  if(!tarjeta) throw new Error('Control no encontrado');
  if(!tarjeta.casaId) throw new Error('El control todavía no está vinculado a una vivienda');

  const casa=await Casa.findByPk(tarjeta.casaId,{attributes:['id','calle','numero','controles']});
  if(!casa) throw new Error('La vivienda vinculada ya no existe');

  const requestedCard=String(tarjeta.numeroTarjeta||'').trim();
  if(!requestedCard) throw new Error('El control no tiene Número de tarjeta');
  const start=tarjeta.fechaInicio||new Date().toISOString().slice(0,10);
  const end=tarjeta.fechaFinOriginal||tarjeta.fechaFin||'2099-12-31';
  const departmentProfile=await resolveDepartmentProfile(casa.id,casa);
  const displayName=String(
    tarjeta.departamento||
    tarjeta.nombreDispositivo||
    departmentProfile.departamento||
    `${canonicalStreet(casa.calle)} ${casa.numero}`
  ).trim().slice(0,48);

  const result=await provisionTagOnController({
    casa,
    requestedCard,
    displayName,
    start,
    end
  });

  const realCard=canonicalCardNo(result.cardNo);
  await tarjeta.update({
    numeroTarjeta:realCard,
    uidDispositivo:result.uid,
    pinDispositivo:result.pin,
    nombreDispositivo:displayName,
    departamentoId:tarjeta.departamentoId||departmentProfile.departamentoId,
    departamento:tarjeta.departamento||departmentProfile.departamento,
    puertasAutorizadas:result.doorMask,
    timezoneId:result.timezoneId,
    fechaInicio:start,
    fechaFin:end,
    bloqueado:false,
    fechaFinOriginal:null,
    origen:'APP',
    enControlador:true,
    ultimaLectura:new Date()
  });

  await casa.update({controles:mergeControls(casa.controles,realCard,false)});

  return {
    ...tarjeta.toJSON(),
    numeroSolicitado:requestedCard,
    numeroTarjetaReal:realCard,
    normalizado:requestedCard!==realCard
  };
}

async function findHouseByStreetNumber(street,number){
  const requestedStreet=String(street||'').trim();
  const requestedNumber=String(number||'').trim();
  if(!requestedStreet||!requestedNumber) throw new Error('Captura calle y número de casa');

  const candidates=await Casa.findAll({
    where:{numero:requestedNumber},
    attributes:['id','calle','numero','controles']
  });
  const wanted=normalizeStreetKey(canonicalStreet(requestedStreet));
  const house=candidates.find(item=>normalizeStreetKey(canonicalStreet(item.calle))===wanted)||null;
  if(!house) throw new Error(`No se encontró la vivienda ${requestedStreet} ${requestedNumber}`);
  return house;
}

async function editTag(cardId,{numeroTarjeta,fechaInicio,fechaFin,calle,numero}={}){
  const tarjeta=await ZkTarjeta.findByPk(cardId);
  if(!tarjeta) throw new Error('Control no encontrado');

  const oldCard=canonicalCardNo(tarjeta.numeroTarjeta);
  const newCard=canonicalCardNo(numeroTarjeta||tarjeta.numeroTarjeta);
  const start=String(fechaInicio||tarjeta.fechaInicio||new Date().toISOString().slice(0,10)).trim();
  const end=String(fechaFin||tarjeta.fechaFinOriginal||tarjeta.fechaFin||'2099-12-31').trim();
  if(start&&end&&start>end) throw new Error('La fecha inicial no puede ser posterior a la fecha final');

  const targetHouse=(String(calle||'').trim()||String(numero||'').trim())
    ? await findHouseByStreetNumber(calle,numero)
    : await Casa.findByPk(tarjeta.casaId,{attributes:['id','calle','numero','controles']});
  if(!targetHouse) throw new Error('La vivienda vinculada ya no existe');

  const allCards=await ZkTarjeta.findAll({attributes:['id','numeroTarjeta']});
  const duplicate=allCards.find(item=>Number(item.id)!==Number(tarjeta.id)&&normalizeCardKey(item.numeroTarjeta)===normalizeCardKey(newCard));
  if(duplicate) throw new Error('El nuevo número de TAG ya existe en la aplicación');

  const cardChanged=normalizeCardKey(oldCard)!==normalizeCardKey(newCard);
  const houseChanged=Number(tarjeta.casaId||0)!==Number(targetHouse.id);
  const currentPhysical=await withC3(client=>findPanelUserByCard(client,oldCard));
  let controllerResult=null;

  const departmentProfile=await resolveDepartmentProfile(targetHouse.id,targetHouse);
  const displayName=String(departmentProfile.departamento||`${canonicalStreet(targetHouse.calle)} ${targetHouse.numero}`).trim().slice(0,48);

  if(cardChanged){
    const physicalNew=await withC3(client=>findPanelUserByCard(client,newCard));
    if(physicalNew) throw new Error('El nuevo número de TAG ya existe físicamente en el C3-200');

    if(currentPhysical||tarjeta.enControlador){
      controllerResult=await provisionTagOnController({
        casa:targetHouse,
        requestedCard:newCard,
        displayName,
        start,
        end
      });

      if(currentPhysical){
        const oldPin=String(currentPhysical.Pin??tarjeta.pinDispositivo??'').trim();
        if(!oldPin) throw new Error('No fue posible determinar el Pin actual del TAG');

        try{
          await executePanelWrite({
            label:`eliminar TAG anterior ${oldCard}`,
            direct:()=>directDeleteUser({pin:oldPin}),
            pullSdk:()=>deleteUserViaPullSdk({pin:oldPin,cardNo:oldCard}),
            verify:async()=>{
              const user=await readControllerWithRetry(client=>findPanelUserByCard(client,oldCard));
              return !user;
            }
          });
        }catch(error){
          // Si falla la segunda mitad del reemplazo, retirar el TAG nuevo para no dejar duplicados.
          try{
            if(controllerResult?.pin){
              await executePanelWrite({
                label:`revertir TAG nuevo ${newCard}`,
                direct:()=>directDeleteUser({pin:controllerResult.pin}),
                pullSdk:()=>deleteUserViaPullSdk({pin:controllerResult.pin,cardNo:newCard}),
                verify:async()=>{
                  const user=await readControllerWithRetry(client=>findPanelUserByCard(client,newCard));
                  return !user;
                }
              });
            }
          }catch(_){}
          throw error;
        }
      }
    }
  }else if(currentPhysical){
    const currentStart=fromDateNumber(currentPhysical.StartTime)||tarjeta.fechaInicio||null;
    const currentEnd=fromDateNumber(currentPhysical.EndTime)||tarjeta.fechaFin||null;
    if(String(currentStart||'')!==String(start||'')||String(currentEnd||'')!==String(end||'')){
      await writeUserValidity(oldCard,start,end);
    }
  }

  const oldHouse=tarjeta.casaId
    ? await Casa.findByPk(tarjeta.casaId,{attributes:['id','controles']})
    : null;

  if(oldHouse){
    const cleaned=removeControlNormalized(oldHouse.controles,oldCard);
    if(Number(oldHouse.id)!==Number(targetHouse.id)||cardChanged){
      await oldHouse.update({controles:cleaned});
    }
  }

  const targetControls=mergeControls(
    Number(oldHouse?.id)===Number(targetHouse.id)&&!cardChanged ? targetHouse.controles : removeControlNormalized(targetHouse.controles,oldCard),
    newCard,
    false
  );
  await targetHouse.update({controles:targetControls});

  await tarjeta.update({
    casaId:Number(targetHouse.id),
    numeroTarjeta:newCard,
    uidDispositivo:controllerResult?.uid??(cardChanged?null:tarjeta.uidDispositivo),
    pinDispositivo:controllerResult?.pin??(cardChanged?null:tarjeta.pinDispositivo),
    nombreDispositivo:displayName,
    departamentoId:departmentProfile.departamentoId,
    departamento:departmentProfile.departamento,
    puertasAutorizadas:controllerResult?.doorMask??tarjeta.puertasAutorizadas,
    timezoneId:controllerResult?.timezoneId??tarjeta.timezoneId,
    fechaInicio:start||null,
    fechaFin:end||null,
    fechaFinOriginal:null,
    bloqueado:false,
    enControlador:controllerResult?true:Boolean(currentPhysical),
    ultimaLectura:new Date()
  });

  return {
    ...(await tarjeta.reload()).toJSON(),
    numeroAnterior:oldCard,
    numeroTarjetaReal:newCard,
    numeroCambiado:cardChanged,
    viviendaCambiada:houseChanged
  };
}

async function removeTag(cardId){
  const tarjeta=await ZkTarjeta.findByPk(cardId);
  if(!tarjeta) throw new Error('Control no encontrado');

  const requestedCard=String(tarjeta.numeroTarjeta||'').trim();
  if(!requestedCard) throw new Error('El control no tiene Número de tarjeta');

  const current=await readControllerWithRetry(client=>findPanelUserByCard(client,requestedCard));
  let removedFromController=false;

  if(current){
    const pin=String(current.Pin??tarjeta.pinDispositivo??'').trim();
    if(!pin) throw new Error('No fue posible determinar el Pin del TAG en el C3-200');

    await executePanelWrite({
      label:`eliminar TAG ${requestedCard}`,
      direct:()=>directDeleteUser({pin}),
      pullSdk:()=>deleteUserViaPullSdk({
        pin,
        cardNo:canonicalCardNo(requestedCard)
      }),
      verify:async()=>{
        const user=await readControllerWithRetry(client=>findPanelUserByCard(client,requestedCard));
        return !user;
      }
    });

    removedFromController=true;
  }

  if(tarjeta.casaId){
    const casa=await Casa.findByPk(tarjeta.casaId,{attributes:['id','controles']});
    if(casa){
      await casa.update({controles:removeControlNormalized(casa.controles,requestedCard)});
    }
  }

  const data={
    id:tarjeta.id,
    numeroTarjeta:requestedCard,
    casaId:tarjeta.casaId,
    removedFromController
  };
  await tarjeta.destroy();
  return data;
}
async function operateGate(action){
  const envName=action==='CERRAR'?'ZKTECO_GATE_CLOSE_OUTPUTS':'ZKTECO_GATE_OPEN_OUTPUTS';
  let outputs=String(process.env[envName]||'').split(',').map(v=>Number(v.trim())).filter(v=>Number.isInteger(v)&&v>0);
  if(!outputs.length && action==='ABRIR') outputs=[1,2];
  if(!outputs.length && action==='CERRAR') outputs=[1,2];
  const pulse=Math.max(0,Math.min(30,Number(process.env.ZKTECO_GATE_PULSE_SECONDS||3)));
  return withC3(async client=>{
    const results=[];
    for(const door of outputs){
      const duration=action==='CERRAR'?0:pulse;
      results.push(await client.controlDoor(door,duration));
    }
    return {ok:true,accion:action,puertas:results,...client.info};
  });
}

async function dashboard({calle,numero,tag,pagina,limite}={}){
  const requestedPage=Math.max(1,Number.parseInt(pagina,10)||1);
  const pageSize=Math.min(8,Math.max(1,Number.parseInt(limite,10)||8));
  const cards=await ZkTarjeta.findAll({order:[['numeroTarjeta','ASC']]});
  const searchByDepartment=Boolean(String(calle||'').trim()&&String(numero||'').trim());

  const tagQuery=String(tag||'').trim();
  const tagKey=normalizeCardKey(tagQuery);
  const tagMatches=value=>{
    if(!tagQuery)return true;
    const raw=String(value??'').trim();
    if(!raw)return false;
    const rawLower=raw.toLowerCase();
    const queryLower=tagQuery.toLowerCase();
    const normalized=normalizeCardKey(raw);
    return rawLower.includes(queryLower) || Boolean(tagKey&&normalized.includes(tagKey));
  };

  let houses;
  if(searchByDepartment){
    // Si DEPTNAME está vacío, no ocultar una casa que existe en direcciones.
    // ZKAccess stores the address as one value in DEPARTMENTS.DEPTNAME,
    // for example "GARDENIAS 21". Treat that field as the source of truth.
    const matchedCards=cards.filter(card=>departmentMatchesHouse(card.departamento,calle,numero));
    const houseIds=[...new Set(matchedCards.map(card=>Number(card.casaId)).filter(Boolean))];

    const candidates=await Casa.findAll({
      where:{numero:String(numero).trim()},
      attributes:['id','calle','calleCorrecta','numero','controles'],
      order:[['calle','ASC'],['numero','ASC']]
    });
    houses=candidates.filter(h=>normalizeDepartmentKey(h.calle,h.numero)===normalizeDepartmentKey(calle,numero));
    // Show physically matching houses as well if they have not yet been
    // reconciled to a physical department record.
    if(houseIds.length){
      const additional=await Casa.findAll({where:{id:{[Op.in]:houseIds}},
        attributes:['id','calle','calleCorrecta','numero','controles']});
      const have=new Set(houses.map(h=>Number(h.id)));
      for(const house of additional){
        if(!have.has(Number(house.id))){houses.push(house);have.add(Number(house.id));}
      }
    }
  }else{
    const where={};
    if(calle){
      const canonical=canonicalStreet(calle);
      const variants={
        'Av. Atotonilco':['Atotonilco','Av Atotonilco','Av. Atotonilco','Avenida Atotonilco'],
        'Av. Guadalajara':['Guadalajara','Av Guadalajara','Av. Guadalajara','Avenida Guadalajara'],
        'Av. Valle de México':['Valle de México','Av Valle de México','Av. Valle de México','Avenida Valle de México']
      };
      where.calle=variants[canonical]
        ? { [Op.or]: variants[canonical].map(v=>({[Op.like]:`%${v}%`})) }
        : { [Op.like]: `%${calle}%` };
    }
    if(numero) where.numero={ [Op.like]: `%${numero}%` };
    houses=await Casa.findAll({
      where,
      attributes:['id','calle','calleCorrecta','numero','controles'],
      order:[['calle','ASC'],['numero','ASC']]
    });
  }

  const byNormalizedCard=new Map();
  const byHouse=new Map();
  for(const card of cards){
    const key=normalizeCardKey(card.numeroTarjeta);
    if(key) byNormalizedCard.set(key,card);
    if(card.casaId){
      const list=byHouse.get(Number(card.casaId))||[];
      list.push(card);
      byHouse.set(Number(card.casaId),list);
    }
  }

  const rows=houses
    .filter(h=>canonicalOnlyHouse(h.calle,h.numero))
    .map(h=>{
      const controls=normalizeTokens(h.controles);
      const matched=[];
      const seen=new Set();

      // El dato físico Departamento puede faltar o ser antiguo. Priorizar
      // los tags de usuarios_casas/controles del padrón para no esconder
      // Gardenias 5 simplemente porque ZKAccess no devolvió DEPTNAME.
      const departmentCards=searchByDepartment
        ? cards.filter(card=>departmentMatchesHouse(card.departamento,h.calle,h.numero))
        : [];

      for(const card of departmentCards){
        if(!seen.has(card.id)){matched.push(card);seen.add(card.id);}
      }
      for(const rawCard of controls){
        const card=byNormalizedCard.get(normalizeCardKey(rawCard));
        if(card&&!seen.has(card.id)&&(!searchByDepartment || Number(card.casaId||0)===Number(h.id) ||
          departmentMatchesHouse(card.departamento,h.calle,h.numero) || !card.departamento)){
          matched.push(card);seen.add(card.id);
        }
      }
      for(const card of (byHouse.get(Number(h.id))||[])){
        if(!seen.has(card.id) && (!searchByDepartment || Number(card.casaId)===Number(h.id) ||
          departmentMatchesHouse(card.departamento,h.calle,h.numero))){
          matched.push(card);seen.add(card.id);
        }
      }

      const matchedKeys=new Set(matched.map(card=>normalizeCardKey(card.numeroTarjeta)));
      const unresolved=searchByDepartment
        ? []
        : controls.filter(raw=>!matchedKeys.has(normalizeCardKey(raw)));

      const visibleCards=tagQuery
        ? matched.filter(card=>tagMatches(card.numeroTarjeta))
        : matched;
      const visibleUnresolved=tagQuery
        ? unresolved.filter(tagMatches)
        : unresolved;

      return {
        id:h.id,
        calle:canonicalStreet(h.calle),
        calleCorrecta:h.calleCorrecta||canonicalStreet(h.calle),
        numero:h.numero,
        departamentoBusqueda:searchByDepartment?`${canonicalStreet(calle)} ${String(numero).trim()}`:null,
        filtroTag:tagQuery||null,
        controles:controls,
        controlesNoEnlazados:visibleUnresolved,
        tarjetas:visibleCards.map(card=>({
          id:card.id,
          numeroTarjeta:String(card.numeroTarjeta),
          pin:card.pinDispositivo,
          departamento:card.departamento,
          nombreDispositivo:card.nombreDispositivo,
          bloqueado:Boolean(card.bloqueado),
          enControlador:Boolean(card.enControlador),
          puertasAutorizadas:card.puertasAutorizadas,
          fechaInicio:card.fechaInicio,
          fechaFin:card.fechaFin,
          ultimaLectura:card.ultimaLectura
        }))
      };
    })
    .filter(row=>!tagQuery||row.tarjetas.length||row.controlesNoEnlazados.length);

  const total=rows.length;
  const totalPages=Math.max(1,Math.ceil(total/pageSize));
  const page=Math.min(requestedPage,totalPages);
  const offset=(page-1)*pageSize;
  const pageRows=rows.slice(offset,offset+pageSize);

  return {
    rows:pageRows,
    pagination:{
      page,
      limit:pageSize,
      total,
      totalPages,
      hasPrev:page>1,
      hasNext:page<totalPages
    },
    filters:{
      calle:String(calle||'').trim()||null,
      numero:String(numero||'').trim()||null,
      tag:tagQuery||null
    }
  };
}

// Preserve the durable pending delivery when a tag is created, reassigned or
// restored. Lazy require avoids the direct-client/worker dependency cycle.
const conVigencia = (operation, debeSincronizar = () => true) => async (...args) => {
  const result = await operation(...args);
  if(result?.casaId && debeSincronizar(result)) await require('./zkteco-vigencias.service').marcarPendiente(result.casaId);
  return result;
};

// Una fecha manual no genera una nueva entrega de la vigencia financiera.
// Reemplazar o reasignar el TAG sí debe heredar la vigencia de su vivienda.
module.exports={diagnosticarVivienda,testDirectConnection,syncUsers,setCardBlocked,setHouseBlocked,setCardHouse:conVigencia(setCardHouse),createTagForHouse:conVigencia(createTagForHouse),addExistingTagToController:conVigencia(addExistingTagToController),editTag:conVigencia(editTag, result => result.numeroCambiado || result.viviendaCambiada),removeTag,operateGate,dashboard,writeUserValidity};
