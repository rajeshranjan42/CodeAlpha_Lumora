import { useEffect, useRef, useState } from 'react';
import { MusicIcon, PauseIcon, PlayIcon } from './Icons.jsx';
import { assetUrl } from '../api.js';
import { spotifyEmbed } from '../mediaUtils.js';

let current = null; // only one song plays at a time across the feed

/** The song bar under a post. Plays while the post is on screen; tap to pause / resume. */
export default function PostMusic({ music, className = '' }) {
  const embed = spotifyEmbed(music.url);
  // Spotify: its own small player (30-second preview, or the full song when the viewer is signed in to Spotify Premium)
  if (embed)
    return (
      <iframe
        className={`post-spotify ${className}`}
        src={embed}
        title={`${music.title} on Spotify`}
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      />
    );
  return <PostAudio music={music} className={className} />;
}

function PostAudio({ music, className = '' }) {
  const box = useRef(null);
  const audio = useRef(null);
  const userOff = useRef(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const a = new Audio(assetUrl(music.url));
    a.loop = true;
    a.preload = 'none';
    a.onplay = () => setOn(true);
    a.onpause = () => setOn(false);
    audio.current = a;
    return () => {
      a.pause();
      if (current === a) current = null;
    };
  }, [music.url]);

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        const a = audio.current;
        if (!a) return;
        if (e.intersectionRatio >= 0.6 && !userOff.current) {
          if (current && current !== a) current.pause();
          current = a;
          a.play().catch(() => {}); // blocked until the first tap on the page: the button still works
        } else a.pause();
      },
      { threshold: [0, 0.6] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [music.url]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      userOff.current = false;
      if (current && current !== a) current.pause();
      current = a;
      a.play().catch(() => {});
    } else {
      userOff.current = true;
      a.pause();
    }
  };

  return (
    <button type="button" ref={box} className={`post-music ${on ? 'on' : ''} ${className}`} onClick={toggle} aria-label={on ? 'Pause song' : 'Play song'}>
      {music.cover ? <img src={music.cover} alt="" /> : <MusicIcon width={18} height={18} />}
      <span className="post-music-text">
        <strong>{music.title}</strong>
        <span>{music.artist}</span>
      </span>
      <span className="post-music-eq" aria-hidden="true">
        {on ? <PauseIcon width={14} height={14} /> : <PlayIcon width={14} height={14} />}
      </span>
    </button>
  );
}
