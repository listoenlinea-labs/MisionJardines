const crypto = require('crypto');

function encryptionKey() {
    const raw = String(process.env.CONNECTIONS_ENCRYPTION_KEY || '').trim();
    if (!raw) {
        throw new Error('Falta CONNECTIONS_ENCRYPTION_KEY para guardar credenciales de integraciones');
    }
    return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function encryptSecret(value) {
    const plain = String(value || '');
    if (!plain) return null;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

function decryptSecret(value) {
    if (!value) return '';
    const [version, ivB64, tagB64, encryptedB64] = String(value).split(':');
    if (version !== 'v1' || !ivB64 || !tagB64 || !encryptedB64) {
        throw new Error('Formato de credencial cifrada no reconocido');
    }

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        encryptionKey(),
        Buffer.from(ivB64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

    return Buffer.concat([
        decipher.update(Buffer.from(encryptedB64, 'base64')),
        decipher.final()
    ]).toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
