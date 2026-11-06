import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import { CheckIcon, MusicIcon, PauseIcon, PlayIcon, SearchIcon } from './Icons.jsx';
import { assetUrl } from '../api.js';
import { fmtTime, isSpotify, spotifyEmbed } from '../mediaUtils.js';

const TABS = [
  { id: 'spotify', label: 'Spotify' },
  { id: 'hindi', label: 'Hindi' },
  { id: 'jamendo', label: 'Free' },
  { id: 'mine', label: 'My audio' },
];
const MAX_AUDIO_MB = 12;

/** Music library: Hindi / Bollywood songs, royalty-free music, or your own audio file. Preview, then pick one. */
export default function MusicPicker({ current, onPick, onClose }) {
  const [tab, setTab] = useState('spotify');
  const [q, setQ] = useState('');
  const [tracks, setTracks] = useState(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null);
  const [notSetUp, setNotSetUp] = useState(false); // Spotify keys missing on the server
  const audio = useRef(null);

  // "My audio" upload form
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [progress, setProgress] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    if (tab === 'mine') return undefined;
    let alive = true;
    setError('');
    setTracks(null);
    const t = setTimeout(
      () => {
        api
          .music(q.trim(), tab)
          .then((d) => alive && setTracks(d.tracks))
          .catch((e) => {
            if (!alive) return;
            setTracks([]);
            // Spotify keys not set on the server: start on the Hindi tab instead
            if (tab === 'spotify' && /isn.t set up/.test(e.message)) {
              setNotSetUp(true);
              return setTab('hindi');
            }
            setError(e.message);
          });
      },
      q ? 350 : 0
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, tab]);

  useEffect(
    () => () => {
      audio.current?.pause();
    },
    []
  );

  const preview = (t) => {
    if (isSpotify(t.url)) {
      // no audio file from Spotify: show its own small player under the row
      setPlaying((p) => (p === t.id ? null : t.id));
      return;
    }
    if (playing === t.id) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    const a = new Audio(assetUrl(t.url));
    a.onended = () => setPlaying(null);
    a.play().catch(() => setError('Couldn’t play that preview'));
    audio.current = a;
    setPlaying(t.id);
  };

  const pick = (t) => {
    audio.current?.pause();
    onPick({ id: t.id, title: t.title, artist: t.artist, cover: t.cover, url: t.url });
  };

  const chooseFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    if (!/^audio\//.test(f.type)) return setError('Please choose an audio file (MP3, M4A, AAC, WAV or OGG).');
    if (f.size > MAX_AUDIO_MB * 1024 * 1024) return setError(`That file is over ${MAX_AUDIO_MB} MB.`);
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 80));
  };

  const useUpload = async () => {
    if (!file || progress !== null) return;
    setError('');
    setProgress(0);
    try {
      const d = await api.uploadMusic(file, title.trim(), artist.trim(), setProgress);
      pick(d.track);
    } catch (e) {
      setError(e.message);
      setProgress(null);
    }
  };

  return createPortal(
    <Modal title="Add music" onClose={onClose}>
      <div className="music-tabs" role="tablist">
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'on' : ''} onClick={() => { audio.current?.pause(); setPlaying(null); setError(''); setTab(x.id); }}>
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'mine' ? (
        <div className="music-upload">
          <input ref={fileInput} type="file" accept="audio/*" hidden onChange={chooseFile} />
          <button type="button" className="music-drop" onClick={() => fileInput.current?.click()} disabled={progress !== null}>
            <MusicIcon width={26} height={26} />
            <strong>{file ? file.name : 'Choose an audio file'}</strong>
            <span className="muted tiny">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `MP3, M4A, AAC, WAV or OGG · up to ${MAX_AUDIO_MB} MB`}</span>
          </button>
          {file && (
            <>
              <input className="music-field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Song name" aria-label="Song name" />
              <input className="music-field" value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={80} placeholder="Artist (optional)" aria-label="Artist" />
              <button type="button" className="btn btn-primary" onClick={useUpload} disabled={progress !== null}>
                {progress === null ? 'Upload & use this song' : `Uploading… ${Math.round(progress * 100)}%`}
              </button>
            </>
          )}
          {error && <p className="error small">{error}</p>}
          <p className="muted tiny">Only upload audio you have the right to use. Your song is public on posts that use it.</p>
        </div>
      ) : (
      <>
      <div className="searchbar">
        <SearchIcon width={20} height={20} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === 'mine' ? '' : tab === 'jamendo' ? 'Search songs or artists' : 'Search Hindi songs or artists'}
          aria-label="Search music"
        />
      </div>
      {error && <p className="error small">{error}</p>}
      {notSetUp && tab !== 'spotify' && <p className="muted tiny">Spotify search isn’t switched on for this app yet.</p>}
      <p className="muted tiny music-note">
        {tab === 'spotify'
          ? `${q ? 'Results' : 'Hindi & Bollywood'} · played by Spotify (30-sec preview, full song if you’re signed in to Spotify Premium)`
          : tab === 'hindi'
          ? `${q ? 'Results' : 'Bollywood & Hindi'} · 30-second previews from Apple Music`
          : `${q ? 'Results' : 'Trending this week'} · royalty-free music by Jamendo`}
      </p>

      <div className="music-list">
        {tracks === null && <p className="muted center">Loading songs…</p>}
        {tracks?.length === 0 && !error && <p className="muted center">No songs found.</p>}
        {tracks?.map((t) => (
          <div key={t.id} className={`music-item ${isSpotify(t.url) && playing === t.id ? 'open' : ''}`}>
          <div className={`music-row ${current?.id === t.id ? 'on' : ''}`}>
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
          {isSpotify(t.url) && playing === t.id && (
            <iframe className="music-embed" src={spotifyEmbed(t.url)} title={`${t.title} on Spotify`} allow="autoplay; encrypted-media" loading="lazy" />
          )}
          </div>
        ))}
      </div>
      </>
      )}
    </Modal>,
    document.body
  );
}