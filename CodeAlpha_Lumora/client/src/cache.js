/*
 * Tiny in-memory cache so switching between Home / Explore / Reels / Profile / Messages shows the last
 * data instantly while fresh data loads quietly in the background (no more "Loading…" every time).
 * Cleared on login/logout so one account never sees another's data.
 */
const store = new Map();

export const cache = {
  get: (key) => store.get(key),
  set: (key, value) => {
    store.set(key, value);
    return value;
  },
  clear: () => store.clear(),
};