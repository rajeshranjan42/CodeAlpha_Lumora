import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, assetUrl } from '../api.js';
import Avatar from './Avatar.jsx';
import Modal from './Modal.jsx';
import UserRow from './UserRow.jsx';
import { CloseIcon, EyeIcon, MusicIcon, SendIcon, TrashIcon } from './Icons.jsx';
import { useAudioClip } from '../hooks/useAudioClip.js';
import { useTrim, windowProgress } from '../hooks/useTrim.js';
import { useAuth } from '../context/AuthContext.jsx';
import { encryptText } from '../e2ee.js';
import { timeAgo } from '../utils.js';

const IMAGE_MS = 5000;

const firstUnseen = (g) => (g.isMe ? 0 : Math.max(0, g.stories.findIndex((s) => !s.seen)));

/** One story: the media + the segmented progress bars. Remounted per story via `key`. */
function StoryFrame({ story, index, count, paused, onDone }) {
  const [p, setP] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const video = useRef(null);

  // a long video plays only its chosen window, then the next story starts
  useTrim(video, story.trimStart, story.trimEnd, onDone);
  // a song plays behind the story (and replaces a video's own sound)
  useAudioClip(story.music?.url, { active: !paused && loaded });

  // images: advance after IMAGE_MS (timer only runs once loaded and while not paused)
  useEffect(() => {
    if (story.mediaType !== 'image' || paused || !loaded) return undefined;
    let raf;
    let alive = true;
    let last = performance.now();
    const tick = (now) => {
      if (!alive) return;
      const dt = now - last;
      last = now;
      setP((v) => Math.min(1, v + dt / IMAGE_MS));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [paused, loaded, story.mediaType]);

  useEffect(() => {
    if (p >= 1 && story.mediaType === 'image') onDone();
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps

  // videos: follow playback; pause when asked
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {});
  }, [paused]);

  const startVideo = (e) => {
    const v = e.currentTarget;
    setLoaded(true);
    v.play().catch(() => {
      v.muted = true; // autoplay with sound was blocked: fall back to muted
      v.play().catch(() => {});
    });
  };

  return (
    <>
      {story.mediaType === 'video' ? (
        <video
          ref={video}
          className="story-media"
          src={assetUrl(story.media)}
          playsInline
          onLoadedData={startVideo}
          muted={!!story.music}
          onTimeUpdate={(e) => setP(windowProgress(e.currentTarget, story.trimStart, story.trimEnd))}
          onEnded={onDone}
        />
      ) : (
        <img className="story-media" src={assetUrl(story.media)} alt="" onLoad={() => setLoaded(true)} />
      )}
      <div className="story-bars" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <span key={i}>
            <i style={{ width: `${(i < index ? 1 : i === index ? p : 0) * 100}%` }} />
          </span>
        ))}
      </div>
    </>
  );
}

export default function StoryViewer({ groups, startGroup, onClose }) {
  const { user } = useAuth();
  const [data, setData] = useState(groups);
  const [gi, setGi] = useState(startGroup);
  const [si, setSi] = useState(() => firstUnseen(groups[startGroup]));
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const [viewers, setViewers] = useState(null); // null = closed, array = open
  const [reply, setReply] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const downAt = useRef(0);

  const group = data[gi];
  const story = group.stories[si];
  const paused = held || typing || viewers !== null;

  const next = useCallback(() => {
    if (si < group.stories.length - 1) setSi(si + 1);
    else if (gi < data.length - 1) {
      setGi(gi + 1);
      setSi(firstUnseen(data[gi + 1]));
    } else onClose();
  }, [si, gi, group, data, onClose]);

  const prev = useCallback(() => {
    if (si > 0) setSi(si - 1);
    else if (gi > 0) {
      setGi(gi - 1);
      setSi(0);
    }
  }, [si, gi]);

  // mark as viewed + reset per-story UI
  useEffect(() => {
    setReply('');
    setSent(false);
    setError('');
    if (!group.isMe) api.viewStory(story._id).catch(() => {});
  }, [story._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard + scroll lock
  useEffect(() => {
    const onKey = (e) => {
      if (viewers !== null || e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [next, prev, onClose, viewers]);

  const down = () => {
    downAt.current = Date.now();
    setHeld(true);
  };
  const up = (e) => {
    setHeld(false);
    if (Date.now() - downAt.current < 250) {
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX - r.left < r.width / 3) prev();
      else next();
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this story?')) return;
    setHeld(true);
    try {
      await api.deleteStory(story._id);
    } catch (e) {
      setError(e.message);
      setHeld(false);
      return;
    }
    setHeld(false);
    const left = group.stories.filter((s) => s._id !== story._id);
    if (left.length) {
      setData(data.map((g, i) => (i === gi ? { ...g, stories: left } : g)));
      setSi(Math.min(si, left.length - 1));
    } else {
      const nd = data.filter((_, i) => i !== gi);
      if (!nd.length) return onClose();
      setData(nd);
      setGi(Math.min(gi, nd.length - 1));
      setSi(0);
    }
  };

  const openViewers = async () => {
    setViewers([]);
    try {
      const d = await api.storyViewers(story._id);
      setViewers(d.users);
    } catch (e) {
      setViewers(null);
      setError(e.message);
    }
  };

  // reply goes to the author's DMs
  const sendReply = async (e) => {
    e.preventDefault();
    const text = reply.trim();
    if (!text) return;
    try {
      const d = await api.openConversation(group.user._id);
      const peerKey = d.conversation.user.publicKey;
      if (!peerKey) throw new Error(`${group.user.username} hasn't turned on encrypted messaging yet`);
      const enc = await encryptText(user._id, peerKey, d.conversation._id, `↩ Replied to your story: ${text}`);
      await api.sendMessage(d.conversation._id, enc.text, enc.iv);
      setReply('');
      setSent(true);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label={`${group.user.username}'s story`}>
      <button className="story-close" onClick={onClose} aria-label="Close stories">
        <CloseIcon width={26} height={26} />
      </button>
      <button className="story-nav left" onClick={prev} aria-label="Previous">‹</button>

      <div className="story-stage">
        <StoryFrame key={story._id} story={story} index={si} count={group.stories.length} paused={paused} onDone={next} />

        <div
          className="story-tap"
          onPointerDown={down}
          onPointerUp={up}
          onPointerLeave={() => setHeld(false)}
          onPointerCancel={() => setHeld(false)}
        />

        <div className="story-head">
          <Link to={`/u/${group.user.username}`} className="story-who" onClick={onClose}>
            <Avatar user={group.user} size={36} />
            <strong>{group.user.username}</strong>
            <span>{timeAgo(story.createdAt)}</span>
          </Link>
          {group.isMe && (
            <button className="story-icon" onClick={remove} aria-label="Delete story">
              <TrashIcon width={20} height={20} />
            </button>
          )}
        </div>

        <div className="story-foot">
          {story.caption && <p className="story-caption">{story.caption}</p>}
          {story.music && (
            <p className="story-music">
              <MusicIcon width={14} height={14} /> {story.music.title} · {story.music.artist}
            </p>
          )}
          {error && <p className="story-error">{error}</p>}
          {group.isMe ? (
            <button className="story-viewers-btn" onClick={openViewers}>
              <EyeIcon width={20} height={20} /> {story.viewersCount || 0}{' '}
              {story.viewersCount === 1 ? 'viewer' : 'viewers'}
            </button>
          ) : (
            <form className="story-reply" onSubmit={sendReply}>
              <input
                value={reply}
                onChange={(e) => {
                  setReply(e.target.value);
                  setSent(false);
                }}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                maxLength={500}
                placeholder={sent ? 'Sent ✓' : `Reply to ${group.user.username}…`}
                aria-label="Reply to story"
              />
              <button disabled={!reply.trim()} aria-label="Send reply">
                <SendIcon width={20} height={20} />
              </button>
            </form>
          )}
        </div>
      </div>

      <button className="story-nav right" onClick={next} aria-label="Next">›</button>

      {viewers !== null && (
        <Modal title="Viewers" onClose={() => setViewers(null)}>
          {viewers.length === 0 && <p className="muted">No views yet.</p>}
          {viewers.map((u) => (
            <UserRow key={u._id} person={u} onNavigate={onClose} />
          ))}
        </Modal>
      )}
    </div>
  );
}