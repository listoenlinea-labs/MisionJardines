'use strict';
// Un registro compartido por instalación. Las transacciones cortas serializan
// órdenes y cambios de IP entre procesos; ninguna operación TCP dentro del lock.
const db=()=>require('../config/database');
let initialization;
async function ensure(){
  if(!initialization)initialization=(async()=>{
    await db().query(`CREATE TABLE IF NOT EXISTS infraestructura_estado (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      estado LONGTEXT NOT NULL
    ) ENGINE=InnoDB`);
    await db().query(`CREATE TABLE IF NOT EXISTS infraestructura_eventos (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      evento LONGTEXT NOT NULL
    ) ENGINE=InnoDB`);
    await db().query("INSERT INTO infraestructura_estado (id,estado) VALUES (1,'{}') ON DUPLICATE KEY UPDATE id=id");
  })().catch(error=>{initialization=null;throw error;});
  return initialization;
}
function decode(value){return typeof value==='string'?JSON.parse(value):value;}
async function read(){
  await ensure();
  const [rows]=await db().query('SELECT estado FROM infraestructura_estado WHERE id=1');
  if(!rows.length)throw Error('Estado de infraestructura no disponible');
  return decode(rows[0].estado);
}
async function mutate(fn){
  await ensure();
  return db().transaction(async transaction=>{
    const [rows]=await db().query('SELECT estado FROM infraestructura_estado WHERE id=1 FOR UPDATE',{transaction});
    if(!rows.length)throw Error('Estado de infraestructura no disponible');
    const state=decode(rows[0].estado),events=[];
    const result=fn(state,event=>events.push(event));
    // fn es síncrona deliberadamente; no mantener locks durante operaciones de red.
    if(result&&typeof result.then==='function')throw Error('Mutación de infraestructura asíncrona');
    await db().query('UPDATE infraestructura_estado SET estado=? WHERE id=1',{replacements:[JSON.stringify(state)],transaction});
    for(const event of events)await db().query('INSERT INTO infraestructura_eventos (evento) VALUES (?)',{replacements:[JSON.stringify(event)],transaction});
    return result;
  });
}
async function history(){
  await ensure();
  const [rows]=await db().query('SELECT evento FROM infraestructura_eventos ORDER BY id DESC LIMIT 500');
  return rows.map(row=>decode(row.evento));
}
module.exports={ensure,read,mutate,history};
