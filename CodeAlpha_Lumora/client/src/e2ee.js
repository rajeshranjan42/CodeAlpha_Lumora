/*
 * Lumora end-to-end encryption (browser only, Web Crypto API, no libraries).
 *
 *  - Every user has an ECDH P-256 key pair created on their device.
 *  - The PUBLIC key is stored on the server; the private key never leaves the browser in
 *    readable form. A backup of it is encrypted with a key derived from the user's password
 *    (PBKDF2, 310k iterations, AES-GCM) so they can log in on another device.
 *  - For each chat, both people derive the same secret: ECDH(myPrivate, theirPublic) -> HKDF
 *    -> AES-GCM key. Each message gets a fresh random 12-byte IV and is bound to its
 *    conversation id (additional authenticated data).
 *  - The server only ever stores/relays ciphertext.
 */

import { assetUrl } from './api.js';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const ITERATIONS = 310000;
const te = new TextEncoder();
const td = new TextDecoder();

const subtle = () => {
  if (!window.crypto?.subtle)
    throw new Error('Encrypted messaging needs a secure connection (HTTPS or localhost).');
  return window.crypto.subtle;
};

const toB64 = (buf) => {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 1) s += String.fromCharCode(b[i]);
  return btoa(s);
};
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/* ───────── on-device key storage (IndexedDB, private key is non-extractable) ───────── */
const DB = 'lumora-e2ee';
const STORE = 'keys';

const openDb = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const idb = async (mode, fn) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req?.result);
    };
    tx.onerror = () => reject(tx.error);
  });
};

const memory = new Map(); // userId -> { privateKey, publicKey }
const sharedCache = new Map(); // `${userId}:${peerPublicKey}` -> AES key

/* ───────── key lifecycle ───────── */
async function passwordKey(password, salt, iterations, usage) {
  const base = await subtle().importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

/** New key pair + password-wrapped backup, ready to send to the server. */
export async function createKeys(password) {
  const pair = await subtle().generateKey(ECDH, true, ['deriveBits']);
  const pub = await subtle().exportKey('jwk', pair.publicKey);
  const privateJwk = await subtle().exportKey('jwk', pair.privateKey);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt, ITERATIONS, 'encrypt');
  const data = await subtle().encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(privateJwk)));

  return {
    publicKey: JSON.stringify({ crv: pub.crv, kty: pub.kty, x: pub.x, y: pub.y }), // canonical form
    privateJwk,
    backup: { salt: toB64(salt), iv: toB64(iv), data: toB64(data), iterations: ITERATIONS },
  };
}

/** Decrypt the server-held backup with the user's password. */
export async function unwrapPrivateKey(backup, password) {
  try {
    const key = await passwordKey(password, fromB64(backup.salt), backup.iterations, 'decrypt');
    const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(backup.iv) }, key, fromB64(backup.data));
    return JSON.parse(td.decode(plain));
  } catch {
    throw new Error('Could not unlock your encryption keys with this password.');
  }
}

/** Store the private key on this device as a NON-extractable CryptoKey. */
export async function installKeys(userId, privateJwk, publicKey) {
  const privateKey = await subtle().importKey('jwk', privateJwk, ECDH, false, ['deriveBits']);
  await idb('readwrite', (s) => s.put({ privateKey, publicKey }, userId));
  memory.set(userId, { privateKey, publicKey });
}

async function getKeys(userId) {
  if (memory.has(userId)) return memory.get(userId);
  const found = await idb('readonly', (s) => s.get(userId));
  if (!found) throw new Error('Encryption keys not found on this device. Please log in again.');
  memory.set(userId, found);
  return found;
}

export async function hasKeys(userId) {
  try {
    return !!(await getKeys(userId));
  } catch {
    return false;
  }
}

/** Called on logout: remove the private key from this device. */
export async function forgetKeys(userId) {
  memory.delete(userId);
  [...sharedCache.keys()].filter((k) => k.startsWith(`${userId}:`)).forEach((k) => sharedCache.delete(k));
  try {
    await idb('readwrite', (s) => s.delete(userId));
  } catch {
    /* nothing to delete */
  }
}

/* ───────── per-chat secret ───────── */
async function sharedKey(userId, peerPublicKey) {
  const id = `${userId}:${peerPublicKey}`;
  if (sharedCache.has(id)) return sharedCache.get(id);

  const { privateKey } = await getKeys(userId);
  const peer = await subtle().importKey('jwk', JSON.parse(peerPublicKey), ECDH, false, []);
  const bits = await subtle().deriveBits({ name: 'ECDH', public: peer }, privateKey, 256);
  const hkdf = await subtle().importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  const key = await subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: te.encode('lumora-e2ee-v1') },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  sharedCache.set(id, key);
  return key;
}

/* ───────── messages ───────── */
export async function encryptText(userId, peerPublicKey, conversationId, text) {
  if (!peerPublicKey)
    throw new Error('This person has not turned on encrypted messaging yet. They need to log in once.');
  const key = await sharedKey(userId, peerPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: te.encode(conversationId) },
    key,
    te.encode(text)
  );
  return { text: toB64(ct), iv: toB64(iv) };
}

/** Returns the plaintext, or null if it cannot be decrypted. Legacy plaintext messages pass through. */
export async function decryptMessage(userId, peerPublicKey, conversationId, msg) {
  if (!msg) return null;
  if (!msg.encrypted) return msg.text;
  if (!peerPublicKey) return null;
  try {
    const key = await sharedKey(userId, peerPublicKey);
    const plain = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromB64(msg.iv), additionalData: te.encode(conversationId) },
      key,
      fromB64(msg.text)
    );
    return td.decode(plain);
  } catch {
    return null;
  }
}

/** Same number on both phones if nobody is intercepting. */
export async function safetyNumber(userId, peerPublicKey) {
  const { publicKey } = await getKeys(userId);
  const [a, b] = [publicKey, peerPublicKey].sort();
  const hash = await subtle().digest('SHA-256', te.encode(`${a}|${b}`));
  const hex = [...new Uint8Array(hash)]
    .slice(0, 16)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return hex.match(/.{4}/g).join(' ');
}

/* ───────── photos & videos inside chats ─────────
 * The file is encrypted in the browser with a fresh random AES-256-GCM key; only the scrambled bytes are
 * uploaded. The key + IV travel INSIDE the end-to-end encrypted message, so only the two people in the chat
 * can ever open the file. */
export const MEDIA_PREFIX = '\u0001M';

export async function encryptFile(blob) {
  const key = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, key, await blob.arrayBuffer());
  return { blob: new Blob([ct]), key: toB64(await subtle().exportKey('raw', key)), iv: toB64(iv) };
}

const opened = new Map(); // url -> object URL (decrypted once per session)
export async function openEncryptedFile(media) {
  if (opened.has(media.u)) return opened.get(media.u);
  const res = await fetch(assetUrl(media.u));
  if (!res.ok) throw new Error('File not available any more');
  const key = await subtle().importKey('raw', fromB64(media.k), 'AES-GCM', false, ['decrypt']);
  const plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(media.iv) }, key, await res.arrayBuffer());
  const url = URL.createObjectURL(new Blob([plain], { type: media.mime }));
  opened.set(media.u, url);
  return url;
}

/** media = { u: url, k: key, iv, mime, kind: 'image' | 'video' } */
export const packMedia = (text, media) => MEDIA_PREFIX + JSON.stringify({ t: text || '', m: media });

/** Turns decrypted text into { text, media } (media is null for ordinary messages). */
export function unpackMedia(plain) {
  if (typeof plain !== 'string' || !plain.startsWith(MEDIA_PREFIX)) return { text: plain, media: null };
  try {
    const j = JSON.parse(plain.slice(MEDIA_PREFIX.length));
    return { text: j.t || '', media: j.m };
  } catch {
    return { text: plain, media: null };
  }
}

/** One-line text for the inbox / notifications ("📷 Photo", or the caption). */
export function previewText(plain) {
  if (plain == null) return plain;
  const { text, media } = unpackMedia(plain);
  if (!media) return text;
  return text || (media.kind === 'video' ? '🎥 Video' : '📷 Photo');
}