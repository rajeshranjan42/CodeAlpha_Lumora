import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import MusicPicker from './MusicPicker.jsx';
import TrimEditor from './TrimEditor.jsx';
import { CloseIcon, ImageIcon, MusicIcon, PlusIcon, ReelsIcon } from './Icons.jsx';
import { useUploads } from '../context/UploadContext.jsx';
import { fmtTime, readDuration } from '../mediaUtils.js';

const MB = 1024 * 1024;
const SLACK = 0.75; // seconds; matches the server
const MAX_IMAGES = 10;

// Videos are limited by LENGTH, not by file size.
const TABS = {
  post: {
    label: 'Post',
    noun: 'Posts',
    accept: 'image/*',
    field: 'image',
    max: 1000,
    title: 'Add photos',
    hint: `Up to ${MAX_IMAGES} photos · 5 MB each`,
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
    hint: 'Video up to 45 seconds (trim longer ones) · disappears after 24 hours',
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
    hint: 'MP4, WEBM or MOV · up to 1:30 (trim longer ones) · any file size',
    placeholder: 'Write a caption for your reel…',
    submit: 'Share reel',
  },
};

export default function CreatePostModal({ onClose, initialTab = 'post' }) {
  const { start: startUpload } = useUploads();
  const [tab, setTab] = useState(TABS[initialTab] ? initialTab : 'post');
  const [caption, setCaption] = useState('');
  const [images, setImages] = useState([]); // [{ file, url }]
  const [video, setVideo] = useState(null); // { file, url, duration }
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  const [music, setMusic] = useState(null);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef();
  const urls = useRef([]); // every object URL made here, released on close
  const cfg = TABS[tab];

  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    []
  );

  const hasMedia = images.length > 0 || !!video;

  const clearMedia = () => {
    setImages([]);
    setVideo(null);
    setTrim({ start: 0, end: 0 });
    setMusic(null);
    if (input.current) input.current.value = '';
  };

  const switchTab = (t) => {
    if (t === tab) return;
    clearMedia();
    setError('');
    setCaption((c) => c.slice(0, TABS[t].max));
    setTab(t);
  };

  const pick = async (e) => {
    const list = [...(e.target.files || [])];
    if (input.current) input.current.value = '';
    if (!list.length) return;
    setError('');

    if (tab === 'post') {
      const next = [];
      for (const f of list) {
        if (!f.type.startsWith('image/')) return setError('Posts can only have photos. Use Reel for videos.');
        if (f.size > 5 * MB) return setError(`“${f.name}” is over 5 MB. Please choose a smaller photo.`);
        next.push(f);
      }
      if (images.length + next.length > MAX_IMAGES) setError(`You can add up to ${MAX_IMAGES} photos.`);
      const room = MAX_IMAGES - images.length;
      const add = next.slice(0, room).map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        return { file, url };
      });
      setImages((l) => [...l, ...add]);
      return;
    }

    const f = list[0];
    const isVideo = f.type.startsWith('video/');
    const isImage = f.type.startsWith('image/');
    if (tab === 'reel' && !isVideo) return setError('Please choose a video file.');
    if (tab === 'story' && !isVideo && !isImage) return setError('Please choose a photo or video.');
    if (isImage && f.size > 10 * MB) return setError('Photos for stories must be under 10 MB.');

    const url = URL.createObjectURL(f);
    urls.current.push(url);
    if (isImage) {
      clearMedia();
      setImages([{ file: f, url }]);
      return;
    }
    try {
      const duration = await readDuration(url);
      clearMedia();
      setVideo({ file: f, url, duration });
      // a longer video starts with the first N seconds selected; the user can slide the window
      setTrim({ start: 0, end: Number.isFinite(duration) ? Math.min(duration, cfg.seconds) : cfg.seconds });
    } catch (err) {
      setError(err.message);
    }
  };

  const removeImage = (i) => {
    setImages((l) => l.filter((_, k) => k !== i));
    if (images.length === 1) setMusic(null);
  };

  const submit = (e) => {
    e.preventDefault();
    if (tab === 'post' && !images.length && !caption.trim()) return setError('Add photos or write something.');
    if (tab !== 'post' && !hasMedia) return setError(tab === 'reel' ? 'Choose a video first.' : 'Choose a photo or video first.');

    const form = new FormData();
    form.append('caption', caption.trim());
    if (music) form.append('music', JSON.stringify(music));

    if (tab === 'post') images.forEach((im) => form.append('images', im.file));
    else if (tab === 'story') form.append('media', (video || images[0]).file);
    else form.append('video', video.file);

    if (video) {
      if (trim.end - trim.start > cfg.seconds + SLACK)
        return setError(`${cfg.label}s can be up to ${fmtTime(cfg.seconds)}. Shorten the selection.`);
      const trimmed = trim.start > 0.05 || trim.end < video.duration - 0.05;
      if (trimmed) {
        form.append('trimStart', trim.start.toFixed(2));
        form.append('trimEnd', trim.end.toFixed(2));
      }
    }

    const label =
      tab === 'post'
        ? images.length > 1
          ? `${images.length} photos`
          : images.length
            ? images[0].file.name
            : 'Text post'
        : (video || images[0]).file.name;
    const run =
      tab === 'post'
        ? (p) => api.createPost(form, p).then((d) => d.post)
        : tab === 'story'
          ? (p) => api.createStory(form, p).then((d) => d.story)
          : (p) => api.createReel(form, p).then((d) => d.reel);

    startUpload({ kind: tab, label, run }); // keeps going in the background
    onClose();
  };

  return (
    <Modal title="Create" onClose={onClose}>
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
        {video ? (
          <>
            <TrimEditor src={video.url} duration={video.duration} max={cfg.seconds} value={trim} onChange={setTrim} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearMedia}>
              Choose a different video
            </button>
          </>
        ) : images.length ? (
          <div className="preview">
            <img src={images[0].url} alt="Preview" />
            <div className="thumbs">
              {images.map((im, i) => (
                <span key={im.url} className="thumb">
                  <img src={im.url} alt={`Photo ${i + 1}`} />
                  <button type="button" onClick={() => removeImage(i)} aria-label={`Remove photo ${i + 1}`}>
                    <CloseIcon width={12} height={12} />
                  </button>
                </span>
              ))}
              {tab === 'post' && images.length < MAX_IMAGES && (
                <button type="button" className="thumb add" onClick={() => input.current.click()} aria-label="Add more photos">
                  <PlusIcon width={22} height={22} />
                </button>
              )}
            </div>
            {tab !== 'post' && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearMedia}>
                Remove photo
              </button>
            )}
            {tab === 'post' && <span className="muted tiny">{images.length}/{MAX_IMAGES} photos · the first one is the cover</span>}
          </div>
        ) : (
          <button type="button" className="dropzone" onClick={() => input.current.click()}>
            {tab === 'reel' ? <ReelsIcon width={36} height={36} /> : <ImageIcon width={36} height={36} />}
            <strong>{cfg.title}</strong>
            <span className="muted small">{cfg.hint}</span>
          </button>
        )}
        <input ref={input} type="file" accept={cfg.accept} multiple={tab === 'post'} hidden onChange={pick} />

        {hasMedia &&
          (music ? (
            <div className="music-chip">
              {music.cover ? <img src={music.cover} alt="" /> : <MusicIcon width={20} height={20} />}
              <span>
                <strong>{music.title}</strong>
                <small>{music.artist}</small>
              </span>
              <button type="button" className="link-btn" onClick={() => setPicker(true)}>
                Change
              </button>
              <button type="button" className="icon-btn" onClick={() => setMusic(null)} aria-label="Remove music">
                <CloseIcon width={16} height={16} />
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost btn-block add-music" onClick={() => setPicker(true)}>
              <MusicIcon width={18} height={18} /> Add music
            </button>
          ))}
        {music && video && <p className="muted tiny">The song replaces the video’s own sound.</p>}

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

        <button className="btn btn-primary btn-block">{cfg.submit}</button>
        {tab !== 'post' && <p className="muted tiny center">Uploads continue in the background — you can keep browsing.</p>}
      </form>

      {picker && (
        <MusicPicker
          current={music}
          onClose={() => setPicker(false)}
          onPick={(m) => {
            setMusic(m);
            setPicker(false);
          }}
        />
      )}
    </Modal>
  );
}
