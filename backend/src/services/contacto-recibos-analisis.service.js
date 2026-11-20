'use strict';
const {Casa}=require('../models');
const sequelize=require('../config/database');
const {domicilioDesdeCasa}=require('./vivienda-conmutador-correspondencia.service');
const {asegurarContactosAdministrados,obtenerContactosAdministrados,buscarTelefonosConmutador,guardarContactosAdministrados}=require('./conmutador-padron.service');

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
 const casa=await Casa.findByPk(id,{attributes:['id','telefono','correo','calle','calleCorrecta','numero']});
 if(!casa)throw error(404,'Vivienda no encontrada.');
 if(campo==='telefono') {
  const domicilio=domicilioDesdeCasa(casa);
  if(domicilio){
   // Preparar el esquema y recuperar B antes de abrir una transacción:
   // no ejecutar DDL dentro de la transacción del contacto.
   await asegurarContactosAdministrados();
   const administrados=await obtenerContactosAdministrados(domicilio);
   const actuales=administrados===null?await buscarTelefonosConmutador(domicilio):administrados;
   await sequelize.transaction(async transaction=>{
    if(String(casa.telefono||'').trim()!==normalized)
     await casa.update({telefono:normalized},{fields:['telefono'],transaction});
    await guardarContactosAdministrados(domicilio,[normalized.slice(2),actuales[1]||''],Number(actor),transaction);
   });
  }else if(String(casa.telefono||'').trim()!==normalized){
   // Una vivienda no mapeada no puede sincronizarse con otra por coincidencia parcial.
   await casa.update({telefono:normalized},{fields:['telefono']});
  }
 }else if(String(casa.correo||'').trim()!==normalized){
  await casa.update({correo:normalized},{fields:['correo']});
 }
 console.info('[recibos] Contacto de vivienda guardado',{casaId:id,campo,actorId:Number(actor)});
 return {casaId:id,campo,valor:normalized,guardado:true};
}
module.exports={telefonoMX,correoValido,guardarContacto};
