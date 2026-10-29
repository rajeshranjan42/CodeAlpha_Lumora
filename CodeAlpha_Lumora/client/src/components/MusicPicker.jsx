import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import { CheckIcon, MusicIcon, PauseIcon, PlayIcon, SearchIcon } from './Icons.jsx';
import { fmtTime } from '../mediaUtils.js';

/** Music library: search royalty-free songs, preview them, pick one. */
export default function MusicPicker({ current, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [tracks, setTracks] = useState(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null);
  const audio = useRef(null);

  useEffect(() => {
    let alive = true;
    setError('');
    const t = setTimeout(
      () => {
        api
          .music(q.trim())
          .then((d) => alive && setTracks(d.tracks))
          .catch((e) => {
            if (!alive) return;
            setTracks([]);
            setError(e.message);
          });
      },
      q ? 350 : 0
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(
    () => () => {
      audio.current?.pause();
    },
    []
  );

  const preview = (t) => {
    if (playing === t.id) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    const a = new Audio(t.url);
    a.onended = () => setPlaying(null);
    a.play().catch(() => setError('Couldn’t play that preview'));
    audio.current = a;
    setPlaying(t.id);
  };

  const pick = (t) => {
    audio.current?.pause();
    onPick({ id: t.id, title: t.title, artist: t.artist, cover: t.cover, url: t.url });
  };

  return createPortal(
    <Modal title="Add music" onClose={onClose}>
      <div className="searchbar">
        <SearchIcon width={20} height={20} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search songs or artists"
          aria-label="Search music"
        />
      </div>
      {error && <p className="error small">{error}</p>}
      <p className="muted tiny music-note">{q ? 'Results' : 'Trending this week'} · royalty-free music by Jamendo</p>

      <div className="music-list">
        {tracks === null && <p className="muted center">Loading songs…</p>}
        {tracks?.length === 0 && !error && <p className="muted center">No songs found.</p>}
        {tracks?.map((t) => (
          <div key={t.id} className={`music-row ${current?.id === t.id ? 'on' : ''}`}>
            <button type="button" className="music-play" onClick={() => preview(t)} aria-label={playing === t.id ? 'Pause preview' : 'Play preview'}>
              {t.cover ? <img src={t.cover} alt="" loading="lazy" /> : <span className="music-art"><MusicIcon width={20} height={20} /></span>}
              <i>{playing === t.id ? <PauseIcon width={16} height={16} /> : <PlayIcon width={16} height={16} />}</i>
            </button>
            <span className="music-text">
              <strong>{t.title}</strong>
              <span>{t.artist}{t.duration ? ` · ${fmtTime(t.duration)}` : ''}</span>
            </span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => pick(t)}>
              {current?.id === t.id ? <CheckIcon width={16} height={16} /> : 'Use'}
            </button>
          </div>
        ))}
      </div>
    </Modal>,
    document.body
  );
}