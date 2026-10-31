'use strict';

// Diagnóstico desde el propio backend de Hostinger; únicamente lectura.
// No publica host/IP ni contraseña y nunca envía PUTDATA o controles de puerta.
const net=require('node:net');
const {C3Client,getDirectConfig}=require('./zkteco-c3-client.service');

function puertoTCP(config){
  return new Promise((resolve,reject)=>{
    const socket=new net.Socket();
    let settled=false;
    const finish=error=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      socket.destroy();
      if(error)reject(error);else resolve();
    };
    socket.once('error',finish);
    socket.once('connect',()=>finish());
    const timeoutMs=Math.min(12000,Math.max(1000,Number(config.timeoutMs)||7000));
    const timer=setTimeout(()=>{
      const error=new Error('El puerto TCP no respondió antes del tiempo límite');
      error.code='ETIMEDOUT';
      finish(error);
    },timeoutMs);
    socket.connect(config.port,config.host);
  });
}

function errorSeguro(error,host){
  const code=String(error?.code||error?.cause?.code||'').slice(0,50);
  const raw=String(error?.message||'Error desconocido').slice(0,500);
  const detail=host?raw.split(String(host)).join('[destino configurado]'):raw;
  return {codigo:code||null,detalle:detail};
}

function recomendacion(fase,error){
  const code=String(error?.code||error?.cause?.code||'').toUpperCase();
  const message=String(error?.message||'').toLowerCase();
  if(code==='ENOTFOUND'||code==='EAI_AGAIN')
    return 'El nombre DDNS no resuelve. Verifica el DNS y el dominio configurado en Hostinger.';
  if(code==='ECONNREFUSED')
    return 'El destino rechazó la conexión. Revisa el reenvío del puerto externo, firewall, router y si el C3 está encendido.';
  if(code==='EHOSTUNREACH'||code==='ENETUNREACH')
    return 'No hay ruta hasta la red del controlador. Verifica la IP pública, conexión a Internet y router.';
  if(code==='ETIMEDOUT'||message.includes('tiempo de espera')||message.includes('no respondió a tiempo'))
    return 'No llegó respuesta: confirma IP/DDNS pública, puerto externo, port forwarding TCP, firewall y conexión del C3.';
  if(message.includes('contraseña')||message.includes('password'))
    return 'Comprueba ZKTECO_COMM_PASSWORD contra la contraseña de comunicación del controlador.';
  if(fase==='PROTOCOLO')
    return 'El puerto acepta conexiones pero no se completó el protocolo C3: comprueba que apunta al panel correcto y sus credenciales.';
  if(fase==='INVENTARIO')
    return 'Se estableció sesión con el C3, pero falló la lectura de user; revisa respuesta del equipo, firmware y registros del backend.';
  return 'Revisa el error exacto y los logs de Node.js de Hostinger. No modifiques ni des de alta TAGs basándote en esta lectura.';
}

async function diagnosticarConexion({config=getDirectConfig(),probarTcp=puertoTCP,crearCliente=cfg=>new C3Client(cfg)}={}){
  const host=String(config.host||'').trim();
  const port=Number(config.port);
  const result={
    estado:'SIN_VERIFICAR',
    configuracion:{
      origenHost:process.env.ZKTECO_DIRECT_HOST?'ZKTECO_DIRECT_HOST':
        process.env.ZKTECO_HOST?'ZKTECO_HOST':'SIN_CONFIGURAR',
      hostConfigurado:Boolean(host),
      puerto:port,
      timeoutMs:Number(config.timeoutMs||7000)
    },
    pruebas:[],
    recomendacion:null
  };
  if(!host||!Number.isInteger(port)||port<1||port>65535){
    result.estado='CONFIGURACION_INVALIDA';
    result.pruebas.push({etapa:'CONFIGURACION',ok:false,detalle:!host?'Falta host ZKTeco':'Puerto TCP inválido'});
    result.recomendacion='Configura ZKTECO_DIRECT_HOST y ZKTECO_DIRECT_PORT en Hostinger; reinicia el backend.';
    return result;
  }
  try {
    await probarTcp(config);
    result.pruebas.push({etapa:'TCP',ok:true,detalle:'El puerto remoto acepta conexión desde el backend'});
  }catch(error){
    result.estado='SIN_CONEXION_TCP';
    result.pruebas.push({etapa:'TCP',ok:false,...errorSeguro(error,host)});
    result.recomendacion=recomendacion('TCP',error);
    return result;
  }
  let client;
  let protocolOk=false;
  try {
    client=crearCliente(config);
    await client.connect();
    protocolOk=true;
    result.pruebas.push({etapa:'PROTOCOLO',ok:true,detalle:'Sesión C3 establecida',serial:client.info?.serial||null});
    const rows=await client.getData('user');
    if(!Array.isArray(rows))throw new Error('El C3 no devolvió una lista de usuarios válida');
    result.pruebas.push({etapa:'INVENTARIO',ok:rows.length>0,detalle:rows.length
      ? 'Se leyeron '+rows.length+' registros de user'
      : 'El C3 devolvió cero registros: no se confirma el inventario'});
    result.estado=rows.length?'CONECTADO':'LECTURA_VACIA';
    result.recomendacion=rows.length
      ? 'Conexión e inventario comprobados. Si Sincronizar falla, revisa los logs del backend y la conciliación con MySQL.'
      : 'No asumas que no existen TAGs; revisa el inventario del panel y vuelve a diagnosticar sin modificar credenciales.';
  }catch(error){
    const etapa=protocolOk?'INVENTARIO':'PROTOCOLO';
    result.estado=protocolOk?'ERROR_INVENTARIO':'ERROR_PROTOCOLO';
    result.pruebas.push({etapa,ok:false,...errorSeguro(error,host)});
    result.recomendacion=recomendacion(etapa,error);
  }finally{
    if(client)try{await client.disconnect();}catch(_){}
  }
  return result;
}

module.exports={diagnosticarConexion,puertoTCP,errorSeguro,recomendacion};
