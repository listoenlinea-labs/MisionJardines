const { Op } = require('sequelize');
const { withC3, getDirectConfig } = require('./zkteco-c3-client.service');
const {
  isPullSdkBridgeConfigured,
  provisionUser: provisionUserViaPullSdk,
  setUserValidity: setUserValidityViaPullSdk,
  deleteUser: deleteUserViaPullSdk
} = require('./zkteco-pullsdk-bridge.service');
const ZkTarjeta = require('../models/ZkTarjeta');
const Casa = require('../models/Casa');

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
    try{auth=await client.getData('userauthorize');}catch(_){}
    return {users,auth};
  });

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
    const key=normalizeCardKey(row.CardNo);
    if(key&&key!=='0')liveKeys.add(key);
  }

  const authByPin=new Map(payload.auth.map(row=>[String(row.Pin??'').trim(),row]));
  let processed=0,linked=0;

  for(const row of payload.users){
    const card=String(row.CardNo??'').trim();
    const key=normalizeCardKey(card);
    if(!key||key==='0') continue;

    const pin=String(row.Pin??'').trim()||null;
    const auth=pin?authByPin.get(pin):null;
    const candidates=existingByNormalized.get(key)||[];

    // Prefer the exact literal CardNo. If ZKAccess/app stored a leading-zero
    // variation, fall back to the same normalized card without creating a duplicate.
    const existing=
      candidates.find(item=>String(item.numeroTarjeta??'').trim()===card)||
      candidates.find(item=>Number(item.casaId||0)===Number(byCard.get(key)||0))||
      candidates[0]||
      null;

    const groupId=Number(row.Group||0)||null;
    const casaId=existing?.casaId??byCard.get(key)??null;
    if(casaId) linked++;

    const values={
      // Preserve the application's literal CardNo when the normalized value is
      // already known. This avoids unique-key conflicts such as 05112344 vs 5112344.
      numeroTarjeta:existing?existing.numeroTarjeta:card,
      uidDispositivo:Number(row.UID||0)||null,
      pinDispositivo:pin,
      nombreDispositivo:String(row.Name??'').trim()||null,
      departamento:existing?.departamento||null,
      departamentoId:existing?.departamentoId||null,
      grupoDispositivo:groupId,
      puertasAutorizadas:Number(auth?.AuthorizeDoorId||0)||null,
      timezoneId:Number(auth?.AuthorizeTimezoneId||0)||null,
      fechaInicio:fromDateNumber(row.StartTime),
      fechaFin:fromDateNumber(row.EndTime),
      casaId,
      bloqueado:Boolean(fromDateNumber(row.EndTime) && fromDateNumber(row.EndTime) < new Date().toISOString().slice(0,10)),
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

  // Only after the complete physical read + reconciliation succeeds do we mark
  // missing cards as absent. All DB rows that normalize to a live CardNo remain
  // live, which also prevents stale duplicate/import rows from showing false red.
  let absent=0;
  const now=new Date();
  for(const item of currentCards){
    const key=normalizeCardKey(item.numeroTarjeta);
    if(!key)continue;
    const live=liveKeys.has(key);
    if(live){
      if(item.enControlador===false){
        await item.update({enControlador:true,ultimaLectura:now});
      }
    }else if(item.enControlador!==false){
      await item.update({enControlador:false});
      absent++;
    }else{
      absent++;
    }
  }

  return {
    ok:true,
    totalPanel:payload.users.length,
    procesados:processed,
    vinculados:linked,
    autorizaciones:payload.auth.length,
    ausentes:absent
  };
}

async function findPanelUserByCard(client,card){
  const rows=await client.getData('user');
  const wanted=normalizeCardKey(card);
  return rows.find(row=>normalizeCardKey(row.CardNo)===wanted)||null;
}

async function writeUserValidity(card,fechaInicio,fechaFin){
  const current=await withC3(async client=>{
    const row=await findPanelUserByCard(client,card);
    if(!row) throw new Error(`Tarjeta ${card} no encontrada en el C3-200`);
    return row;
  });

  if(isPullSdkBridgeConfigured()){
    await setUserValidityViaPullSdk({
      pin:String(current.Pin??'').trim(),
      cardNo:String(card),
      startDate:fechaInicio,
      endDate:fechaFin
    });
    // Verify against the physical controller, not the bridge response.
    const verified=await withC3(client=>findPanelUserByCard(client,card));
    if(!verified) throw new Error(`El PullSDK reportó la actualización, pero la tarjeta ${card} ya no aparece en el C3-200`);
    return {numeroTarjeta:String(card),fechaInicio,fechaFin,writeMode:'PULLSDK'};
  }

  throw new Error(
    'Este C3-200 permite lectura/control directo por TCP, pero no está aceptando escrituras de usuarios por el protocolo socket. '+
    'Configura ZKTECO_PULLSDK_BRIDGE_URL para altas y cambios de vigencia mediante el Pull SDK oficial.'
  );
}

async function setCardBlocked(cardId,blocked){
  const tarjeta=await ZkTarjeta.findByPk(cardId);
  if(!tarjeta) throw new Error('Tarjeta no encontrada');
  const current=await withC3(client=>findPanelUserByCard(client,tarjeta.numeroTarjeta));
  if(!current) throw new Error('La tarjeta no existe en el controlador');

  const currentStart=fromDateNumber(current.StartTime);
  const currentEnd=fromDateNumber(current.EndTime);
  if(blocked){
    const original=tarjeta.fechaFinOriginal||currentEnd||'2099-12-31';
    await writeUserValidity(tarjeta.numeroTarjeta,currentStart||tarjeta.fechaInicio||'2020-01-01',yesterday());
    await tarjeta.update({
      bloqueado:true,
      fechaInicio:currentStart||tarjeta.fechaInicio,
      fechaFin:yesterday(),
      fechaFinOriginal:original,
      ultimaLectura:new Date()
    });
  }else{
    const restore=tarjeta.fechaFinOriginal||currentEnd||'2099-12-31';
    await writeUserValidity(tarjeta.numeroTarjeta,currentStart||tarjeta.fechaInicio||'2020-01-01',restore);
    await tarjeta.update({
      bloqueado:false,
      fechaFin:restore,
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

  // Reads still go directly to the controller because that path is proven on this C3-200.
  const state=await withC3(async client=>{
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

  if(!isPullSdkBridgeConfigured()){
    throw new Error(
      'El C3-200 sí está conectado y se puede leer/abrir la pluma, pero este firmware no acepta altas de usuarios por la escritura TCP directa. '+
      'Para crear TAGs necesitas configurar el puente del Pull SDK oficial (ZKTECO_PULLSDK_BRIDGE_URL).'
    );
  }

  const usedPins=new Set(state.ids.rows.map(r=>String(r.Pin??'').trim()).filter(Boolean));
  const preferredPin=String(Number(card));
  const pin=!usedPins.has(preferredPin)&&preferredPin!=='0'?preferredPin:String(state.ids.pin);
  const profile=state.profile;

  await provisionUserViaPullSdk({
    cardNo:card,
    pin,
    name:String(displayName||'').slice(0,24),
    startDate:start,
    endDate:end,
    doorMask:Number(profile.doorMask||3),
    timezoneId:Number(profile.timezoneId||1)
  });

  // The official SDK call is not enough: prove the new record is now in the controller.
  const created=await withC3(client=>readBackUserByCard(client,card,{attempts:8,delayMs:500}));
  if(!created){
    throw new Error(
      'El Pull SDK respondió, pero el C3-200 no devolvió el nuevo CardNo al releer la tabla user. '+
      'Revisa la respuesta/log del puente PullSDK.'
    );
  }

  const realPin=String(created.Pin??pin).trim();
  const auth=await withC3(client=>readBackAuthorization(client,realPin,{attempts:8,delayMs:500}));
  if(!auth){
    throw new Error('El usuario ya existe en el C3-200, pero userauthorize no confirmó acceso a las puertas.');
  }

  return {
    uid:Number(created.UID||0)||null,
    pin:realPin,
    cardNo:String(created.CardNo??card),
    timezoneId:Number(auth.AuthorizeTimezoneId||profile.timezoneId||1),
    doorMask:Number(auth.AuthorizeDoorId||profile.doorMask||3),
    writeMode:'PULLSDK'
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
      if(!isPullSdkBridgeConfigured()){
        throw new Error('El puente Pull SDK no está configurado para cambiar el número del TAG');
      }

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
          await deleteUserViaPullSdk({pin:oldPin,cardNo:oldCard});
          const stillOld=await withC3(client=>readBackUserByCard(client,oldCard,{attempts:8,delayMs:500}));
          if(stillOld) throw new Error('El C3-200 todavía devuelve el número anterior después del cambio');
        }catch(error){
          // Keep the original TAG usable if the second half of the replacement fails.
          try{
            if(controllerResult?.pin) await deleteUserViaPullSdk({pin:controllerResult.pin,cardNo:newCard});
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

  const current=await withC3(client=>findPanelUserByCard(client,requestedCard));
  let removedFromController=false;

  if(current){
    if(!isPullSdkBridgeConfigured()){
      throw new Error('El TAG existe en el C3-200, pero el puente Pull SDK no está configurado para eliminarlo');
    }

    const pin=String(current.Pin??tarjeta.pinDispositivo??'').trim();
    if(!pin) throw new Error('No fue posible determinar el Pin del TAG en el C3-200');

    await deleteUserViaPullSdk({
      pin,
      cardNo:canonicalCardNo(requestedCard)
    });

    const stillThere=await withC3(client=>readBackUserByCard(client,canonicalCardNo(requestedCard),{attempts:8,delayMs:500}));
    if(stillThere){
      throw new Error('El Pull SDK respondió, pero el TAG todavía aparece en la tabla user del C3-200');
    }
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

async function dashboard({calle,numero,pagina,limite}={}){
  const requestedPage=Math.max(1,Number.parseInt(pagina,10)||1);
  const pageSize=Math.min(8,Math.max(1,Number.parseInt(limite,10)||8));
  const cards=await ZkTarjeta.findAll({order:[['numeroTarjeta','ASC']]});
  const searchByDepartment=Boolean(String(calle||'').trim()&&String(numero||'').trim());

  let houses;
  if(searchByDepartment){
    // ZKAccess stores the address as one value in DEPARTMENTS.DEPTNAME,
    // for example "GARDENIAS 21". Treat that field as the source of truth.
    const matchedCards=cards.filter(card=>departmentMatchesHouse(card.departamento,calle,numero));
    const houseIds=[...new Set(matchedCards.map(card=>Number(card.casaId)).filter(Boolean))];

    if(houseIds.length){
      houses=await Casa.findAll({
        where:{id:{[Op.in]:houseIds}},
        attributes:['id','calle','numero','controles'],
        order:[['calle','ASC'],['numero','ASC']]
      });
    }else{
      // If the department import has not linked casa_id yet, locate the one
      // matching the same street/number so the UI can show "Pendiente de enlazar".
      const candidates=await Casa.findAll({
        where:{numero:String(numero).trim()},
        attributes:['id','calle','numero','controles'],
        order:[['calle','ASC'],['numero','ASC']]
      });
      houses=candidates.filter(h=>normalizeDepartmentKey(h.calle,h.numero)===normalizeDepartmentKey(calle,numero));
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
      attributes:['id','calle','numero','controles'],
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

      // When street + house number are provided, only show cards whose
      // ZKAccess Departamento actually matches that house.
      const departmentCards=searchByDepartment
        ? cards.filter(card=>departmentMatchesHouse(card.departamento,h.calle,h.numero))
        : [];

      for(const card of departmentCards){
        if(!seen.has(card.id)){matched.push(card);seen.add(card.id);}
      }
      for(const rawCard of controls){
        const card=byNormalizedCard.get(normalizeCardKey(rawCard));
        if(card&&!seen.has(card.id)&&(!searchByDepartment||departmentMatchesHouse(card.departamento,h.calle,h.numero))){
          matched.push(card);seen.add(card.id);
        }
      }
      for(const card of (byHouse.get(Number(h.id))||[])){
        if(!seen.has(card.id)&&(!searchByDepartment||departmentMatchesHouse(card.departamento,h.calle,h.numero))){
          matched.push(card);seen.add(card.id);
        }
      }

      const matchedKeys=new Set(matched.map(card=>normalizeCardKey(card.numeroTarjeta)));
      const unresolved=searchByDepartment
        ? []
        : controls.filter(raw=>!matchedKeys.has(normalizeCardKey(raw)));

      return {
        id:h.id,
        calle:canonicalStreet(h.calle),
        numero:h.numero,
        departamentoBusqueda:searchByDepartment?`${canonicalStreet(calle)} ${String(numero).trim()}`:null,
        controles:controls,
        controlesNoEnlazados:unresolved,
        tarjetas:matched.map(card=>({
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
    });

  const total=rows.length;
  const totalPages=Math.max(1,Math.ceil(total/pageSize));
  const page=Math.min(requestedPage,totalPages);
  const start=(page-1)*pageSize;
  const pageRows=rows.slice(start,start+pageSize);

  return {
    rows:pageRows,
    pagination:{
      page,
      limit:pageSize,
      total,
      totalPages,
      hasPrev:page>1,
      hasNext:page<totalPages
    }
  };
}

module.exports={testDirectConnection,syncUsers,setCardBlocked,setHouseBlocked,setCardHouse,createTagForHouse,addExistingTagToController,editTag,removeTag,operateGate,dashboard,writeUserValidity};
