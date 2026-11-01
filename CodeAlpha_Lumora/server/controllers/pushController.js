const PushSubscription = require('../models/PushSubscription');
const push = require('../utils/push');

/** The public VAPID key the browser needs to subscribe. */
exports.key = (_req, res) => {
  res.json({ enabled: push.enabled(), publicKey: push.enabled() ? process.env.VAPID_PUBLIC_KEY : '' });
};

const valid = (s) =>
  s &&
  typeof s.endpoint === 'string' &&
  /^https:\/\//.test(s.endpoint) &&
  s.endpoint.length <= 1000 &&
  s.keys &&
  typeof s.keys.p256dh === 'string' &&
  typeof s.keys.auth === 'string' &&
  s.keys.p256dh.length <= 200 &&
  s.keys.auth.length <= 100;

/** Saves this device for the logged-in user (re-assigns it if another account used the same browser before). */
exports.subscribe = async (req, res, next) => {
  try {
    if (!push.enabled()) return res.status(503).json({ message: 'Push notifications are not set up on the server yet' });
    const s = req.body?.subscription;
    if (!valid(s)) return res.status(400).json({ message: 'Invalid subscription' });
    await PushSubscription.findOneAndUpdate(
      { endpoint: s.endpoint },
      { user: req.userId, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, userAgent: String(req.get('user-agent') || '').slice(0, 200) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
};

/** Stops pushes to this device (turn off, or log out). Only removes the caller's own subscription. */
exports.unsubscribe = async (req, res, next) => {
  try {
    const endpoint = String(req.body?.endpoint || '');
    if (endpoint) await PushSubscription.deleteOne({ endpoint, user: req.userId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};