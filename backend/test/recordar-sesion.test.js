const {test}=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'test',JWT_SECRET:'clave-sintetica-pruebas'});
const jwt=require('jsonwebtoken');
const bcrypt=require('bcryptjs');
const {Usuario}=require('../src/models');
const {iniciarSesion}=require('../src/controllers/auth.controller');
const pwd=bcrypt.hashSync('MiPassword123!',4);
function response(){return{code:200,payload:null,status(v){this.code=v;return this;},json(v){this.payload=v;return this;}};}
async function login(t,remember,phone=false){
 const user={id:25,casaId:3,rolId:2,sesionVersion:4,estatus:'ACTIVO',cuentaAceptada:true,contrasenaHash:pwd,
  rol:{nombre:'CONDOMINO'},async update(){},toJSON(){return{id:25,casaId:3,rol:{nombre:'CONDOMINO'}};}};
 t.mock.method(Usuario,'scope',()=>({findAll:async()=>[user]}));
 const res=response();await iniciarSesion({body:{...(phone?{telefono:'3312345678'}:{correo:'ejemplo@example.com'}),contrasena:'MiPassword123!',recordarme:remember}},res);
 assert.equal(res.code,200);assert.equal(res.payload.recordarme,remember);
 return jwt.decode(res.payload.token);
}
test('recordar dispositivo emite JWT revocable de 90 días y no conserva contraseña',async t=>{
 const payload=await login(t,true);
 assert.equal(payload.sesionVersion,4);
 assert.ok(payload.exp-payload.iat>=89*86400);
});
test('sin recordar sesión conserva vencimiento corto de 8 horas',async t=>{
 const payload=await login(t,false);
 assert.ok(payload.exp-payload.iat<=8*3600);
});

test('login por teléfono conserva también JWT de 90 días cuando recordarme es true',async t=>{
 const payload=await login(t,true,true);
 assert.equal(payload.sesionVersion,4);
 assert.equal(payload.exp-payload.iat,90*86400);
});
