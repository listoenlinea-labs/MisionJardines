const ZkTarjeta=require('../models/ZkTarjeta');
const Casa=require('../models/Casa');
const {
  testDirectConnection,
  syncUsers,
  diagnosticarVivienda,
  setCardBlocked,
  setHouseBlocked,
  setCardHouse,
  createTagForHouse,
  addExistingTagToController,
  editTag,
  removeTag,
  operateGate,
  dashboard,
  writeUserValidity
}=require('../services/zkteco-direct.service');
const {simularCorte}=require('../services/zkteco-read.service');
const {runAutoSync,getZktecoAutoSyncStatus}=require('../services/zkteco-autosync.service');
const {importZkAccessMdb}=require('../services/zkteco-mdb.service');
const {isPullSdkBridgeConfigured,testBridge,describeFetchError}=require('../services/zkteco-pullsdk-bridge.service');
const {recordZkError,listZkErrors,exactError}=require('../services/zkteco-error-log.service');

async function estado(req,res){
  try{
    const info=await testDirectConnection();
    const bridge=isPullSdkBridgeConfigured()?await testBridge():{configured:false};
    res.json({ok:true,data:{
      ...info,
      modelo:'C3-200',
      modo:'DIRECT',
      conexionDirecta:true,
      escrituraUsuarios:isPullSdkBridgeConfigured()?'PULLSDK':'NO_CONFIGURADA',
      bridge,
      tarjetas:await ZkTarjeta.count(),
      inventarioAuto:getZktecoAutoSyncStatus()
    }});
  }catch(error){
    res.status(503).json({ok:false,message:'No fue posible conectar directamente con el ZKTeco',error:error.message});
  }
}
async function inventario(req,res){
  const rows=await ZkTarjeta.findAll({order:[['departamento','ASC'],['numeroTarjeta','ASC']],limit:2000});
  res.json({ok:true,total:rows.length,data:rows});
}
async function diagnosticoVivienda(req,res){
  try{
    const data=await diagnosticarVivienda(req.params.id);
    return res.json({ok:true,data});
  }catch(error){
    await recordZkError(req,'DIAGNOSTICO_C3',error,{casaId:req.params.id});
    return res.status(error.status||502).json({
      ok:false,message:'No fue posible verificar el inventario físico del C3',error:exactError(error)
    });
  }
}
async function vigenciaVivienda(req,res){
  try{
    const id=Number(req.params.id);
    if(!Number.isSafeInteger(id)||id<=0)
      return res.status(400).json({ok:false,message:'ID de vivienda inválido'});
    const casa=await Casa.findByPk(id,{attributes:['id','calle','numero']});
    if(!casa)return res.status(404).json({ok:false,message:'Vivienda inexistente en direcciones'});
    const info=await require('../services/vigencia-mantenimiento.service').estadoCasa(id);
    return res.json({ok:true,data:{
      casaId:id,configurada:!info.pendienteConfiguracion,fechaFinal:info.fechaFinal,soloReferencia:true
    }});
  }catch(error){
    return res.status(503).json({ok:false,message:'No se pudo consultar la vigencia de la vivienda',error:error.message});
  }
}

async function sincronizar(req,res){
  try{res.json({ok:true,data:await runAutoSync(),message:'Usuarios sincronizados desde el C3-200'});}
  catch(error){res.status(502).json({ok:false,message:'No fue posible sincronizar el C3-200',error:error.message});}
}
async function bloquear(req,res){
  try{
    const blocked=Boolean(req.body.bloqueado);
    const data=await setCardBlocked(req.params.id,blocked);
    res.json({ok:true,message:blocked?'Control bloqueado':'Control habilitado',data});
  }catch(error){
    await recordZkError(req,Boolean(req.body.bloqueado)?'BLOQUEAR_TAG':'ACTIVAR_TAG',error,{tarjetaId:req.params.id});
    res.status(502).json({ok:false,message:'No fue posible modificar el control en ZKTeco',error:exactError(error)});
  }
}
async function actualizarVigencia(req,res){
  try{
    const tarjeta=await ZkTarjeta.findByPk(req.params.id);
    if(!tarjeta)return res.status(404).json({ok:false,message:'Tarjeta no encontrada'});
    const fechaInicio=String(req.body.fechaInicio||'').trim()||null;
    const fechaFin=String(req.body.fechaFin||'').trim()||null;
    await writeUserValidity(tarjeta.numeroTarjeta,fechaInicio,fechaFin);
    await tarjeta.update({fechaInicio,fechaFin,bloqueado:false,fechaFinOriginal:null,ultimaLectura:new Date()});
    res.json({ok:true,message:'Vigencia actualizada en el C3-200',data:tarjeta});
  }catch(error){
    await recordZkError(req,'EDITAR_VIGENCIA_TAG',error,{
      tarjetaId:req.params.id,
      detalle:JSON.stringify({fechaInicio:req.body?.fechaInicio||null,fechaFin:req.body?.fechaFin||null})
    });
    res.status(502).json({ok:false,message:'No fue posible actualizar la vigencia',error:exactError(error)});
  }
}
async function actualizarVigenciaViviendaTags(req,res){
  const casaId=Number(req.params.id);
  const fechaFin=String(req.body?.fechaFin||'').trim();
  if(!Number.isSafeInteger(casaId)||casaId<1)return res.status(400).json({ok:false,message:'Vivienda inválida'});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fechaFin)||Number.isNaN(Date.parse(fechaFin+'T12:00:00Z'))||
     new Date(fechaFin+'T12:00:00Z').toISOString().slice(0,10)!==fechaFin)
     return res.status(400).json({ok:false,message:'Fecha final inválida'});
  try{
    const Casa=require('../models/Casa');
    const casa=await Casa.findByPk(casaId);
    if(!casa)return res.status(404).json({ok:false,message:'Vivienda no encontrada'});
    const tags=await ZkTarjeta.findAll({where:{casaId},order:[['id','ASC']]});
    if(!tags.length)return res.status(409).json({ok:false,message:'Esta vivienda no tiene TAGs asociados'});
    const resultados=[];
    for(const tag of tags){
      try{
        // Skip a TAG already at the requested physical expiration. This makes retries safe.
        const actual=await require('../services/zkteco-direct.service').readUserValidity(tag.numeroTarjeta);
        if(actual.fechaFinal!==fechaFin){
          // Direct TCP; preserve StartTime and door authorizations.
          await writeUserValidity(tag.numeroTarjeta,null,fechaFin,{mode:'DIRECT',expectedEnd:actual.fechaFinal,expectedPin:actual.pin});
        }
        await tag.update({fechaFin,fechaFinOriginal:tag.fechaFinOriginal?fechaFin:null,ultimaLectura:new Date()});
        resultados.push({numeroTarjeta:tag.numeroTarjeta,ok:true,estado:'CONFIRMADO'});
      }catch(error){
        resultados.push({numeroTarjeta:tag.numeroTarjeta,ok:false,error:error.message});
        await recordZkError(req,'VIGENCIA_VIVIENDA_TAG',error,{casaId,numeroTarjeta:tag.numeroTarjeta});
      }
    }
    const errores=resultados.filter(item=>!item.ok);
    return res.status(errores.length?207:200).json({ok:!errores.length,
      message:errores.length?'Se confirmaron '+(resultados.length-errores.length)+' de '+resultados.length+' TAGs. Pendientes: '+errores.map(x=>x.numeroTarjeta).join(', '):'Vigencia confirmada en todos los TAGs del C3',
      data:{casaId,fechaFin,resultados}});
  }catch(error){
    await recordZkError(req,'VIGENCIA_VIVIENDA',error,{casaId});
    return res.status(502).json({ok:false,message:'No fue posible actualizar la vigencia de la vivienda',error:exactError(error)});
  }
}
async function bloquearVivienda(req,res){
  try{
    const blocked=Boolean(req.body.bloqueado);
    const data=await setHouseBlocked(req.params.id,blocked);
    res.json({ok:true,message:blocked?'Vivienda bloqueada en ZKTeco':'Vivienda habilitada en ZKTeco',data});
  }catch(error){
    await recordZkError(req,Boolean(req.body.bloqueado)?'BLOQUEAR_VIVIENDA':'ACTIVAR_VIVIENDA',error,{
      casaId:req.params.id,
      detalle:error.results?JSON.stringify(error.results):null
    });
    res.status(502).json({ok:false,message:error.message||'No fue posible modificar los controles de la vivienda',error:exactError(error),data:error.results||null});
  }
}
async function asignarTarjeta(req,res){
  try{
    const casaId=Number(req.body.casaId);
    if(!Number.isInteger(casaId)||casaId<=0)return res.status(400).json({ok:false,message:'Vivienda inválida'});
    const data=await setCardHouse(req.params.id,casaId);
    res.json({ok:true,message:'Control asignado a la vivienda',data});
  }catch(error){
    await recordZkError(req,'ASIGNAR_TAG_VIVIENDA',error,{tarjetaId:req.params.id,casaId:req.body?.casaId});
    res.status(502).json({ok:false,message:error.message||'No fue posible asignar el control',error:exactError(error)});
  }
}
async function crearTarjeta(req,res){
  try{
    const data=await createTagForHouse(req.params.id,req.body||{},req.usuario?.usuarioId||null);
    res.status(201).json({ok:true,
      message:data.vigenciaError
        ? 'TAG creado y autorizado en C3, pero la vigencia requiere atención'
        : 'TAG creado y autorizado en el C3-200; casa_id y vigencia vinculados',
      data});
  }catch(error){
    await recordZkError(req,'CREAR_TAG',error,{
      casaId:req.params.id,
      numeroTarjeta:req.body?.numeroTarjeta,
      detalle:JSON.stringify({fechaInicio:req.body?.fechaInicio||null,fechaFin:req.body?.fechaFin||null})
    });
    res.status(error.status||502).json({ok:false,message:error.message||'No fue posible crear el TAG en ZKTeco',error:exactError(error)});
  }
}
async function editarTarjeta(req,res){
  try{
    if(Object.prototype.hasOwnProperty.call(req.body||{},'fechaInicio')||Object.prototype.hasOwnProperty.call(req.body||{},'fechaFin'))return res.status(400).json({ok:false,message:'Las fechas solo se modifican desde Editar vigencia de la vivienda'});
    const data=await editTag(req.params.id,req.body||{});
    res.json({
      ok:true,
      message:data.numeroCambiado||data.viviendaCambiada
        ? 'TAG actualizado en el C3-200 y en la vivienda'
        : 'TAG actualizado correctamente',
      data
    });
  }catch(error){
    await recordZkError(req,'EDITAR_TAG',error,{
      tarjetaId:req.params.id,
      numeroTarjeta:req.body?.numeroTarjeta,
      detalle:JSON.stringify({
        calle:req.body?.calle||null,
        numero:req.body?.numero||null,
        fechaInicio:req.body?.fechaInicio||null,
        fechaFin:req.body?.fechaFin||null
      })
    });
    res.status(502).json({
      ok:false,
      message:error.message||'No fue posible editar el TAG',
      error:exactError(error)
    });
  }
}

async function agregarExistenteC3(req,res){
  try{
    const data=await addExistingTagToController(req.params.id);
    res.json({ok:true,message:'TAG agregado y autorizado en el C3-200',data});
  }catch(error){
    const detail=describeFetchError(error);
    await recordZkError(req,'AGREGAR_TAG_C3',error,{tarjetaId:req.params.id});
    console.error('Error agregando TAG al C3-200:',{
      detail,
      name:error?.name||null,
      code:error?.code||error?.cause?.code||null,
      cause:error?.cause?.message||null,
      stack:error?.stack||null
    });
    res.status(502).json({
      ok:false,
      message:detail||'No fue posible agregar el TAG al C3-200',
      error:detail
    });
  }
}

async function eliminarTarjeta(req,res){
  try{
    const data=await removeTag(req.params.id);
    res.json({
      ok:true,
      message:data.removedFromController
        ? 'TAG eliminado del C3-200 y de la aplicación'
        : 'TAG eliminado de la aplicación; ya no existía en el C3-200',
      data
    });
  }catch(error){
    const detail=describeFetchError(error);
    await recordZkError(req,'ELIMINAR_TAG',error,{tarjetaId:req.params.id});
    console.error('Error eliminando TAG del C3-200:',{
      detail,
      name:error?.name||null,
      code:error?.code||error?.cause?.code||null,
      cause:error?.cause?.message||null,
      stack:error?.stack||null
    });
    res.status(502).json({
      ok:false,
      message:detail||'No fue posible eliminar el TAG del C3-200',
      error:detail
    });
  }
}
async function logs(req,res){
  try{
    const rows=await listZkErrors({limit:req.query.limit});
    res.json({ok:true,total:rows.length,data:rows});
  }catch(error){
    res.status(500).json({ok:false,message:'No fue posible consultar los logs de ZKTeco',error:exactError(error)});
  }
}

async function importarMdb(req,res){
  try{
    const importacion=await importZkAccessMdb(req.body);
    const sincronizacion=await syncUsers();
    res.json({ok:true,message:'Base ZKAccess importada y C3-200 sincronizado',data:{...importacion,sincronizacion}});
  }catch(error){
    res.status(400).json({ok:false,message:'No fue posible importar la base ZKAccess',error:error.message});
  }
}
async function pluma(req,res){
  const accion=String(req.body.accion||'').toUpperCase();
  if(!['ABRIR','CERRAR'].includes(accion))return res.status(400).json({ok:false,message:'Acción no válida'});
  try{res.json({ok:true,message:accion==='ABRIR'?'Orden de apertura enviada':'Orden de cierre enviada',data:await operateGate(accion)});}
  catch(error){res.status(502).json({ok:false,message:'No fue posible operar la pluma',error:error.message});}
}
async function viviendas(req,res){
  try{res.json({ok:true,data:await dashboard(req.query)});}
  catch(error){res.status(500).json({ok:false,message:'No fue posible consultar viviendas y controles',error:error.message});}
}
async function simular(req,res){res.json({ok:true,data:await simularCorte(new Date())});}

module.exports={actualizarVigenciaViviendaTags,vigenciaVivienda,diagnosticoVivienda,estado,inventario,sincronizar,bloquear,bloquearVivienda,asignarTarjeta,crearTarjeta,editarTarjeta,agregarExistenteC3,eliminarTarjeta,logs,importarMdb,actualizarVigencia,pluma,viviendas,simular};
