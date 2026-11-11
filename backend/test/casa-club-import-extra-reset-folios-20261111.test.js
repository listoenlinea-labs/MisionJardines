'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'test',JWT_SECRET:'test'});
const folios=require('../src/services/folio-recibo-mj.service');
const club=require('../src/controllers/casa-club.controller');
const Reserva=require('../src/models/ReservaCasaClub');
const Banco=require('../src/models/PagoReportado');
const Manual=require('../src/models/PagoManualConcepto');
const db=require('../src/config/database');
const Usuario=require('../src/models/Usuario');
const Recuperacion=require('../src/models/RecuperacionContrasena');
const reset=require('../src/controllers/recuperacion-contrasena.controller');
const src=path.resolve(__dirname,'../');
const read=p=>fs.readFileSync(path.resolve(src,p),'utf8');
const respuesta=()=>({code:200,body:null,status(n){this.code=n;return this;},json(v){this.body=v;return this;},setHeader(){}});
test('Nuevos recibos: prefijos y terminaciones oficiales M, P y C',()=>{
 const base={fechaOperacion:'2026-11-11',calle:'Misión Gardenias',numero:'5',aleatorio:'20E07DA986'};
 assert.equal(folios.componer({...base,tipoPago:'MANTENIMIENTO'}),'MJ-NOV-2026-20E07DA986-G5-M');
 assert.equal(folios.componer({...base,tipoPago:'EXTRAORDINARIO'}),'MJ-NOV-2026-20E07DA986-G5-P');
 assert.equal(folios.componer({...base,tipoPago:'CASA_CLUB'}),'MJ-NOV-2026-20E07DA986-G5-C');
 assert.equal(folios.componer({...base,calle:'Rosas',numero:18,tipoPago:'MANTENIMIENTO'}),'MJ-NOV-2026-20E07DA986-R18-M');
 assert.throws(()=>folios.componer({...base,tipoPago:'INVALIDO'}));
});
test('Recibos conservan identificador bancario interno, sin confundir Casa Club con mantenimiento',()=>{
 const control=read('controllers/pagos.controller.js');
 const pdf=read('services/pago-reportado-pdf.service.js');
 assert.match(control,/generarSiguienteFolio\(year, transaction\)/);
 assert.match(control,/reciboFolio: folioRecibo/);
 assert.match(pdf,/isClub\s*=\s*pago.tipoPago === 'CASA_CLUB'/);
 assert.match(pdf,/Recibo de reservación de Casa Club/);
 assert.match(pdf,/isClub \? 'Casa Club'/);
});
test('Extraordinarias: selector por vivienda y abonos parciales voluntarios; sin afectación de C3',()=>{
 const pagos=read('../docs/assets/js/pagos.js');
 const deuda=read('services/adeudos-comunidad.service.js');
 const confirm=read('controllers/pagos.controller.js');
 assert.match(pagos,/extraProjectSelect/);
 assert.match(pagos,/montoDisponible/);
 assert.match(pagos,/Meta individual/);
 assert.match(confirm,/if\(cargoExtraordinario\)/);
 assert.match(confirm,/saldo\.disponible/);
 assert.match(confirm,/pago.tipoPago === 'MANTENIMIENTO'/);
 assert.match(deuda,/consultarSoloMantenimiento/);
 assert.match(deuda,/C3 solamente consulta este resumen/);
});
test('SQL de Casa Club conserva reglas pero NO datos privados',()=>{
 const sql=read('sql/2026-11-11-importar-seis-reservas-casa-club.sql');
 assert.match(sql,/t\.fecha>'2026-11-10'/);
 assert.match(sql,/PENDIENTE',1000,700,300/);
 assert.match(sql,/Banco: sin conciliar/);
 assert.match(sql,/SIGNAL SQLSTATE '45000'/);
 assert.match(sql,/NOT EXISTS/);
 assert.doesNotMatch(sql,/@gmail\.com|@yahoo\.com/);
 assert.match(sql,/CARGA PRIVADA/);
});
test('No se puede borrar registro con pagos o comprobantes de Casa Club',async t=>{
 let destruido=false;
 t.mock.method(db,'transaction',async fn=>fn({LOCK:{UPDATE:'UPDATE'}}));
 t.mock.method(Reserva,'findByPk',async()=>({id:8,pagado:false,destroy:async()=>{destruido=true;}}));
 t.mock.method(Banco,'count',async()=>1);
 t.mock.method(Manual,'count',async()=>0);
 const r=respuesta();await club.eliminarRegistro({usuario:{rol:'ADMINISTRADOR'},params:{id:'8'}},r);
 assert.equal(r.code,409);assert.equal(destruido,false);
});
test('Solo administrador puede borrar una reservación sin movimientos',async t=>{
 let destruido=false;
 t.mock.method(db,'transaction',async fn=>fn({LOCK:{UPDATE:'UPDATE'}}));
 t.mock.method(Reserva,'findByPk',async()=>({id:8,pagado:false,destroy:async()=>{destruido=true;}}));
 t.mock.method(Banco,'count',async()=>0);
 t.mock.method(Manual,'count',async()=>0);
 const no=respuesta();await club.eliminarRegistro({usuario:{rol:'CONDOMINO'},params:{id:'8'}},no);
 assert.equal(no.code,403);
 const si=respuesta();await club.eliminarRegistro({usuario:{rol:'ADMINISTRADOR'},params:{id:'8'}},si);
 assert.equal(si.code,200);assert.equal(destruido,true);
});
test('Restablecimiento exige contraseña segura y enlace de 64 caracteres',async()=>{
 assert.equal(reset.fuerte('Abcdefg1'),true);
 assert.equal(reset.fuerte('abcdefg1'),false);
 assert.equal(reset.fuerte('ABCDEFG1'),false);
 assert.equal(reset.fuerte('Abcdefgh'),false);
 const r=respuesta();await reset.confirmar({body:{token:'malo',contrasenaNueva:'Abcdefg1'}},r);
 assert.equal(r.code,400);
});
test('Restablecimiento por correo usa token una sola vez y revoca sesiones previas',async t=>{
 const token='a'.repeat(64),hashed=crypto.createHash('sha256').update(token).digest('hex');
 const row={id:10,usuarioId:7,tokenHash:hashed,venceEn:new Date(Date.now()+120000),utilizadoEn:null};
 const user={id:7,estatus:'ACTIVO',cuentaAceptada:true,sesionVersion:2,
  update:async d=>Object.assign(user,d)};
 t.mock.method(db,'transaction',async fn=>fn({LOCK:{UPDATE:'UPDATE'}}));
 t.mock.method(Recuperacion,'findOne',async options=>{assert.equal(options.where.tokenHash,hashed);return row;});
 t.mock.method(Recuperacion,'update',async d=>{row.utilizadoEn=d.utilizadoEn;return [1];});
 t.mock.method(Usuario,'scope',()=>({findByPk:async()=>user}));
 const req={body:{token,contrasenaNueva:'NuevaClave123'}};
 let r=respuesta();await reset.confirmar(req,r);
 assert.equal(r.code,200);assert.equal(user.sesionVersion,3);
 r=respuesta();await reset.confirmar(req,r);
 assert.equal(r.code,409,'un enlace utilizado no puede volver a resetear');
});
test('Solicitud de recuperar contraseña no permite enumerar cuentas',async t=>{
 t.mock.method(Usuario,'findOne',async()=>null);
 const res=respuesta();
 await reset.solicitar({body:{identificador:'no-existe@example.test'}},res);
 assert.equal(res.code,200);
 assert.match(res.body.message,/Si existe una cuenta/);
});
test('Solo el estado y fecha del calendario salen a residentes',()=>{
 const controller=read('controllers/casa-club.controller.js');
 assert.match(controller,/ocupadas:rows\.map\(x=>\(\{fecha:x\.fecha,estatus:x\.estatus\}\)\)/);
 const ui=read('../docs/assets/js/casa-club.js');
 assert.match(ui,/clubFilterStreet/);
 assert.match(ui,/clubFilterNumber/);
});
