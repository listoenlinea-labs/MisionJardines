const { Op } = require('sequelize');
const ZkTarjeta=require('../models/ZkTarjeta');
const Casa=require('../models/Casa');

const clean=v=>String(v??'').trim();
const normalizeStreetKey=value=>clean(value)
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toUpperCase().replace(/\./g,'').replace(/\s+/g,' ').trim();

function splitDepartment(deptName){
  const raw=clean(deptName).replace(/\s+/g,' ').trim();
  if(!raw) return null;
  const m=raw.match(/^(.*?)[\s-]+([0-9]+(?:\.[0-9]+)?)$/);
  if(!m) return null;
  let street=m[1].trim();
  const number=m[2].trim();
  const key=normalizeStreetKey(street);
  if(key==='ATOTONILCO'||key==='AV ATOTONILCO'||key==='AVENIDA ATOTONILCO') street='Av. Atotonilco';
  else if(key==='GUADALAJARA'||key==='AV GUADALAJARA'||key==='AVENIDA GUADALAJARA') street='Av. Guadalajara';
  else if(key==='VALLE DE MEXICO'||key==='AV VALLE DE MEXICO'||key==='AVENIDA VALLE DE MEXICO') street='Av. Valle de México';
  else street=street.replace(/\bAVENIDA\b/i,'Av.').replace(/\bAV\b/i,'Av.').replace(/\s+/g,' ').trim();
  return {street,number};
}

async function findHouseByDepartment(name){
  const parsed=splitDepartment(name);
  if(!parsed) return null;
  const houses=await Casa.findAll({
    where:{numero:parsed.number},
    attributes:['id','calle','numero','controles']
  });
  const wanted=normalizeStreetKey(parsed.street);
  return houses.find(h=>normalizeStreetKey(h.calle)===wanted)||null;
}

function mergeControls(raw,cards){
  const all=new Set(String(raw||'').split(/[\s,;|/]+/).map(v=>v.trim()).filter(Boolean));
  for(const c of cards) all.add(String(c));
  return [...all].join(', ');
}

async function importZkAccessMdb(buffer){
  if(!buffer?.length) throw new Error('Archivo MDB vacío');
  const module=await import('mdb-reader');
  const MDBReader=module.default||module.MDBReader||module;
  const reader=new MDBReader(buffer);
  const names=reader.getTableNames();
  if(!names.includes('USERINFO')||!names.includes('DEPARTMENTS')){
    throw new Error('El respaldo no contiene USERINFO y DEPARTMENTS');
  }

  const users=reader.getTable('USERINFO').getData();
  const departments=reader.getTable('DEPARTMENTS').getData();
  const deptById=new Map(departments.map(d=>[String(d.DEPTID),clean(d.DEPTNAME)]));
  const cardsByHouse=new Map();
  let processed=0,linked=0,missingHouse=0,missingCard=0;

  for(const user of users){
    const card=clean(user.CardNo||user.CARDNO||user.Badgenumber);
    if(!card||card==='0') { missingCard++; continue; }
    const deptId=user.DEFAULTDEPTID??user.DefaultDeptID??user.defaultdeptid;
    const deptName=deptById.get(String(deptId))||'';
    const house=deptName?await findHouseByDepartment(deptName):null;
    const existing=await ZkTarjeta.findOne({where:{numeroTarjeta:card}});
    if(existing){
      await existing.update({
        departamentoId:Number(deptId)||null,
        departamento:deptName||existing.departamento,
        casaId:house?.id??existing.casaId,
        ultimaLectura:existing.ultimaLectura||new Date()
      });
    }else{
      await ZkTarjeta.create({
        numeroTarjeta:card,
        pinDispositivo:clean(user.Badgenumber)||null,
        departamentoId:Number(deptId)||null,
        departamento:deptName||null,
        casaId:house?.id||null,
        origen:'ZKTECO'
      });
    }
    processed++;
    if(house){
      linked++;
      const list=cardsByHouse.get(Number(house.id))||[];
      list.push(card);
      cardsByHouse.set(Number(house.id),list);
    }else if(deptName){
      missingHouse++;
    }
  }

  for(const [houseId,cards] of cardsByHouse){
    const house=await Casa.findByPk(houseId,{attributes:['id','controles']});
    if(house){
      // The ZKAccess mapping is authoritative for the house's real CardNo identifiers.
      await house.update({controles:mergeControls('',cards)});
    }
  }

  return {
    ok:true,
    usuariosMdb:users.length,
    departamentosMdb:departments.length,
    procesados:processed,
    vinculados:linked,
    departamentosSinCasa:missingHouse,
    usuariosSinTarjeta:missingCard
  };
}

module.exports={importZkAccessMdb,splitDepartment};
