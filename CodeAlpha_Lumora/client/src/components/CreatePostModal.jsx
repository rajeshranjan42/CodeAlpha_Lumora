import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import { ImageIcon, ReelsIcon } from './Icons.jsx';

const MB = 1024 * 1024;
const SLACK = 0.75; // seconds; matches the server

// Videos are limited by LENGTH, not by file size.
const TABS = {
  post: {
    label: 'Post',
    noun: 'Posts',
    accept: 'image/*',
    field: 'image',
    max: 1000,
    title: 'Add a photo',
    hint: 'JPG, PNG, WEBP or GIF · up to 5 MB',
    placeholder: "What's glowing in your world today?",
    submit: 'Share',
  },
  story: {
    label: 'Story',
    noun: 'Stories',
    accept: 'image/*,video/*',
    field: 'media',
    max: 200,
    seconds: 45,
    title: 'Add a photo or video',
    hint: 'Video up to 45 seconds · disappears after 24 hours',
    placeholder: 'Add a caption (optional)',
    submit: 'Share to story',
  },
  reel: {
    label: 'Reel',
    noun: 'Reels',
    accept: 'video/*',
    field: 'video',
    max: 1000,
    seconds: 90,
    title: 'Add a video',
    hint: 'MP4, WEBM or MOV · up to 1 min 30 sec · any file size',
    placeholder: 'Write a caption for your reel…',
    submit: 'Share reel',
  },
};

const fmt = (s) => {
  const t = Math.round(s);
  return t >= 60 ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` : `${t}s`;
};

const readDuration = (url) =>
  new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => resolve(v.duration);
    v.onerror = () => reject(new Error('Your browser can’t read this video. Try an MP4 (H.264) file.'));
    v.src = url;
  });

export default function CreatePostModal({ onClose, onCreated, initialTab = 'post' }) {
  const [tab, setTab] = useState(TABS[initialTab] ? initialTab : 'post');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [duration, setDuration] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef();
  const cfg = TABS[tab];
  const isVideo = file?.type.startsWith('video/');

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );

  const clearFile = () => {
    setFile(null);
    setPreview('');
    setDuration(null);
    if (input.current) input.current.value = '';
  };

  const switchTab = (t) => {
    if (t === tab || busy) return;
    clearFile();
    setError('');
    setCaption((c) => c.slice(0, TABS[t].max));
    setTab(t);
  };

  const reject = (msg) => {
    if (input.current) input.current.value = '';
    setError(msg);
  };

  const pick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const video = f.type.startsWith('video/');
    const image = f.type.startsWith('image/');
    if (tab === 'reel' && !video) return reject('Please choose a video file.');
    if (tab === 'post' && !image) return reject('Please choose an image file.');
    if (tab === 'story' && !image && !video) return reject('Please choose a photo or video.');
    if (image && f.size > (tab === 'post' ? 5 : 10) * MB)
      return reject(`Photo must be under ${tab === 'post' ? 5 : 10} MB.`);

    const url = URL.createObjectURL(f);
    let secs = null;
    if (video) {
      try {
        secs = await readDuration(url);
      } catch (err) {
        URL.revokeObjectURL(url);
        return reject(err.message);
      }
      if (cfg.seconds && Number.isFinite(secs) && secs > cfg.seconds + SLACK) {
        URL.revokeObjectURL(url);
        return reject(`${cfg.noun} can be up to ${fmt(cfg.seconds)}. This video is ${fmt(secs)} — please trim it.`);
      }
    }
    setError('');
    setFile(f);
    setPreview(url);
    setDuration(Number.isFinite(secs) ? secs : null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (tab === 'post' && !file && !caption.trim()) return setError('Add a photo or write something.');
    if (tab !== 'post' && !file) return setError(tab === 'reel' ? 'Choose a video first.' : 'Choose a photo or video first.');
    setBusy(true);
    setProgress(0);
    setError('');
    try {
      const form = new FormData();
      form.append('caption', caption.trim());
      if (file) form.append(cfg.field, file);
      let item;
      if (tab === 'post') item = (await api.createPost(form)).post;
      else if (tab === 'story') item = (await api.createStory(form, setProgress)).story;
      else item = (await api.createReel(form, setProgress)).reel;
      onCreated(tab, item);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const pct = Math.round(progress * 100);

  return (
    <Modal title="Create" onClose={busy ? () => {} : onClose}>
      <div className="tabs" role="tablist">
        {Object.entries(TABS).map(([id, t]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'on' : ''}
            onClick={() => switchTab(id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="create-form">
        {preview ? (
          <div className="preview">
            {isVideo ? <video src={preview} controls muted playsInline /> : <img src={preview} alt="Preview" />}
            {isVideo && duration !== null && cfg.seconds && (
              <span className="duration-chip">
                {fmt(duration)} <small>of {fmt(cfg.seconds)} max</small>
              </span>
            )}
            {!busy && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearFile}>
                Remove {isVideo ? 'video' : 'photo'}
              </button>
            )}
          </div>
        ) : (
          <button type="button" className="dropzone" onClick={() => input.current.click()}>
            {tab === 'reel' ? <ReelsIcon width={36} height={36} /> : <ImageIcon width={36} height={36} />}
            <strong>{cfg.title}</strong>
            <span className="muted small">{cfg.hint}</span>
          </button>
        )}
        <input ref={input} type="file" accept={cfg.accept} hidden onChange={pick} />

        <textarea
          value={caption}
          maxLength={cfg.max}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={cfg.placeholder}
          rows={tab === 'story' ? 2 : 4}
        />
        <div className="row-between">
          <span className="muted tiny">
            {caption.length}/{cfg.max}
          </span>
          {error && <span className="error small">{error}</span>}
        </div>

        {busy && tab !== 'post' && (
          <div className="upload-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${pct}%` }} />
          </div>
        )}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? (tab === 'post' ? 'Sharing…' : pct >= 100 ? 'Processing…' : `Uploading… ${pct}%`) : cfg.submit}
        </button>
      </form>
    </Modal>
  );
}