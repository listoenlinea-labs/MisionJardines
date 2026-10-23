'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../scripts/probar-buzon-pagos.js'),'utf8');
async function run(diagnostics){
 let envPath;const lines=[];
 const env={NODE_ENV:'production',PAGOS_IMAP_HOST:'imap.example.test',PAGOS_IMAP_MAILBOX:'buzon@example.test',PAGOS_IMAP_PASSWORD:'SECRET-ONLY-IN-TEST'};
 const api={
  'node:path':path,dotenv:{config(options){envPath=options.path;}},
  '../src/services/correo-bancario-mail.service':{leerBuzon:async()=>diagnostics.map((_,index)=>({index}))},
  '../src/services/banco-correo.service':{datosAviso:message=>diagnostics[message.index]}
 };
 vm.runInNewContext(source,{__dirname:path.resolve(__dirname,'../scripts'),process:{env},
  require:name=>{assert.ok(Object.hasOwn(api,name),'El diagnóstico solo carga el lector y el parser');return api[name];},
  console:{log:(...items)=>lines.push(items.join(' ')),warn:(...items)=>lines.push(items.join(' ')),error:(...items)=>lines.push(items.join(' '))}});
 await new Promise(resolve=>setImmediate(resolve));return {envPath,lines};
}
test('diagnóstico carga el mismo archivo de entorno backend que server.js',async()=>{
 const {envPath}=await run([]);
 assert.equal(envPath,path.resolve(__dirname,'../.env.production'));
 const server=fs.readFileSync(path.resolve(__dirname,'../src/server.js'),'utf8');
 assert.match(server,/`\.\.\/\.env\.\$\{nodeEnv\}`/);
});
test('informa autenticación y extracción por separado sin imprimir datos privados',async()=>{
 const {lines}=await run([
  {autorizado:true,origenVerificado:'ADMINISTRADOR',tracking:'CLAVE-PRIVADA',monto:300,fecha:'2026-10-22',cuenta:'1234',concepto:'CASA PRIVADA'},
  {autorizado:false,tracking:'CLAVE-PRIVADA',monto:300,fecha:'2026-10-22',cuenta:'1234',concepto:'CASA PRIVADA'},
  {autorizado:true,tracking:'CLAVE-PRIVADA',monto:300,fecha:'2026-10-22',cuenta:'',concepto:'CASA PRIVADA'}]);
 const output=lines.join('\n');
 assert.match(output,/autenticación válidos: 2/);
 assert.match(output,/Reenvíos autenticados del administrador autorizado: 1/);
 assert.match(output,/datos completos, sin considerar autenticación: 2/);
 assert.match(output,/sin terminación de cuenta reconocible \(3 o 4 dígitos\): 1/);
 assert.doesNotMatch(output,/CLAVE-PRIVADA|CASA PRIVADA|SECRET-ONLY-IN-TEST|buzon@example\.test/);
 assert.match(output,/No se actualizó ningún pago, TAG o mensaje/);
});
