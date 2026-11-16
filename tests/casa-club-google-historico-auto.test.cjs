'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const google=require('../backend/src/services/google-sheets.service');
const club=require('../backend/src/services/casa-club-google-client.service');
const fs=require('node:fs');
const path=require('node:path');
const fixture=()=>{
 const header=Array(12).fill('');
 header[5]='PAGO RECUPERACIÓN';header[11]='ESTATUS PAGO';
 const item=(amount,status,month)=>{
  const row=Array(12).fill('');row[3]=month;row[5]=amount;row[11]=status;return row;
 };
 return [['CONTROL DE PAGOS'],header,
  item('$1,000.00','PAGADO','Enero'),
  item('$700','pagado','Febrero'),
  item('$900','CANCELADO','Marzo')];
};
test('separar cancelados y sumar únicamente pagos históricos válidos',()=>{
 const result=club.resumenPagos2026(fixture());
 assert.equal(result.total,1700);
 assert.equal(result.registros,2);
 assert.equal(result.excluidos,1);
 assert.deepEqual(result.porMesEvento,{'01':1000,'02':700});
 assert.equal(result.conciliado,false);
});
test('detener conciliación si cambiaron las columnas F y L',()=>{
 const rows=fixture();rows[1][11]='OBSERVACIONES';
 assert.throws(()=>club.resumenPagos2026(rows),e=>e.code==='COLUMNAS_INVALIDAS');
});
test('sin credenciales devuelve diagnóstico y no usa OAuth de respaldos',async()=>{
 const names=['CASA_CLUB_GOOGLE_CREDENTIALS_BASE64','GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64'];
 const prior=names.map(x=>process.env[x]);
 try{
  names.forEach(x=>delete process.env[x]);
  await assert.rejects(google.readCasaClub2026(),e=>e.code==='CREDENCIALES_PENDIENTES');
 }finally{names.forEach((n,i)=>prior[i]===undefined?delete process.env[n]:process.env[n]=prior[i]);}
});
test('consulta el archivo específico Casa Club sin depender de ID genérico ni de habilitar sync',async()=>{
 const names=['CASA_CLUB_GOOGLE_CREDENTIALS_BASE64','GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64',
 'GOOGLE_SHEETS_SPREADSHEET_ID','CASA_CLUB_GOOGLE_SYNC_ENABLED','CASA_CLUB_HISTORICO_SPREADSHEET_ID'];
 const saved=names.map(x=>process.env[x]),originalFetch=global.fetch;
 const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
 const key={type:'service_account',client_email:'mock-readonly-casa-club@example.invalid',
  private_key:privateKey,token_uri:'https://oauth2.googleapis.com/token'};
 const urls=[];
 try{
  process.env.CASA_CLUB_GOOGLE_CREDENTIALS_BASE64=Buffer.from(JSON.stringify(key)).toString('base64');
  delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID='unrelated_spreadsheet_for_other_account';
  process.env.CASA_CLUB_GOOGLE_SYNC_ENABLED='false';
  delete process.env.CASA_CLUB_HISTORICO_SPREADSHEET_ID;
  global.fetch=async url=>{
   urls.push(String(url));
   if(String(url).includes('/token'))return {ok:true,json:async()=>({access_token:'fake-token',expires_in:3600})};
   return {ok:true,json:async()=>({values:fixture()})};
  };
  const result=await google.readCasaClub2026();
  assert.equal(result[1][5],'PAGO RECUPERACIÓN');
  const sheetsUrl=urls.find(x=>x.includes('sheets.googleapis.com'));
  assert.ok(sheetsUrl.includes('11v3DX6lEiAs9Azps8k3l_Is_-lxvR8g01MTIDwsgKIY'));
  assert.ok(sheetsUrl.includes('MISION%20JARDINES%202026'));
 }finally{
  global.fetch=originalFetch;
  names.forEach((n,i)=>saved[i]===undefined?delete process.env[n]:process.env[n]=saved[i]);
 }
});
test('la vista indica acceso automático sin pedir conexión Drive',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../docs/assets/js/analisis-cuotas.js'),'utf8');
 const fragment=s.slice(s.indexOf('function renderClubDashboard(){'),s.indexOf('function renderBalanceCard(){'));
 assert.match(fragment,/Conectado automáticamente/);
 assert.match(fragment,/historico\.mensaje/);
 assert.match(fragment,/No necesitas usar el botón de respaldos/);
 assert.doesNotMatch(fragment,/financeDriveConnect/);
});
