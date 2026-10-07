const test = require('node:test');
const assert = require('node:assert/strict');
const proxyaddr = require('proxy-addr');
const express = require('express');

test('un prefijo IPv6 corto no convierte clientes IPv4 en proxies confiables', () => {
    for (const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
        const trust = proxyaddr.compile(subnet);
        assert.equal(trust('203.0.113.25', 0), false, subnet);
        assert.equal(trust('::ffff:203.0.113.25', 0), false, subnet);
        const request = { socket: { remoteAddress: '203.0.113.25' },
            headers: { 'x-forwarded-for': '198.51.100.99' } };
        assert.equal(proxyaddr(request, trust), '203.0.113.25', subnet);
    }
});

test('los bloques IPv4 y IPv4-mapped completos siguen aceptando únicamente su red', () => {
    for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104']) {
        const trust = proxyaddr.compile(subnet);
        assert.equal(trust('10.25.30.40', 0), true, subnet);
        assert.equal(trust('::ffff:10.25.30.40', 0), true, subnet);
        assert.equal(trust('203.0.113.25', 0), false, subnet);
    }
});

test('Express con un salto usa la IP más cercana indicada por el proxy, no una entrada anterior', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/', (req, res) => res.json({ ip: req.ip, ips: req.ips }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {
            headers: { 'X-Forwarded-For': '198.51.100.99, 203.0.113.25' }
        });
        assert.deepEqual(await response.json(), { ip: '203.0.113.25', ips: ['203.0.113.25'] });
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
