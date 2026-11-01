// Prints a fresh VAPID key pair for Web Push. Run once:  node scripts/vapid-keys.js
// Put the two values in the server environment (Render → Environment) and never share the private one.
const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const prv = privateKey.export({ format: 'jwk' });
const b64u = (s) => s; // JWK already uses base64url
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
console.log(`VAPID_PUBLIC_KEY=${raw.toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${b64u(prv.d)}`);
console.log('VAPID_SUBJECT=mailto:lumoracodealpha.in@gmailcom');