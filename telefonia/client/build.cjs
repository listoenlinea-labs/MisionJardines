const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');
const destination = path.resolve(__dirname, '../../backend/public/vendor');
fs.mkdirSync(destination, { recursive: true });
esbuild.buildSync({
    entryPoints: [require.resolve('jssip')],
    outfile: path.join(destination, 'jssip-3.10.1.min.js'),
    bundle: true, minify: true, platform: 'browser', format: 'iife', globalName: 'JsSIP',
    banner: { js: '/*! JsSIP 3.10.1. Licencias: jssip-LICENSES.txt. Build reproducible: telefonia/client. */' }
});
const notices = ['jssip', 'events', 'debug', 'ms', 'sdp-transform'].map(name => {
    const dir = path.dirname(require.resolve(name + '/package.json'));
    const license = fs.readdirSync(dir).find(file => /^license(?:\.txt|\.md)?$/i.test(file));
    if (!license) throw new Error('No se encontró la licencia de ' + name);
    return name + '\n' + fs.readFileSync(path.join(dir, license), 'utf8');
});
fs.writeFileSync(path.join(destination, 'jssip-LICENSES.txt'), notices.join('\n\n--------------------\n\n'));
