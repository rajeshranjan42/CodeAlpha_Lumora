/*
 * File storage.
 *  - Without Cloudinary settings: files stay in server/uploads and are served at /uploads/... (fine on your own PC).
 *  - With CLOUDINARY_* settings: files are moved to Cloudinary right after validation and the permanent
 *    https URL is stored. REQUIRED on Render: its disk is wiped on every restart/sleep, which is why videos
 *    "stopped playing after some time".
 * No extra npm package: this talks to Cloudinary's REST API with Node's built-in fetch.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHUNK = 20 * 1024 * 1024; // files bigger than this go up in pieces

function config() {
  let cloud = process.env.CLOUDINARY_CLOUD_NAME;
  let key = process.env.CLOUDINARY_API_KEY;
  let secret = process.env.CLOUDINARY_API_SECRET;
  const url = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(process.env.CLOUDINARY_URL || '');
  if (url) [, key, secret, cloud] = url;
  return cloud && key && secret ? { cloud, key, secret } : null;
}
exports.enabled = () => !!config();

const sign = (params, secret) =>
  crypto
    .createHash('sha1')
    .update(
      Object.keys(params)
        .filter((k) => params[k] !== undefined && params[k] !== '')
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&') + secret
    )
    .digest('hex');

const friendly = (msg) =>
  /too large|file size/i.test(msg)
    ? 'This file is too large for the storage plan (Cloudinary free: videos up to 100 MB, photos up to 10 MB).'
    : `Upload failed: ${msg}`;

async function post(cfg, type, action, fields, headers = {}, filename = 'file') {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Blob) form.append(k, v, filename);
    else form.append(k, v);
  }
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloud}/${type}/${action}`, { method: 'POST', body: form, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(friendly(data.error?.message || res.statusText)), { status: 400 });
  return data;
}

/** Stores a multer file and returns the URL/path to save in the database. type: image | video | raw */
exports.save = async (file, type = 'image') => {
  const local = `/uploads/${file.filename}`;
  const cfg = config();
  if (!cfg) return local;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { folder: 'lumora', timestamp, ...(type === 'raw' ? { public_id: file.filename } : {}) };
    const base = { ...params, api_key: cfg.key, signature: sign(params, cfg.secret) };
    const total = fs.statSync(file.path).size;
    const blob = await fs.openAsBlob(file.path);
    let data;
    if (total <= CHUNK) {
      data = await post(cfg, type, 'upload', { ...base, file: blob }, {}, file.filename);
    } else {
      const id = crypto.randomBytes(8).toString('hex');
      for (let start = 0; start < total; start += CHUNK) {
        const end = Math.min(start + CHUNK, total) - 1;
        data = await post(
          cfg,
          type,
          'upload',
          { ...base, file: blob.slice(start, end + 1) },
          { 'X-Unique-Upload-Id': id, 'Content-Range': `bytes ${start}-${end}/${total}` },
          file.filename
        );
      }
    }
    if (!data?.secure_url) throw new Error('no URL returned');
    return data.secure_url;
  } finally {
    fs.unlink(file.path, () => {}); // the local copy is only a staging file
  }
};

const CLD_URL = /^https:\/\/res\.cloudinary\.com\/([^/]+)\/(image|video|raw)\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(lumora\/[^?#]+)$/;
exports.CLD_URL = CLD_URL;

/** Deletes a stored file (local path or Cloudinary URL). Never throws. */
exports.remove = async (url) => {
  try {
    if (!url) return;
    if (url.startsWith('/uploads/')) return fs.unlink(path.join(__dirname, '..', 'uploads', path.basename(url)), () => {});
    const cfg = config();
    const m = CLD_URL.exec(url);
    if (!cfg || !m || m[1] !== cfg.cloud) return;
    const publicId = m[2] === 'raw' ? m[3] : m[3].replace(/\.[^./]+$/, '');
    const params = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000), invalidate: 'true' };
    await post(cfg, m[2], 'destroy', { ...params, api_key: cfg.key, signature: sign(params, cfg.secret) });
  } catch (err) {
    console.error('storage remove failed:', err.message);
  }
};

/** Does this chat attachment belong to `userId`? Works for both storage modes. */
exports.ownsChatFile = (att, userId) => {
  if (!att) return false;
  const local = /^\/uploads\/(chat-([a-f0-9]{24})-[\w-]+\.bin)$/.exec(att);
  if (local) return local[2] === userId && fs.existsSync(path.join(__dirname, '..', 'uploads', local[1]));
  const cfg = config();
  const m = CLD_URL.exec(att);
  return !!(cfg && m && m[1] === cfg.cloud && m[2] === 'raw' && new RegExp(`^lumora/chat-${userId}-[\\w-]+\\.bin$`).test(m[3]));
};