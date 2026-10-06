const { Op } = require('sequelize');
const { withC3, getDirectConfig } = require('./zkteco-c3-client.service');
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
  const byCard=new Map();
  for(const house of houses){
    for(const token of normalizeTokens(house.controles)){
      const key=normalizeCardKey(token);
      if(key) byCard.set(key,Number(house.id));
    }
  }
  const authByPin=new Map(payload.auth.map(row=>[String(row.Pin??'').trim(),row]));
  let processed=0,linked=0;
  for(const row of payload.users){
    const card=String(row.CardNo??'').trim();
    if(!card||card==='0') continue;
    const pin=String(row.Pin??'').trim()||null;
    const auth=pin?authByPin.get(pin):null;
    const existing=await ZkTarjeta.findOne({where:{numeroTarjeta:card}});
    const casaId=existing?.casaId??byCard.get(normalizeCardKey(card))??null;
    if(casaId) linked++;
    await ZkTarjeta.upsert({
      numeroTarjeta:card,
      uidDispositivo:Number(row.UID||0)||null,
      pinDispositivo:pin,
      nombreDispositivo:String(row.Name??'').trim()||null,
      departamento:existing?.departamento||null,
      departamentoId:existing?.departamentoId||null,
      grupoDispositivo:Number(row.Group||0)||null,
      puertasAutorizadas:Number(auth?.AuthorizeDoorId||0)||null,
      timezoneId:Number(auth?.AuthorizeTimezoneId||0)||null,
      fechaInicio:fromDateNumber(row.StartTime),
      fechaFin:fromDateNumber(row.EndTime),
      casaId,
      bloqueado:Boolean(fromDateNumber(row.EndTime) && fromDateNumber(row.EndTime) < new Date().toISOString().slice(0,10)),
      origen:existing?.origen||'ZKTECO',
      ultimaLectura:new Date()
    });
    processed++;
  }
  return {ok:true,totalPanel:payload.users.length,procesados:processed,vinculados:linked,autorizaciones:payload.auth.length};
}

async function findPanelUserByCard(client,card){
  const rows=await client.getData('user');
  return rows.find(row=>String(row.CardNo??'').trim()===String(card).trim())||null;
}

async function writeUserValidity(card,fechaInicio,fechaFin){
  return withC3(async client=>{
    const row=await findPanelUserByCard(client,card);
    if(!row) throw new Error(`Tarjeta ${card} no encontrada en el C3-200`);
    const values={...row,StartTime:toDateNumber(fechaInicio),EndTime:toDateNumber(fechaFin)};
    await client.setRecord('user',values);
    return {numeroTarjeta:String(card),fechaInicio,fechaFin};
  });
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
  if(!controls.length) throw new Error('La vivienda no tiene controles registrados');
  const tarjetas=await ZkTarjeta.findAll({where:{numeroTarjeta:{[Op.in]:controls}}});
  if(!tarjetas.length) throw new Error('Sincroniza ZKTeco para relacionar los controles de esta vivienda');
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

async function createTagForHouse(casaId,{numeroTarjeta,nombre,fechaInicio,fechaFin}={}){
  const casa=await Casa.findByPk(casaId,{attributes:['id','calle','numero','controles']});
  if(!casa) throw new Error('Vivienda no encontrada');

  const requestedCard=String(numeroTarjeta||'').trim();
  if(!requestedCard) throw new Error('Captura el número del TAG/control');
  const card=canonicalCardNo(requestedCard);

  if(await ZkTarjeta.findOne({where:{numeroTarjeta:card}})) throw new Error('Ese TAG/control ya existe');
  const start=fechaInicio||new Date().toISOString().slice(0,10);
  const end=fechaFin||'2099-12-31';
  const displayName=String(nombre||`${canonicalStreet(casa.calle)} ${casa.numero}`).trim().slice(0,48);

  const result=await withC3(async client=>{
    const ids=await nextPanelIds(client);
    if(ids.rows.some(r=>normalizeCardKey(r.CardNo)===card)) throw new Error('Ese TAG ya existe en el C3-200');

    const profile=await resolveAuthorizationProfile(client,casa.id);

    await client.setRecord('user',{
      UID:ids.uid,
      CardNo:Number(card),
      Pin:Number(ids.pin),
      Password:'',
      Group:1,
      StartTime:toDateNumber(start),
      EndTime:toDateNumber(end),
      Name:displayName,
      SuperAuthorize:0
    });

    // Mandatory read-back: never report success until the controller itself returns the new CardNo.
    const afterUser=await client.getData('user');
    const created=afterUser.find(r=>normalizeCardKey(r.CardNo)===card);
    if(!created) throw new Error('El C3-200 no confirmó el alta del TAG. No se guardó en la aplicación.');

    const realPin=String(created.Pin??ids.pin).trim();
    await client.setRecord('userauthorize',{
      Pin:Number(realPin),
      AuthorizeTimezoneId:profile.timezoneId,
      AuthorizeDoorId:profile.doorMask
    });

    const afterAuth=await client.getData('userauthorize');
    const auth=afterAuth.find(r=>String(r.Pin??'').trim()===realPin);
    if(!auth||Number(auth.AuthorizeDoorId||0)===0){
      throw new Error('El TAG existe en el C3-200 pero no quedó autorizado para abrir puertas.');
    }

    return {
      uid:Number(created.UID||ids.uid)||ids.uid,
      pin:realPin,
      cardNo:String(created.CardNo??card),
      timezoneId:Number(auth.AuthorizeTimezoneId||profile.timezoneId),
      doorMask:Number(auth.AuthorizeDoorId||profile.doorMask)
    };
  });

  const realCard=canonicalCardNo(result.cardNo);
  const tarjeta=await ZkTarjeta.create({
    casaId:Number(casa.id),
    uidDispositivo:result.uid,
    numeroTarjeta:realCard,
    pinDispositivo:result.pin,
    nombreDispositivo:displayName,
    departamento:`${canonicalStreet(casa.calle)} ${casa.numero}`,
    grupoDispositivo:1,
    puertasAutorizadas:result.doorMask,
    timezoneId:result.timezoneId,
    fechaInicio:start,
    fechaFin:end,
    bloqueado:false,
    origen:'APP',
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

async function dashboard({calle,numero,buscar}={}){
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
  const houses=await Casa.findAll({
    where,
    attributes:['id','calle','numero','controles'],
    order:[['calle','ASC'],['numero','ASC']],
    limit:300
  });
  const cards=await ZkTarjeta.findAll({order:[['numeroTarjeta','ASC']]});
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

  let rows=houses
    .filter(h=>canonicalOnlyHouse(h.calle,h.numero))
    .map(h=>{
      const controls=normalizeTokens(h.controles);
      const matched=[];
      const seen=new Set();

      for(const rawCard of controls){
        const card=byNormalizedCard.get(normalizeCardKey(rawCard));
        if(card&&!seen.has(card.id)){matched.push(card);seen.add(card.id);}
      }
      for(const card of (byHouse.get(Number(h.id))||[])){
        if(!seen.has(card.id)){matched.push(card);seen.add(card.id);}
      }

      const matchedKeys=new Set(matched.map(card=>normalizeCardKey(card.numeroTarjeta)));
      const unresolved=controls.filter(raw=>!matchedKeys.has(normalizeCardKey(raw)));

      return {
        id:h.id,
        calle:canonicalStreet(h.calle),
        numero:h.numero,
        controles:controls,
        controlesNoEnlazados:unresolved,
        tarjetas:matched.map(card=>({
          id:card.id,
          numeroTarjeta:String(card.numeroTarjeta),
          pin:card.pinDispositivo,
          departamento:card.departamento,
          nombreDispositivo:card.nombreDispositivo,
          bloqueado:Boolean(card.bloqueado),
          puertasAutorizadas:card.puertasAutorizadas,
          fechaInicio:card.fechaInicio,
          fechaFin:card.fechaFin,
          ultimaLectura:card.ultimaLectura
        }))
      };
    });
  if(buscar){
    const q=String(buscar).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    rows=rows.filter(r=>[r.calle,r.numero,...r.controles,...r.tarjetas.map(t=>t.departamento||'')]
      .join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));
  }
  return rows;
}

module.exports={testDirectConnection,syncUsers,setCardBlocked,setHouseBlocked,setCardHouse,createTagForHouse,operateGate,dashboard,writeUserValidity};
