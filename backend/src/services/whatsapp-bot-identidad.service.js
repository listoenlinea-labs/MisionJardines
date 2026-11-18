'use strict';
// Un número de WhatsApp solo es una pista para simplificar el formulario.
// NO autentica al residente: toda operación privada sigue pasando por la
// vinculación HTTPS, UsuarioCasa y la vigencia de su sesión.
const {Usuario,UsuarioCasa,Rol}=require('../models');
const {filtroTelefono,normalizarTelefono}=require('./telefono-cuenta.service');

function clasificarCoincidencia(usuarios,viviendas=[]){
 if(!Array.isArray(usuarios)||usuarios.length===0)return {tipo:'desconocido'};
 // Un teléfono compartido o duplicado NO selecciona una vivienda al azar.
 if(usuarios.length!==1)return {tipo:'ambiguo'};
 const usuario=usuarios[0];
 if(usuario.estatus!=='ACTIVO'||usuario.cuentaAceptada===false||
    usuario.rol?.nombre!=='CONDOMINO'||usuario.rol?.activo===false)
  return {tipo:'sin_acceso'};
 const casas=[...new Set(viviendas.filter(v=>v.activo!==false&&Number.isSafeInteger(Number(v.casaId))&&
    Number(v.casaId)>0).map(v=>Number(v.casaId)))];
 if(casas.length===1)return {tipo:'unico',usuarioId:Number(usuario.id),casaId:casas[0]};
 return {tipo:casas.length>1?'varias_viviendas':'sin_vivienda'};
}
async function reconocer(phone){
 // Normalizar 521 a 52: el remitente de la Cloud API puede incluir el 1 MX.
 if(!normalizarTelefono(phone))return {tipo:'desconocido'};
 const usuarios=await Usuario.findAll({
  where:filtroTelefono(phone,'Usuario'),
  attributes:['id','estatus','cuentaAceptada','telefono'],
  include:[{model:Rol,as:'rol',attributes:['nombre','activo']}],
  limit:3
 });
 if(usuarios.length!==1)return clasificarCoincidencia(usuarios);
 const casas=await UsuarioCasa.findAll({where:{usuarioId:usuarios[0].id,activo:true},
  attributes:['casaId','activo'],limit:50});
 return clasificarCoincidencia(usuarios,casas);
}
module.exports={reconocer,clasificarCoincidencia};
