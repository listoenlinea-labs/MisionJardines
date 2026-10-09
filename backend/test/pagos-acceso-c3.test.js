const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'unused' });
const { Op } = require('sequelize');
const db = require('../src/config/database');
const models = require('../src/models');
const Eventos = require('../src/models/PagoAccesoC3');
const Aplicaciones = require('../src/models/PagoAccesoTagC3');
const service = require('../src/services/vigencia-mantenimiento.service');
const worker = require('../src/services/zkteco-vigencias.service');
const direct = require('../src/services/zkteco-direct.service');
const { incrementar, fechaReal } = require('../src/services/pago-acceso-calculo');
const now = new Date('2026-10-09T03:00:00Z');
function setup(t) {
    const events = [], intents = [], tags = [], cuotas = [], pagos = [], writes = [], hooks = [], physical = new Map();
    let committedIntents = new Set(), failAfterWrite = false, failWrite = null;
    const tx = { LOCK: { UPDATE: 'UPDATE' }, afterCommit(fn) { hooks.push(fn); } };
    const row = values => ({ ...values, async update(v) {
        if (failAfterWrite && tags.includes(this)) { failAfterWrite = false; throw Error('SQL failed after TCP'); }
        Object.assign(this, v); return this;
    } });
    const match = (r, where) => Reflect.ownKeys(where || {}).every(k => {
        if (k === Op.or) return where[k].some(w => match(r, w));
        const v = where[k];
        if (v && typeof v === 'object' && !(v instanceof Date)) return Reflect.ownKeys(v).every(op =>
            op === Op.notIn ? !v[op].includes(r[k]) : op === Op.in ? v[op].includes(r[k]) : op === Op.lte ? !r[k] || r[k] <= v[op] : true);
        return String(r[k]) === String(v);
    });
    const select = (rows, options = {}) => rows.filter(r => match(r, options.where)).sort((a,b) => {
        const [key,dir] = options.order?.[0] || ['id','ASC']; return (Number(a[key]) - Number(b[key])) * (dir === 'DESC' ? -1 : 1);
    });
    for (const [model, rows] of [[Eventos,events],[Aplicaciones,intents],[models.ZkTarjeta,tags]]) {
        t.mock.method(model, 'findAll', async options => select(rows,options));
        t.mock.method(model, 'findOne', async options => select(rows,options)[0] || null);
        t.mock.method(model, 'findByPk', async id => rows.find(r => String(r.id) === String(id)) || null);
        t.mock.method(model, 'create', async v => { const r=row({id:rows.length+1,...v});rows.push(r);return r; });
    }
    t.mock.method(models.Casa, 'findByPk', async () => ({ id: 7 }));
    t.mock.method(models.Cuota, 'findAll', async options => select(cuotas,options));
    t.mock.method(models.PagoReportado, 'findAll', async options => select(pagos,options));
    // Legacy bases must never influence payment calculation or delivery.
    t.mock.method(service.Vigencia,'findByPk',async()=>assert.fail('do not read legacy cutoff'));
    t.mock.method(service.Vigencia,'update',async()=>assert.fail('do not write a legacy cutoff'));
    let transactionTail = Promise.resolve();
    t.mock.method(db, 'transaction', async (options,callback) => {
        // Emulate the house row lock: separate workers cannot hold it simultaneously.
        const previous = transactionTail;
        let release;
        transactionTail = new Promise(resolve => { release = resolve; });
        await previous;
        const snapshots = [...events,...intents,...tags].map(r=>[r,{...r}]);
        try { const result=await callback(tx);committedIntents=new Set(intents.filter(i=>i.fechaAntes).map(i=>i.id));return result; }
        catch(e) { for(const [r,s] of snapshots) {for(const k of Object.keys(r)) if(!(k in s))delete r[k];Object.assign(r,s);}throw e; }
        finally { release(); }
    });
    t.mock.method(direct,'readUserValidity',async card=>{
        const state=physical.get(card);if(!state)throw Error('TAG absent');return {...state};
    });
    t.mock.method(direct,'writeUserValidity',async(card,start,end,options)=>{
        const intent=intents.find(i=>i.numeroTarjeta===card && i.fechaDespues===end);
        assert.ok(committedIntents.has(intent.id),'intent committed before TCP');
        assert.equal(start,null);assert.equal(options.mode,'DIRECT');
        const state=physical.get(card);assert.equal(state.fechaFinal,options.expectedEnd);assert.equal(state.pin,options.expectedPin);
        if(failWrite===card)throw Error('TCP unavailable');
        state.fechaFinal=end;writes.push({card,end});
    });
    function addTag(card='123',date='2026-10-11') {
        const tag=row({id:tags.length+1,casaId:7,numeroTarjeta:card,fechaFin:'2020-01-01',bloqueado:true,enControlador:false});tags.push(tag);
        physical.set(card,{pin:card,fechaFinal:date,autorizaciones:'[]'});return tag;
    }
    async function pay(monto='650.00',recargo='50.00',ref='bank1') {
        const p={id:pagos.length+1,casaId:7,tipoPago:'MANTENIMIENTO',estatus:'VALIDADO',monto,recargo,folioOperacion:ref};pagos.push(p);
        return service.actualizar(7,2,tx,{origen:'PAGO',registro:p});
    }
    return {events,intents,tags,physical,pagos,cuotas,writes,hooks,tx,row,addTag,pay,
        failSQLAfterTCP(){failAfterWrite=true;},failTCP(card){failWrite=card;} };
}
test('increments use the C3 calendar month, normalize any real day to day 10, and cross years',()=>{
    assert.equal(incrementar('2026-10-11',2),'2026-12-10');
    assert.equal(incrementar('2026-12-31',12),'2027-12-10');
    for(const value of ['2026-02-30','0000-01-10','',null])assert.throws(()=>fechaReal(value));
});
test('650 minus 50 advances two months from physical C3, never from the stale SQL mirror',async t=>{
    const c=setup(t);c.addTag();const result=await c.pay();
    assert.equal(result.meses,2);assert.equal(c.writes.length,0);assert.equal(c.hooks.length,1);
    await worker.sincronizarCasa(7,{now,dryRun:false});
    assert.equal(c.physical.get('123').fechaFinal,'2026-12-10');assert.equal(c.tags[0].bloqueado,true);
    assert.equal(c.events[0].estado,'COMPLETADO');assert.equal(c.intents[0].fechaAntes,'2026-10-11');
});
test('a later payment starts from a manually changed C3 date, not the previous journal target',async t=>{
    const c=setup(t);c.addTag();await c.pay();await worker.sincronizarCasa(7,{now,dryRun:false});
    c.physical.get('123').fechaFinal='2027-05-11';await c.pay('900','0','bank2');
    await worker.sincronizarCasa(7,{now,dryRun:false});assert.equal(c.physical.get('123').fechaFinal,'2027-08-10');
});
test('multiple tags each advance from their own real date and repeated delivery adds nothing',async t=>{
    const c=setup(t);c.addTag();c.addTag('456','2027-01-10');await c.pay();
    await worker.sincronizarCasa(7,{now,dryRun:false});await worker.sincronizarCasa(7,{now,dryRun:false});
    assert.deepEqual(c.writes,[{card:'123',end:'2026-12-10'},{card:'456',end:'2027-03-10'}]);
});
test('failed SQL checkpoint after a physical write retries without adding months twice',async t=>{
    const c=setup(t);c.addTag();await c.pay();c.failSQLAfterTCP();
    await worker.sincronizarCasa(7,{now,dryRun:false});assert.equal(c.events[0].estado,'ERROR');
    c.events[0].proximoIntento=null;await worker.sincronizarCasa(7,{now,dryRun:false});
    assert.equal(c.writes.length,1);assert.equal(c.events[0].estado,'COMPLETADO');assert.equal(c.tags[0].fechaFin,'2026-12-10');
});
test('partial house failure records the completed tag and retries only the outstanding increment',async t=>{
    const c=setup(t);c.addTag();c.addTag('456');await c.pay();c.failTCP('456');
    await worker.sincronizarCasa(7,{now,dryRun:false});assert.equal(c.intents[0].estado,'COMPLETADO');
    c.failTCP(null);c.events[0].proximoIntento=null;await worker.sincronizarCasa(7,{now,dryRun:false});
    assert.equal(c.writes.length,2);assert.equal(c.events[0].estado,'COMPLETADO');
});
test('a date changed after intent preparation creates a conflict and is never overwritten',async t=>{
    const c=setup(t);c.addTag();await c.pay();c.failTCP('123');await worker.sincronizarCasa(7,{now,dryRun:false});
    c.physical.get('123').fechaFinal='2027-04-10';c.failTCP(null);c.events[0].proximoIntento=null;
    await worker.sincronizarCasa(7,{now,dryRun:false});assert.equal(c.events[0].estado,'CONFLICTO');assert.equal(c.writes.length,0);
    await c.pay('300','0','bank2');await worker.sincronizarCasa(7,{now,dryRun:false});assert.equal(c.events[1].estado,'PENDIENTE');
});
test('changed authorizations on retry require review even when the end date matches the target',async t=>{
    const c=setup(t);c.addTag();await c.pay();c.failSQLAfterTCP();await worker.sincronizarCasa(7,{now,dryRun:false});
    c.physical.get('123').autorizaciones='different';c.events[0].proximoIntento=null;
    await worker.sincronizarCasa(7,{now,dryRun:false});assert.equal(c.events[0].estado,'CONFLICTO');
});
test('moving a pending tag to another house prevents applying the old house payment',async t=>{
    const c=setup(t);const tag=c.addTag();await c.pay();tag.casaId=8;
    await worker.sincronizarCasa(7,{now,dryRun:false});assert.equal(c.events[0].estado,'CONFLICTO');assert.equal(c.writes.length,0);
});
test('repeated confirmation and a matching bank movement in cuotas buy access only once',async t=>{
    const c=setup(t);c.addTag();await c.pay();
    await service.actualizar(7,2,c.tx,{origen:'PAGO',registro:c.pagos[0]});
    const cuota={id:2,casaId:7,referencia:'bank1',estatusPago:'PAGADO',montoPagado:'650',recargo:'50'};c.cuotas.push(cuota);
    await service.actualizar(7,2,c.tx,{origen:'CUOTA',registro:cuota});assert.equal(c.events.length,1);
});
test('reverse representation order and historic paid movements do not replay previous access',async t=>{
    const c=setup(t);c.addTag();const cuota={id:2,casaId:7,referencia:'bank1',estatusPago:'PAGADO',montoPagado:'650',recargo:'50'};c.cuotas.push(cuota);
    await c.pay();assert.equal(c.events.length,0);
});
test('newly paid quota advances only its additional principal and retries retain a high-water mark',async t=>{
    const c=setup(t);c.addTag();const quota={id:2,casaId:7,estatusPago:'PAGO_PARCIAL',montoPagado:'600',recargo:'0'};
    const before={...quota,montoPagado:'300'};
    await service.actualizar(7,2,c.tx,{origen:'CUOTA',registro:quota,anterior:before});
    assert.equal(c.events[0].meses,1);
    await service.actualizar(7,2,c.tx,{origen:'CUOTA',registro:quota,anterior:before});assert.equal(c.events.length,1);
});
test('1500 minus 50 buys four months and retains 250 for the next payment without lifetime sums',async t=>{
    const c=setup(t);c.addTag();const a=await c.pay('1500','50');assert.equal(a.meses,4);assert.equal(a.saldoParcial,'250.00');
    const b=await c.pay('50','0','bank2');assert.equal(b.meses,1);assert.equal(b.saldoParcial,'0.00');
});
test('partial principal, extraordinary charges, unapproved proof and no TAGs cannot claim physical access',async t=>{
    const c=setup(t);const p={id:1,casaId:7,monto:'300',recargo:0,estatus:'PENDIENTE_VALIDACION',tipoPago:'MANTENIMIENTO'};
    await service.actualizar(7,2,c.tx,{origen:'PAGO',registro:p});assert.equal(c.events.length,0);
    p.estatus='VALIDADO';p.tipoPago='EXTRAORDINARIO';await service.actualizar(7,2,c.tx,{origen:'PAGO',registro:p});assert.equal(c.events.length,0);
    const a=await c.pay('100','0');assert.equal(a.meses,0);assert.equal(c.intents.length,0);
    const b=await c.pay('200','0','bank2');assert.equal(b.sincronizacion,'SIN_TAGS');
    c.addTag();await worker.sincronizarCasa(7,{now,dryRun:false});assert.equal(c.writes.length,0,'new tags do not inherit historical payments');
});
test('dry-run makes no physical read/write and preserves the pending increment for later execution',async t=>{
    const c=setup(t);c.addTag();await c.pay();await worker.sincronizarCasa(7,{now,dryRun:true});
    assert.equal(c.events[0].estado,'SIMULACION');assert.equal(c.intents[0].fechaAntes,undefined);assert.equal(c.writes.length,0);
    c.events[0].proximoIntento=null;await worker.sincronizarCasa(7,{now,dryRun:false});assert.equal(c.writes.length,1);
});
test('legacy cutoff hooks cannot overwrite C3 or enqueue months without a real payment',async t=>{
    const c=setup(t);c.addTag();await worker.marcarPendiente(7);
    await assert.rejects(service.actualizar(7,2,c.tx),{status:400});assert.equal(c.writes.length,0);
    assert.equal((await require('../src/services/zkteco-corte-inicial.service').prepararCortesOctubre()).enabled,false);
});

test('two competing workers apply two queued payments once and in order', async t => {
    const c = setup(t); c.addTag('123', '2026-09-10');
    await c.pay('300', '0', 'payment-one');
    await c.pay('600', '0', 'payment-two');
    await Promise.all([
        worker.sincronizarCasa(7, { now, dryRun: false }),
        worker.sincronizarCasa(7, { now, dryRun: false })
    ]);
    assert.deepEqual(c.writes, [{ card: '123', end: '2026-10-10' }, { card: '123', end: '2026-12-10' }]);
    assert.ok(c.events.every(e => e.estado === 'COMPLETADO'));
});
