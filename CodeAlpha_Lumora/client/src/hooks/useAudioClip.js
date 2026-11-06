import { useEffect, useRef } from 'react';
import { assetUrl } from '../api.js';
import { isSpotify } from '../mediaUtils.js';

/** Plays a song (looping) while `active` is true. Used behind reels and stories. */
export function useAudioClip(url, { active = true, muted = false } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!url || isSpotify(url)) return undefined; // Spotify songs can't be played behind a reel / story
    const a = new Audio(assetUrl(url));
    a.loop = true;
    a.preload = 'auto';
    ref.current = a;
    return () => {
      a.pause();
      a.removeAttribute('src');
      a.load();
      ref.current = null;
    };
  }, [url]);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.muted = muted;
    if (active) a.play().catch(() => {});
    else a.pause();
  }, [active, muted, url]);
}