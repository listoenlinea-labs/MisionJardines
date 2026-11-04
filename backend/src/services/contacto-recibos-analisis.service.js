'use strict';
const {Casa}=require('../models');

// Los datos pertenecen a la vivienda: NO reescribir usuarios ni condóminos.
const error=(status,message)=>Object.assign(new Error(message),{status});
function telefonoMX(valor){
 if(typeof valor!=='string')throw error(400,'Ingresa un teléfono válido.');
 const text=valor.trim();
 if(!text||text.length>30||!/^[\d\s().+-]+$/.test(text))
  throw error(400,'Ingresa un teléfono de México válido (10 dígitos o prefijo 52).');
 let digits=text.replace(/\D/g,'');
 if(/^521\d{10}$/.test(digits))digits='52'+digits.slice(3);
 if(/^\d{10}$/.test(digits))digits='52'+digits;
 if(!/^52\d{10}$/.test(digits))throw error(400,'Ingresa 10 dígitos de México o el prefijo 52.');
 return digits;
}
function correoValido(valor){
 if(typeof valor!=='string')throw error(400,'Ingresa un correo válido.');
 const text=valor.trim();
 // direcciones.correo VARCHAR(150): nunca producir truncamiento en MySQL.
 if(text.length<3||text.length>150||!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(text))
  throw error(400,'Ingresa un solo correo válido de máximo 150 caracteres.');
 return text;
}
async function guardarContacto(casaId,campo,valor,actor){
 const id=Number(casaId);
 if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(Number(actor))||Number(actor)<1)
  throw error(400,'Vivienda o administrador inválidos.');
 if(!['telefono','correo'].includes(campo))throw error(400,'Campo de contacto inválido.');
 const normalized=campo==='telefono'?telefonoMX(valor):correoValido(valor);
 const casa=await Casa.findByPk(id,{attributes:['id','telefono','correo']});
 if(!casa)throw error(404,'Vivienda no encontrada.');
 if(String(casa[campo]||'').trim()!==normalized){
  // Se actualiza UNA sola columna, nunca el usuario vinculado.
  await casa.update({[campo]:normalized},{fields:[campo]});
 }
 console.info('[recibos] Contacto de vivienda guardado',{casaId:id,campo,actorId:Number(actor)});
 return {casaId:id,campo,valor:normalized,guardado:true};
}
module.exports={telefonoMX,correoValido,guardarContacto};
