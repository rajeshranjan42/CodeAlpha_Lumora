/** Shrinks a photo to at most `max` px on its longest side and re-encodes it as JPEG (animated GIFs are kept). */
export async function compressImage(file, max = 1600, quality = 0.82) {
  if (file.type === 'image/gif' && file.size < 8 * 1024 * 1024) return { blob: file, mime: 'image/gif' };
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return { blob: file, mime: file.type || 'image/jpeg' };
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  return { blob: blob || file, mime: 'image/jpeg' };
}

/** Reads a video's length in seconds from its metadata. */
export const readDuration = (url) =>
  new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => resolve(v.duration);
    v.onerror = () => reject(new Error('Your browser can’t read this video. Try an MP4 (H.264) file.'));
    v.src = url;
  });

export const fmtTime = (s) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// Spotify songs are played by Spotify's own embedded player (the app gets no audio file for them)
const SPOTIFY_TRACK = /^https:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]{22})$/;
export const isSpotify = (url) => SPOTIFY_TRACK.test(url || '');
export const spotifyEmbed = (url) => {
  const m = SPOTIFY_TRACK.exec(url || '');
  return m ? `https://open.spotify.com/embed/track/${m[1]}?utm_source=generator&theme=0` : '';
};