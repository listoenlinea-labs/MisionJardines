const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'unused',JWT_SECRET:'test-secret'});
const jwt = require('jsonwebtoken');
const {Usuario,UsuarioCasa} = require('../src/models');
const {autenticarToken} = require('../src/middlewares/auth.middleware');
async function check(role,baseUrl, options={}) {
  const previous = Usuario.findByPk;
  const oldMembership=UsuarioCasa.findOne;
  UsuarioCasa.findOne=async()=>({casaId:7});
  Usuario.findByPk = async () => options.missing ? null : ({id:1,casaId:7,rolId:2,estatus:options.status||'ACTIVO',rol:{nombre:role,activo:true}});
  const req = {baseUrl,headers:{authorization:'Bearer '+jwt.sign({usuarioId:1,rol:'SUPER_ADMIN',casaId:99},process.env.JWT_SECRET)}};
  let status = 200, nextCalled = false;
  const res = {status(code){status=code;return this;},json(){return this;}};
  try { await autenticarToken(req,res,()=>{nextCalled=true;}); return {status,nextCalled,user:req.usuario}; }
  finally { Usuario.findByPk=previous; UsuarioCasa.findOne=oldMembership; }
}
test('old administrator JWT cannot bypass current security permissions',async()=>{
  assert.equal((await check('SEGURIDAD','/api/cuotas')).status,403);
  assert.equal((await check('SEGURIDAD','/api/pagos')).status,403);
  assert.equal((await check('SEGURIDAD','/api/eventos')).status,403);
  assert.equal((await check('SEGURIDAD','/api/conexion')).nextCalled,true);
});
test('resident cannot load operational APIs; current house replaces token claim',async()=>{
  for(const section of ['casas','visitas','accesos','conexion','dashboard']) assert.equal((await check('CONDOMINO','/api/'+section)).status,403);
  const result=await check('CONDOMINO','/api/cuotas');
  assert.equal(result.nextCalled,true); assert.equal(result.user.casaId,7);
});
test('inactive and removed accounts lose existing sessions',async()=>{
  assert.equal((await check('SUPER_ADMIN','/api/cuotas',{status:'SUSPENDIDO'})).status,403);
  assert.equal((await check('SUPER_ADMIN','/api/cuotas',{missing:true})).status,403);
});
test('administrators retain access across modules',async()=>{
  for(const role of ['ADMINISTRADOR','SUPER_ADMIN']) for(const section of ['casas','cuotas','eventos','accesos','visitas','dashboard','pagos','conexion']) assert.equal((await check(role,'/api/'+section)).nextCalled,true);
});
test('connection configuration remains writable only by administrators',()=>{
  const {autorizarRoles}=require('../src/middlewares/roles.middleware');
  const guard=autorizarRoles('SUPER_ADMIN','ADMINISTRADOR');
  for(const role of ['SEGURIDAD','CONDOMINO']) {
    let status; guard({usuario:{rol:role}},{status(code){status=code;return this;},json(){}},()=>assert.fail('write allowed'));
    assert.equal(status,403);
  }
});
