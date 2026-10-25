/*
 * Reads a video's length straight from its file header (no ffmpeg / extra packages needed).
 *   - MP4 / MOV : moov > mvhd  (timescale + duration)
 *   - WebM      : Segment > Info > Duration (x TimecodeScale)
 * Returns seconds, or null when the length cannot be determined (the browser also checks it).
 */
const fsp = require('fs').promises;

// Upload limits are by LENGTH, not file size.
const LIMITS = {
  STORY_SECONDS: 45,
  REEL_SECONDS: 90, // 1 minute 30 seconds
  TOLERANCE: 0.75, // seconds of slack for rounding between browser and container metadata
};

const readAt = async (fh, pos, len) => {
  const buf = Buffer.alloc(len);
  const { bytesRead } = await fh.read(buf, 0, len, pos);
  return buf.subarray(0, bytesRead);
};

/* ───────── MP4 / MOV ───────── */
async function mvhdSeconds(fh, start, end) {
  let pos = start;
  while (pos + 8 <= end) {
    const head = await readAt(fh, pos, 8);
    if (head.length < 8) return null;
    const size = head.readUInt32BE(0);
    if (size < 8) return null;
    if (head.toString('latin1', 4, 8) === 'mvhd') {
      const b = await readAt(fh, pos + 8, 32);
      if (b.length < 20) return null;
      let timescale;
      let duration;
      if (b[0] === 1) {
        timescale = b.readUInt32BE(20);
        duration = Number(b.readBigUInt64BE(24));
      } else {
        timescale = b.readUInt32BE(12);
        duration = b.readUInt32BE(16);
      }
      return timescale > 0 && duration > 0 ? duration / timescale : null;
    }
    pos += size;
  }
  return null;
}

async function mp4Seconds(fh, fileSize) {
  let pos = 0;
  while (pos + 8 <= fileSize) {
    const head = await readAt(fh, pos, 16);
    if (head.length < 8) return null;
    let size = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    let header = 8;
    if (size === 1) {
      if (head.length < 16) return null;
      size = Number(head.readBigUInt64BE(8));
      header = 16;
    } else if (size === 0) {
      size = fileSize - pos; // box runs to end of file
    }
    if (size < header) return null;
    if (type === 'moov') return mvhdSeconds(fh, pos + header, pos + size);
    pos += size; // jump over big boxes such as mdat without reading them
  }
  return null;
}

/* ───────── WebM (EBML) ───────── */
const readId = (buf, pos) => {
  const first = buf[pos];
  if (first === undefined) return null;
  let len = 1;
  for (let mask = 0x80; len <= 4 && !(first & mask); mask >>= 1) len += 1;
  if (len > 4 || pos + len > buf.length) return null;
  let value = 0;
  for (let i = 0; i < len; i += 1) value = value * 256 + buf[pos + i];
  return { value, len };
};

const readSize = (buf, pos) => {
  const first = buf[pos];
  if (first === undefined) return null;
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && !(first & mask)) {
    len += 1;
    mask >>= 1;
  }
  if (len > 8 || pos + len > buf.length) return null;
  let value = first & (mask - 1);
  let unknown = value === mask - 1;
  for (let i = 1; i < len; i += 1) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) unknown = false;
  }
  return { value, len, unknown };
};

const element = (buf, pos) => {
  const id = readId(buf, pos);
  if (!id) return null;
  const size = readSize(buf, pos + id.len);
  if (!size) return null;
  return { id: id.value, header: id.len + size.len, size: size.value, unknown: size.unknown };
};

function webmInfoSeconds(buf) {
  let pos = 0;
  let scale = 1000000; // default TimecodeScale (ns)
  let duration = null;
  while (pos < buf.length) {
    const e = element(buf, pos);
    if (!e || e.unknown) break;
    const body = buf.subarray(pos + e.header, pos + e.header + e.size);
    if (e.id === 0x2ad7b1) scale = body.reduce((a, b) => a * 256 + b, 0); // TimecodeScale
    if (e.id === 0x4489) duration = body.length === 4 ? body.readFloatBE(0) : body.length === 8 ? body.readDoubleBE(0) : null; // Duration
    pos += e.header + e.size;
  }
  return duration && duration > 0 ? (duration * scale) / 1e9 : null;
}

function webmSeconds(buf) {
  let pos = 0;
  while (pos < buf.length) {
    const e = element(buf, pos);
    if (!e) return null;
    if (e.id === 0x18538067) {
      pos += e.header; // Segment: look at its children
      continue;
    }
    if (e.id === 0x1549a966) return webmInfoSeconds(buf.subarray(pos + e.header, pos + e.header + e.size)); // Info
    if (e.unknown) return null;
    pos += e.header + e.size;
  }
  return null;
}

/** Seconds of video in `filePath`, or null if unknown. Never throws. */
async function getVideoDuration(filePath, mimetype = '') {
  let fh;
  try {
    fh = await fsp.open(filePath, 'r');
    const { size } = await fh.stat();
    if (mimetype.includes('webm')) return webmSeconds(await readAt(fh, 0, Math.min(size, 2 * 1024 * 1024)));
    return await mp4Seconds(fh, size);
  } catch {
    return null;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

const fmt = (s) => {
  const t = Math.round(s);
  return t >= 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : `${t}s`;
};

/** Returns an error message if the video is too long, otherwise null. */
async function checkDuration(file, maxSeconds, noun) {
  const secs = await getVideoDuration(file.path, file.mimetype);
  if (secs !== null && secs > maxSeconds + LIMITS.TOLERANCE)
    return `${noun} can be up to ${fmt(maxSeconds)} long. This video is ${fmt(secs)}.`;
  return null;
}

module.exports = { getVideoDuration, checkDuration, LIMITS };