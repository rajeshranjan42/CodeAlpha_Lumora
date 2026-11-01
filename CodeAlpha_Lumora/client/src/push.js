import { api } from './api.js';

/* Device push notifications (Web Push). The server needs VAPID keys; the browser needs a service worker. */
export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const b64ToBytes = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const registration = () =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) => setTimeout(() => rej(new Error('The app is still getting ready. Reload the page and try again.')), 8000)),
  ]);

export async function currentSubscription() {
  if (!pushSupported()) return null;
  try {
    return await (await registration()).pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Asks permission, subscribes this device and tells the server. Throws a readable Error on failure. */
export async function enablePush() {
  if (!pushSupported()) throw new Error('This browser can’t show device notifications');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error(permission === 'denied' ? 'Notifications are blocked. Allow them in your browser’s site settings.' : 'Permission was not given');
  const { enabled, publicKey } = await api.pushKey();
  if (!enabled) throw new Error('Device notifications aren’t set up on the server yet');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
    } catch (e) {
      throw new Error(`Couldn’t turn on notifications (${e.message})`);
    }
  }
  await api.pushSubscribe(sub.toJSON());
}

/** Turns device notifications off for this browser. */
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** After logging in: if this device already allowed notifications, attach it to the account that just logged in. */
export async function syncPush() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return;
    const sub = await currentSubscription();
    if (sub) await api.pushSubscribe(sub.toJSON());
  } catch {
    /* best effort */
  }
}

/** Before logging out: this device must stop receiving the account's notifications. Needs the token, so call it first. */
export async function dropPush() {
  try {
    await disablePush();
  } catch {
    /* best effort */
  }
}