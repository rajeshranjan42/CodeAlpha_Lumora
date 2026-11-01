const PushSubscription = require('../models/PushSubscription');

/** Web Push is on only when the VAPID keys are set (see scripts/vapid-keys.js). */
const enabled = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let lib;
function webpush() {
  if (lib) return lib;
  lib = require('web-push');
  lib.setVapidDetails(
    process.env.VAPID_SUBJECT || `mailto:${process.env.GMAIL_USER || 'admin@example.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return lib;
}

/**
 * Sends a notification to every device of one user. Never throws (it must not break the action that caused it).
 * payload: { title, body, url, tag?, icon? }
 */
exports.sendTo = async (userId, payload) => {
  if (!enabled()) return;
  try {
    const subs = await PushSubscription.find({ user: userId });
    if (!subs.length) return;
    const wp = webpush();
    const body = JSON.stringify({ icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', ...payload });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, body, {
            TTL: 60 * 60 * 24,
            urgency: 'normal',
          });
        } catch (err) {
          // 404 / 410 = the user revoked permission or uninstalled the app: forget this device
          if (err.statusCode === 404 || err.statusCode === 410) await PushSubscription.deleteOne({ _id: s._id }).catch(() => {});
          else console.error('push failed:', err.statusCode || err.message);
        }
      })
    );
  } catch (err) {
    console.error('push failed:', err.message);
  }
};

exports.enabled = enabled;