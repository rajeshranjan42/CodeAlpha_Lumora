/**
 * ICE servers the browser uses to connect a call.
 * STUN (free, Google) works for most home and office networks. Phones on mobile data often need a TURN relay:
 * set TURN_URL (e.g. turn:global.relay.metered.ca:443?transport=tcp), TURN_USERNAME and TURN_CREDENTIAL,
 * or put a full JSON array in ICE_SERVERS_JSON.
 */
exports.ice = (_req, res) => {
  let servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  try {
    if (process.env.ICE_SERVERS_JSON) {
      const j = JSON.parse(process.env.ICE_SERVERS_JSON);
      if (Array.isArray(j) && j.length) servers = j;
    } else if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      servers.push({
        urls: process.env.TURN_URL.split(',').map((u) => u.trim()).filter(Boolean),
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }
  } catch (err) {
    console.error('ICE_SERVERS_JSON is not valid JSON:', err.message);
  }
  res.json({ iceServers: servers });
};