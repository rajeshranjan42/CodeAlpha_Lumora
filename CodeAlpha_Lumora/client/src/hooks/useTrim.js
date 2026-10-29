import { useEffect } from 'react';

/**
 * Plays only the window [start, end] of a video (a "trimmed" reel / story) by seeking back to `start`
 * whenever playback reaches `end`. With no window (0/0) it does nothing and the video plays normally.
 * Returns nothing; attach to a <video> ref.
 */
export function useTrim(ref, start = 0, end = 0, onWrap) {
  useEffect(() => {
    const v = ref.current;
    if (!v || !end) return undefined;
    const seekStart = () => {
      if (v.currentTime < start - 0.3 || v.currentTime > end) v.currentTime = start;
    };
    let fired = false; // a callback (e.g. "next story") must run only once
    const tick = () => {
      if (v.currentTime >= end - 0.05) {
        if (!onWrap) v.currentTime = start;
        else if (!fired) {
          fired = true;
          onWrap();
        }
      }
    };
    v.addEventListener('loadedmetadata', seekStart);
    v.addEventListener('play', seekStart);
    v.addEventListener('timeupdate', tick);
    if (v.readyState >= 1) seekStart();
    return () => {
      v.removeEventListener('loadedmetadata', seekStart);
      v.removeEventListener('play', seekStart);
      v.removeEventListener('timeupdate', tick);
    };
  }, [ref, start, end, onWrap]);
}

/** 0..1 progress inside the playing window (or the whole video). */
export function windowProgress(v, start = 0, end = 0) {
  if (!v || !v.duration) return 0;
  const a = end ? start : 0;
  const b = end || v.duration;
  return Math.min(1, Math.max(0, (v.currentTime - a) / (b - a || 1)));
}

/** Media-fragment suffix for thumbnails: shows the first frame of the window. */
export const thumbHash = (start = 0) => `#t=${(start || 0) + 0.1}`;