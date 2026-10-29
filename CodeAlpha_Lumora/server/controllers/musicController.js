/*
 * Music library: a thin proxy to the Jamendo API (royalty-free songs).
 * Needs a free client id: https://devportal.jamendo.com  ->  JAMENDO_CLIENT_ID in server/.env
 * The browser plays the returned mp3 stream URLs directly; nothing is stored on this server.
 */
const API = 'https://api.jamendo.com/v3.0/tracks/';
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

exports.search = async (req, res, next) => {
  try {
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