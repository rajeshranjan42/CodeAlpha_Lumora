const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const IMAGES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const VIDEOS = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };

const build = (types, maxMb, message, maxFiles = 1) =>
  multer({
    storage: multer.diskStorage({
      destination: path.join(__dirname, '..', 'uploads'),
      // random name + extension derived from the verified mimetype (never trust the client filename)
      filename: (_req, file, cb) =>
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${types[file.mimetype]}`),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: maxFiles },
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

// multi-photo posts (up to 10 images, 5 MB each)
upload.images = build(IMAGES, 5, 'Only JPG, PNG, WEBP or GIF images are allowed', 10);

// end-to-end encrypted chat photos/videos: the browser uploads an opaque encrypted blob, so the type is not checked
upload.chat = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads'),
    // the owner's id is part of the name so a message can only reference the sender's own uploads
    // no file extension on purpose: Cloudinary refuses uploads whose extension it doesn't know (e.g. ".bin")
    filename: (req, _file, cb) => cb(null, `chat-${req.userId}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`),
  }),
  limits: { fileSize: 110 * 1024 * 1024, files: 1 },
});

// songs people add themselves (music picker -> "My audio"); the owner's id is part of the name
const AUDIO = { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg' };
upload.audio = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads'),
    filename: (req, file, cb) => cb(null, `music-${req.userId}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}${AUDIO[file.mimetype]}`),
  }),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    AUDIO[file.mimetype] ? cb(null, true) : cb(Object.assign(new Error('Please choose an MP3, M4A, AAC, WAV or OGG audio file'), { status: 400 })),
});

module.exports = upload;