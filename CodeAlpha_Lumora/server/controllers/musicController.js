/*
 * Music library: a thin proxy to the Jamendo API (royalty-free songs).
 * Needs a free client id: https://devportal.jamendo.com  ->  JAMENDO_CLIENT_ID in server/.env
 * The browser plays the returned mp3 stream URLs directly; nothing is stored on this server.
 */
const fs = require('fs');
const storage = require('../utils/storage');
const API = 'https://api.jamendo.com/v3.0/tracks/';
const ITUNES = 'https://itunes.apple.com/search';
const SPOTIFY = 'https://api.spotify.com/v1/search';
const cache = new Map(); // key -> { at, tracks }
const TTL = 10 * 60 * 1000;

const shape = (t) => ({
  id: String(t.id),
  title: t.name,
  artist: t.artist_name,
  cover: t.image || t.album_image || '',
  url: t.audio,
  duration: t.duration,
});

// Hindi / Bollywood: Apple's public iTunes Search API (no key needed) gives 30-second previews of real songs
const hindi = async (q) => {
  const key = `hi:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.tracks;
  const params = new URLSearchParams({ term: q || 'bollywood', country: 'IN', media: 'music', entity: 'song', limit: '30' });
  const r = await fetch(`${ITUNES}?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw Object.assign(new Error('Hindi songs are unavailable right now'), { status: 502 });
  const data = await r.json();
  const seen = new Set();
  const tracks = (data.results || [])
    .filter((t) => t.previewUrl && /^https:/.test(t.previewUrl) && t.trackId && !seen.has(t.trackId) && seen.add(t.trackId))
    .map((t) => ({
      id: `it-${t.trackId}`,
      title: t.trackName,
      artist: t.artistName,
      cover: (t.artworkUrl100 || '').replace('100x100bb', '300x300bb'),
      url: t.previewUrl,
      duration: 30,
    }));
  cache.set(key, { at: Date.now(), tracks });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return tracks;
};

// Spotify: search only (cover, title, artist). Spotify no longer gives new apps an audio preview, so the app plays the
// song with Spotify's own embedded player. Uses the "client credentials" flow: no user login, just the app's id + secret.
let spToken = { value: '', exp: 0 };
let spPending = null; // one token request at a time, even when two searches run together
const spotifyToken = async () => {
  if (spToken.value && Date.now() < spToken.exp - 30000) return spToken.value;
  if (!spPending) spPending = fetchSpotifyToken().finally(() => (spPending = null));
  return spPending;
};
const fetchSpotifyToken = async () => {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(8000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw Object.assign(new Error('Spotify rejected the server’s credentials'), { status: 502 });
  spToken = { value: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return spToken.value;
};

const spotify = async (q) => {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET)
    throw Object.assign(new Error('Spotify isn’t set up yet (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are missing on the server).'), { status: 503 });
  const key = `sp:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.tracks;
  // Spotify's development mode allows at most 10 results per search, so ask for two pages
  const page = async (offset) => {
    const params = new URLSearchParams({ q: q || 'bollywood hits', type: 'track', limit: '10', offset: String(offset), market: 'IN' });
    const go = async () => fetch(`${SPOTIFY}?${params}`, { headers: { Authorization: `Bearer ${await spotifyToken()}` }, signal: AbortSignal.timeout(8000) });
    let r = await go();
    if (r.status === 401) {
      spToken = { value: '', exp: 0 }; // token went stale: get a new one once
      r = await go();
    }
    if (r.status === 429) throw Object.assign(new Error('Spotify is busy, try again in a moment'), { status: 503 });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      const why = (body.error && (body.error.message || body.error)) || r.statusText;
      console.error(`Spotify search failed (${r.status}): ${why}`);
      throw Object.assign(
        new Error(
          r.status === 403
            ? 'Spotify refused the request. In development mode the app owner’s Spotify account must be Premium.'
            : `Spotify is unavailable right now (${r.status}${why ? `: ${String(why).slice(0, 80)}` : ''})`
        ),
        { status: 502 }
      );
    }
    const data = await r.json();
    return (data.tracks && data.tracks.items) || [];
  };
  const pages = await Promise.all([page(0), page(10)]);
  const tracks = pages
    .flat()
    .filter((t, i, all) => t && /^[A-Za-z0-9]{22}$/.test(t.id || '') && all.findIndex((x) => x && x.id === t.id) === i)
    .map((t) => ({
      id: `sp-${t.id}`,
      title: t.name,
      artist: (t.artists || []).map((a) => a.name).join(', '),
      cover: ((t.album && t.album.images && (t.album.images[1] || t.album.images[0])) || {}).url || '',
      url: `https://open.spotify.com/track/${t.id}`,
      duration: Math.round((t.duration_ms || 0) / 1000),
    }));
  if (!tracks.length) console.error(`Spotify search returned no tracks for "${q}"`);
  if (tracks.length) {
    cache.set(key, { at: Date.now(), tracks }); // empty answers aren't cached, so a fix shows up right away
    if (cache.size > 200) cache.delete(cache.keys().next().value);
  }
  return tracks;
};

exports.search = async (req, res, next) => {
  try {
    if (req.query.source === 'spotify') return res.json({ tracks: await spotify(String(req.query.q || '').trim().slice(0, 60)) });
    if (req.query.source === 'hindi') return res.json({ tracks: await hindi(String(req.query.q || '').trim().slice(0, 60)) });

    const clientId = process.env.JAMENDO_CLIENT_ID;
    if (!clientId) return res.status(503).json({ message: 'The music library isn’t set up yet (JAMENDO_CLIENT_ID is missing on the server).' });

    const q = String(req.query.q || '').trim().slice(0, 60);
    const key = q.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return res.json({ tracks: hit.tracks });

    const params = new URLSearchParams({
      client_id: clientId,
      format: 'json',
      limit: '25',
      audioformat: 'mp32',
      imagesize: '200',
      include: 'musicinfo',
      audiodlformat: 'mp32',
    });
    if (q) params.set('search', q);
    else params.set('order', 'popularity_week');

    const r = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw Object.assign(new Error('Music service is unavailable'), { status: 502 });
    const data = await r.json();
    if (data.headers && data.headers.status === 'failed')
      throw Object.assign(new Error(data.headers.error_message || 'Music service error'), { status: 502 });

    const tracks = (data.results || []).filter((t) => t.audio).map(shape);
    cache.set(key, { at: Date.now(), tracks });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    res.json({ tracks });
  } catch (err) {
    if (err.name === 'TimeoutError') err = Object.assign(new Error('Music service timed out, try again'), { status: 504 });
    next(err);
  }
};

// does the start of the file really look like audio? (the browser-reported type alone is not trusted)
const looksLikeAudio = (buf) =>
  (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || // MP3 with ID3 tag
  (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) || // MP3 / AAC frame
  buf.slice(4, 8).toString() === 'ftyp' || // M4A / MP4
  buf.slice(0, 4).toString() === 'RIFF' || // WAV
  buf.slice(0, 4).toString() === 'OggS'; // OGG

/** A song the user uploads from their device, so they can use it on a post / story / reel. */
exports.uploadTrack = async (req, res, next) => {
  const file = req.file;
  try {
    if (!file) return res.status(400).json({ message: 'Choose an audio file' });
    const head = Buffer.alloc(12);
    const fd = fs.openSync(file.path, 'r');
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    if (!looksLikeAudio(head)) {
      fs.unlink(file.path, () => {});
      return res.status(400).json({ message: 'That file doesn’t look like audio' });
    }
    const base = file.filename.replace(/\.[^.]+$/, '');
    const url = await storage.save(file, 'video', base); // Cloudinary stores audio under "video"
    const clean = (v, n) => String(v || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
    const fallback = clean(String(file.originalname || '').replace(/\.[^.]+$/, ''), 80);
    res.status(201).json({
      track: { id: `up-${base}`.slice(0, 30), title: clean(req.body.title, 80) || fallback || 'My song', artist: clean(req.body.artist, 80) || 'My upload', cover: '', url },
    });
  } catch (err) {
    if (file) fs.unlink(file.path, () => {});
    next(err);
  }
};