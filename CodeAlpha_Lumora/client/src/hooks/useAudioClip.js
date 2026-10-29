import { useEffect, useRef } from 'react';

/** Plays a song (looping) while `active` is true. Used behind reels and stories. */
export function useAudioClip(url, { active = true, muted = false } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!url) return undefined;
    const a = new Audio(url);
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