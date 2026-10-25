const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const IMAGES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const VIDEOS = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };

const build = (types, maxMb, message) =>
  multer({
    storage: multer.diskStorage({
      destination: path.join(__dirname, '..', 'uploads'),
      // random name + extension derived from the verified mimetype (never trust the client filename)
      filename: (_req, file, cb) =>
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${types[file.mimetype]}`),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (types[file.mimetype]) return cb(null, true);
      cb(Object.assign(new Error(message), { status: 400 }));
    },
  });

// default export = images only (posts, avatars), 5 MB
const upload = build(IMAGES, 5, 'Only JPG, PNG, WEBP or GIF images are allowed');
// Videos are limited by LENGTH (reels 1:30, stories 0:45; see utils/videoDuration.js), not by size.
// This high ceiling only protects the server's disk from absurd uploads.
const VIDEO_CEILING_MB = 2048;
// stories: image or video
upload.media = build(
  { ...IMAGES, ...VIDEOS },
  VIDEO_CEILING_MB,
  'Please choose an image (JPG, PNG, WEBP, GIF) or a video (MP4, WEBM, MOV)'
);
// reels: video only
upload.video = build(VIDEOS, VIDEO_CEILING_MB, 'Please choose a video (MP4, WEBM or MOV)');

module.exports = upload;