const test=require('node:test');const assert=require('node:assert/strict');const express=require('express');const jwt=require('jsonwebtoken');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'unused',JWT_SECRET:'test-secret'});
const models=require('../src/models');const db=require('../src/config/database');const router=require('../src/routes/viviendas.routes');
async function request(t,path,body,role='CONDOMINO',method='POST'){
 t.mock.method(models.Usuario,'findByPk',async()=>({id:5,casaId:1,correo:'member@example.com',estatus:'ACTIVO',rolId:2,rol:{nombre:role,activo:true}}));
 t.mock.method(models.UsuarioCasa,'findOne',async()=>({casaId:10}));
 const app=express();app.use(express.json());app.use('/api/viviendas',router);const server=app.listen(0);
 try{const r=await fetch('http://localhost:'+server.address().port+'/api/viviendas'+path,{method,headers:{Authorization:'Bearer '+jwt.sign({usuarioId:5},process.env.JWT_SECRET),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}finally{await new Promise(r=>server.close(r));}
}
test('members cannot elevate themselves or assign a house by direct linking',async t=>{
 assert.equal((await request(t,'/10/miembros',{correo:'member@example.com',tipo:'RESPONSABLE'})).status,403);
 assert.equal((await request(t,'/10/invitaciones',{correo:'other@example.com',tipo:'RESPONSABLE'})).status,403);
 assert.equal((await request(t,'/10/miembros/5',{tipo:'RESPONSABLE',activo:true},'CONDOMINO','PATCH')).status,403);
});
test('acceptance requires the invited email and does not consume mismatched invitation',async t=>{
 const inv={casaId:20,correo:'different@example.com',expiraEn:new Date(Date.now()+60000),async update(){assert.fail('must not consume');}};
 t.mock.method(db,'transaction',async fn=>fn({LOCK:{UPDATE:'UPDATE'}}));t.mock.method(models.InvitacionCasa,'findOne',async()=>inv);
 const r=await request(t,'/invitaciones/aceptar',{token:'a'.repeat(64)});assert.equal(r.status,403);
});
test('existing account accepts second house once without changing its global role',async t=>{
 const inv={casaId:20,correo:'member@example.com',tipo:'MIEMBRO',expiraEn:new Date(Date.now()+60000),async update(v){Object.assign(this,v);}};
 t.mock.method(db,'transaction',async fn=>fn({LOCK:{UPDATE:'UPDATE'}}));t.mock.method(models.InvitacionCasa,'findOne',async()=>inv);
 t.mock.method(models.UsuarioCasa,'findOrCreate',async opts=>{assert.deepEqual(opts.where,{usuarioId:5,casaId:20});return [{tipo:'MIEMBRO'},true];});
 t.mock.method(models.HistorialVinculo,'create',async()=>({}));
 assert.equal((await request(t,'/invitaciones/aceptar',{token:'a'.repeat(64)})).status,200);
 assert.equal((await request(t,'/invitaciones/aceptar',{token:'a'.repeat(64)})).status,410);
});
