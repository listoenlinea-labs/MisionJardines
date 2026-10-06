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
  const rows=await withC3(client=>client.getData('user'));
  const houses=await Casa.findAll({attributes:['id','calle','numero','controles']});
  const byCard=new Map();
  for(const house of houses){
    for(const token of normalizeTokens(house.controles)) byCard.set(token,String(house.id));
  }
  let processed=0, linked=0;
  for(const row of rows){
    const card=String(row.CardNo??'').trim();
    if(!card || card==='0') continue;
    const casaId=byCard.has(card)?Number(byCard.get(card)):null;
    if(casaId) linked++;
    await ZkTarjeta.upsert({
      numeroTarjeta:card,
      pinDispositivo:String(row.Pin??'').trim()||null,
      departamento:String(row.Name??row.Group??'').trim()||null,
      fechaInicio:fromDateNumber(row.StartTime),
      fechaFin:fromDateNumber(row.EndTime),
      casaId,
      ultimaLectura:new Date()
    });
    processed++;
  }
  return {ok:true,totalPanel:rows.length,procesados:processed,vinculados:linked};
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
  if(calle) where.calle={ [Op.like]: `%${calle}%` };
  if(numero) where.numero={ [Op.like]: `%${numero}%` };
  const houses=await Casa.findAll({
    where,
    attributes:['id','calle','numero','controles'],
    order:[['calle','ASC'],['numero','ASC']],
    limit:300
  });
  const cards=await ZkTarjeta.findAll({order:[['numeroTarjeta','ASC']]});
  const cardMap=new Map(cards.map(c=>[String(c.numeroTarjeta),c]));
  let rows=houses
    .filter(h=>canonicalOnlyHouse(h.calle,h.numero))
    .map(h=>{
      const controls=normalizeTokens(h.controles);
      const mapped=controls.map(card=>cardMap.get(card)).filter(Boolean);
      return {
        id:h.id,calle:canonicalStreet(h.calle),numero:h.numero,controles:controls,
        tarjetas:mapped.map(c=>({
          id:c.id,numeroTarjeta:c.numeroTarjeta,pin:c.pinDispositivo,
          departamento:c.departamento,bloqueado:Boolean(c.bloqueado),
          fechaInicio:c.fechaInicio,fechaFin:c.fechaFin,ultimaLectura:c.ultimaLectura
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

module.exports={testDirectConnection,syncUsers,setCardBlocked,setHouseBlocked,operateGate,dashboard,writeUserValidity};
