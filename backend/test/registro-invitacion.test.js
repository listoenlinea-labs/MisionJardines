const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('crypto');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'unused',JWT_SECRET:'test-secret'});
const db=require('../src/config/database');const m=require('../src/models');const {verificarRegistro}=require('../src/controllers/auth.controller');
const SolicitudRegistro=require('../src/models/SolicitudRegistro');
async function verify(t,options={}){
 const correo='new@example.com',codigo='123456';let created=0,linked=0,approvalPending=0,consumed=false,committed=false;
 const tx={LOCK:{UPDATE:'UPDATE'},async commit(){committed=true;this.finished=true;},async rollback(){this.finished=true;}};
 t.mock.method(db,'transaction',async()=>tx);
 t.mock.method(m.VerificacionCuenta,'findOne',async()=>({casaId:20,expiraEn:new Date(Date.now()+60000),intentos:0,codigoHash:crypto.createHash('sha256').update(correo+':'+codigo+':test-secret').digest('hex'),datosJson:JSON.stringify({invitacionId:options.legacy?undefined:1,nombre:'Test',apellidoPaterno:'New',contrasenaHash:'hash'}),async update(){},async increment(){}}));
 t.mock.method(m.Rol,'findOne',async()=>({id:2}));t.mock.method(m.Usuario,'findOne',async()=>null);
 t.mock.method(m.InvitacionCasa,'findByPk',async()=>({casaId:20,correo,tipo:'MIEMBRO',expiraEn:new Date(Date.now()+(options.expired?-1000:60000)),async update(){consumed=true;}}));
 t.mock.method(m.Usuario,'create',async data=>{created++;assert.equal(data.rolId,2);assert.equal(data.casaId,20);assert.equal(data.estatus,'PENDIENTE');return {id:8};});
 t.mock.method(m.UsuarioCasa,'findOrCreate',async opt=>{linked++;assert.deepEqual(opt.where,{usuarioId:8,casaId:20});return [{tipo:'MIEMBRO'},true];});t.mock.method(SolicitudRegistro,'create',async data=>{approvalPending++;assert.equal(data.tipoSolicitado,'CONDOMINO');assert.equal(data.estatus,'PENDIENTE');});t.mock.method(m.HistorialVinculo,'create',async()=>({}));
 let status=200;const res={status(n){status=n;return this;},json(){return this;}};
 await verificarRegistro({body:{correo,codigo:options.badCode?'999999':codigo}},res);
 return {status,created,linked,approvalPending,consumed,committed};
}
test('invited account waits for administrative approval after email verification',async t=>{
 assert.deepEqual(await verify(t),{status:201,created:1,linked:0,approvalPending:1,consumed:true,committed:true});
});
test('expired invitation cannot create account even with a correct email code',async t=>{
 const r=await verify(t,{expired:true});assert.equal(r.status,410);assert.equal(r.created,0);assert.equal(r.committed,false);
});
test('legacy uninvited registration codes cannot bypass invitation requirement',async t=>{
 const r=await verify(t,{legacy:true});assert.equal(r.status,410);assert.equal(r.created,0);
});
test('incorrect email code cannot create a membership',async t=>{
 const r=await verify(t,{badCode:true});assert.equal(r.status,400);assert.equal(r.created,0);assert.equal(r.linked,0);
});
