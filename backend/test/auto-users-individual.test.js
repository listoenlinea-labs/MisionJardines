const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/auto-users-fixture');
process.env.JWT_SECRET='synthetic-individual-secret';
const datos=(patch={})=>({casaId:11,nombreCompleto:'Residente Nuevo Ejemplo',correo:'nuevo@example.com',telefono:'',claveSolicitud:'a'.repeat(32),...patch});
const tokenFrom=f=>new URLSearchParams(new URL(f.sent.at(-1).enlace).hash.slice(1)).get('invitacion');

test('Alta individual crea persona, relación y cuenta pendiente sin correo ni acceso automático',async()=>{
 const f=fixture(),r=await f.service.crearIndividual(datos({correo:' NUEVO@EXAMPLE.COM ',rolId:1,cuentaAceptada:true,estatus:'ACTIVO',nombreUsuario:'administrador'}));
 assert.equal(r.resultado,'CREADO');assert.equal(r.cuentaAceptada,false);
 const user=f.tables.Usuario.find(u=>u.id===r.usuarioId);
 assert.equal(user.correo,'nuevo@example.com');assert.equal(user.nombreUsuario,user.correo);
 assert.equal(user.casaId,11);assert.equal(user.rolId,3);assert.equal(user.estatus,'PENDIENTE');
 assert.equal(user.cuentaAceptada,false);assert.equal(user.telefono,null);
 assert.match(user.observaciones,/^AUTO_USERS_INDIVIDUAL:/);
 assert.match(user.contrasenaHash,/^synthetic-hash:/);assert.equal(f.sent.length,0);
 assert.deepEqual(f.tables.CondominoVivienda.filter(v=>v.condominoId===r.condominoId).map(v=>[v.viviendaId,v.activo]),[[11,true]]);
 assert.deepEqual(f.tables.UsuarioCasa.map(v=>[v.casaId,v.activo]),[[11,false]]);
 assert.equal(f.tables.Invitacion[0].envioEstado,'SIN_ENVIAR');
 assert.equal(f.tables.Condomino.length,2);
});
test('Reintentos concurrentes con la misma solicitud crean una sola cuenta y no duplican condóminos',async()=>{
 const f=fixture(),[a,b]=await Promise.all([f.service.crearIndividual(datos()),f.service.crearIndividual(datos())]);
 assert.equal(a.usuarioId,b.usuarioId);assert.equal(f.tables.Usuario.length,1);assert.equal(f.tables.Condomino.length,2);
 assert.equal(f.tables.Invitacion.length,1);assert.equal(f.tables.UsuarioCasa.length,1);
 await assert.rejects(f.service.crearIndividual(datos({casaId:10})),{status:409});
 assert.equal(f.tables.Usuario.length,1);
});
test('Correo duplicado, usuario reservado y correo ya en el padrón no crean personas huérfanas',async()=>{
 const f=fixture();await f.service.crearIndividual(datos());const before=structuredClone(f.tables);
 await assert.rejects(f.service.crearIndividual(datos({claveSolicitud:'b'.repeat(32)})),{status:409});
 assert.deepEqual(f.tables,before);
 await assert.rejects(f.service.crearIndividual(datos({correo:'persona1@example.com'})),{status:409});
 assert.deepEqual(f.tables,before);
 f.tables.Usuario.push({id:9,nombreUsuario:'reservado@example.com',correo:null});
 await assert.rejects(f.service.crearIndividual(datos({correo:'reservado@example.com'})),{status:409});
 assert.equal(f.tables.Condomino.length,2);
});
test('Valida vivienda, nombre, correo, teléfono y clave en servidor sin crear registros',async()=>{
 for(const patch of [{casaId:0},{casaId:999},{casaId:'abc'},{nombreCompleto:''},{nombreCompleto:'a'.repeat(181)},
  {correo:''},{correo:'incorrecto'},{correo:'a@example.com,b@example.com'},{correo:'a'.repeat(145)+'@test.com'},
  {telefono:'1'.repeat(26)},{claveSolicitud:'invalida'}]){
  const f=fixture(),before=structuredClone(f.tables);
  await assert.rejects(f.service.crearIndividual(datos(patch)),{status:400});
  assert.deepEqual(f.tables,before);
 }
 const f=fixture();f.tables.Casa.push({id:12,calle:'Guadalajara',numero:'1'});
 await assert.rejects(f.service.crearIndividual(datos({casaId:12})),{status:400});
 assert.equal(f.tables.Usuario.length,0);
});
test('Fallo al preparar la cuenta revierte también el condómino y la relación nuevos',async()=>{
 const f=fixture();f.tables.Rol[0].activo=false;const before=structuredClone(f.tables);
 await assert.rejects(f.service.crearIndividual(datos()),{status:503});
 assert.deepEqual(f.tables,before);
});
test('Crear un nuevo residente conserva la cuenta y los vínculos del residente anterior',async()=>{
 const f=fixture();await f.service.createOne(1);
 Object.assign(f.tables.Usuario[0],{estatus:'ACTIVO',cuentaAceptada:true});f.tables.UsuarioCasa[0].activo=true;
 const anterior=structuredClone(f.tables.Usuario[0]),vinculo=structuredClone(f.tables.UsuarioCasa[0]);
 const r=await f.service.crearIndividual(datos({casaId:10}));
 assert.notEqual(r.usuarioId,anterior.id);assert.deepEqual(f.tables.Usuario[0],anterior);
 assert.deepEqual(f.tables.UsuarioCasa[0],vinculo);assert.equal(f.tables.Casa.length,2);
 assert.equal(f.tables.CondominoVivienda.filter(v=>v.viviendaId===10&&v.activo).length,2);
});
test('Invitación individual usa el correo capturado y aceptación activa solo la vivienda elegida',async()=>{
 const f=fixture(),r=await f.service.crearIndividual(datos());
 await f.service.enviarLote(0,r.usuarioId);
 assert.equal(f.sent.length,1);assert.equal(f.sent[0].correo,'nuevo@example.com');assert.equal(f.sent[0].domicilio,'Otra Calle A-2');
 const body={nombreUsuario:'nuevo@example.com',correo:'nuevo@example.com',contrasena:'ClavePrueba123',confirmarContrasena:'ClavePrueba123',numeroConfirmado:'A-2'};
 await f.service.aceptar(tokenFrom(f),body);
 const user=f.tables.Usuario.find(u=>u.id===r.usuarioId);
 assert.equal(user.cuentaAceptada,true);assert.equal(user.estatus,'ACTIVO');
 assert.deepEqual(f.tables.UsuarioCasa.filter(v=>v.usuarioId===user.id&&v.activo).map(v=>v.casaId),[11]);
 const retry=await f.service.crearIndividual(datos());assert.equal(retry.usuarioId,user.id);assert.equal(retry.cuentaAceptada,true);
 assert.equal(f.tables.Usuario.length,1);
 await assert.rejects(f.service.aceptar(tokenFrom(f),body),{status:410});
});
test('Un fallo SMTP deja la cuenta pendiente y permite enviar de nuevo sin recrearla',async()=>{
 const f=fixture(),r=await f.service.crearIndividual(datos());f.failSend(true);
 const result=await f.service.enviarLote(0,r.usuarioId);assert.equal(result.resultados[0].resultado,'ERROR');
 assert.equal(f.tables.Usuario[0].cuentaAceptada,false);assert.equal(f.tables.UsuarioCasa[0].activo,false);
 f.failSend(false);await f.service.enviarLote(0,r.usuarioId);assert.equal(f.sent.length,1);assert.equal(f.tables.Usuario.length,1);
});
