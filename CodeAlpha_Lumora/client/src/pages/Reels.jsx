import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, assetUrl } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Comments from '../components/Comments.jsx';
import FollowButton from '../components/FollowButton.jsx';
import Modal from '../components/Modal.jsx';
import {
  CommentIcon,
  GlowIcon,
  MuteIcon,
  PauseIcon,
  PlayIcon,
  ReelsIcon,
  TrashIcon,
  VolumeIcon,
} from '../components/Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { compact } from '../utils.js';

function ReelCard({ reel, active, muted, setMuted, onActive, onDelete }) {
  const { user } = useAuth();
  const [r, setR] = useState(reel);
  const [userPaused, setUserPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flash, setFlash] = useState(null); // 'play' | 'pause' | 'glow'
  const [showComments, setShowComments] = useState(false);
  const box = useRef(null);
  const video = useRef(null);
  const flashTimer = useRef(null);

  const mine = r.author._id === user._id;

  // tell the page which reel is mostly on screen
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => e.intersectionRatio >= 0.6 && onActive(r._id), {
      threshold: [0.6],
    });
    io.observe(el);
    return () => io.disconnect();
  }, [r._id, onActive]);

  // play only the active reel
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active && !userPaused && !showComments) {
      const p = v.play();
      if (p)
        p.catch(() => {
          v.muted = true; // autoplay with sound blocked: fall back to muted
          setMuted(true);
          v.play().catch(() => {});
        });
    } else {
      v.pause();
      if (!active) {
        v.currentTime = 0;
        setProgress(0);
        setUserPaused(false);
      }
    }
  }, [active, userPaused, showComments, setMuted]);

  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted]);

  const pulse = (kind) => {
    setFlash(kind);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 650);
  };

  const togglePause = () => {
    setUserPaused((p) => {
      pulse(p ? 'play' : 'pause');
      return !p;
    });
  };

  const toggleGlow = async () => {
    const prev = r;
    const liked = !r.liked;
    setR({ ...r, liked, likesCount: r.likesCount + (liked ? 1 : -1) });
    if (liked) pulse('glow');
    try {
      const res = await api.toggleLike(r._id);
      setR((x) => ({ ...x, liked: res.liked, likesCount: res.likesCount }));
    } catch {
      setR(prev);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this reel? This cannot be undone.')) return;
    try {
      await api.deletePost(r._id);
      onDelete(r._id);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <section className="reel" ref={box}>
      <div className="reel-frame">
        <video
          ref={video}
          className="reel-video"
          src={assetUrl(r.video)}
          loop
          playsInline
          preload="metadata"
          onClick={togglePause}
          onDoubleClick={() => !r.liked && toggleGlow()}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration) setProgress(v.currentTime / v.duration);
          }}
        />
        <div className="reel-shade" />

        {flash && (
          <span className="reel-flash" aria-hidden="true">
            {flash === 'glow' ? (
              <GlowIcon width={46} height={46} filled />
            ) : flash === 'pause' ? (
              <PauseIcon width={38} height={38} />
            ) : (
              <PlayIcon width={38} height={38} />
            )}
          </span>
        )}

        <button className="reel-mute" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? <MuteIcon width={20} height={20} /> : <VolumeIcon width={20} height={20} />}
        </button>

        <div className="reel-info">
          <div className="reel-author">
            <Link to={`/u/${r.author.username}`} className="reel-who">
              <Avatar user={r.author} size={38} />
              <strong>{r.author.username}</strong>
            </Link>
            {!mine && <FollowButton userId={r.author._id} isFollowing={!!r.isFollowing} small />}
          </div>
          {r.caption && <p className="reel-caption">{r.caption}</p>}
        </div>

        <div className="reel-rail">
          <button className={`rail-btn ${r.liked ? 'glowing' : ''}`} onClick={toggleGlow} aria-label="Glow" aria-pressed={r.liked}>
            <GlowIcon width={30} height={30} filled={r.liked} />
            <span>{compact(r.likesCount)}</span>
          </button>
          <button className="rail-btn" onClick={() => setShowComments(true)} aria-label="Comments">
            <CommentIcon width={30} height={30} />
            <span>{compact(r.commentsCount)}</span>
          </button>
          {mine && (
            <button className="rail-btn" onClick={remove} aria-label="Delete reel">
              <TrashIcon width={26} height={26} />
            </button>
          )}
        </div>

        <div className="reel-bar" aria-hidden="true">
          <i style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {showComments && (
        <Modal title="Comments" onClose={() => setShowComments(false)}>
          <Comments post={r} onCountChange={(n) => setR((x) => ({ ...x, commentsCount: n }))} />
        </Modal>
      )}
    </section>
  );
}

export default function Reels() {
  const { reelId } = useParams();
  const [reels, setReels] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [muted, setMuted] = useState(false);
  const scroller = useRef(null);

  // first page (+ a specific reel pinned to the top when opened from a profile)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const d = await api.reels(1);
        let list = d.reels;
        if (reelId) {
          let target = list.find((x) => x._id === reelId);
          if (!target) {
            try {
              const one = await api.post(reelId);
              if (one.post.kind === 'reel') target = one.post;
            } catch {
              /* reel may have been deleted */
            }
          }
          if (target) list = [target, ...list.filter((x) => x._id !== reelId)];
        }
        if (!alive) return;
        setReels(list);
        setHasMore(d.hasMore);
        setPage(1);
        setActiveId(list[0]?._id ?? null);
        scroller.current?.scrollTo({ top: 0 });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [reelId]);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.reels(page + 1);
      setReels((prev) => {
        const seen = new Set(prev.map((x) => x._id));
        return [...prev, ...d.reels.filter((x) => !seen.has(x._id))];
      });
      setHasMore(d.hasMore);
      setPage((p) => p + 1);
    } finally {
      setLoading(false);
    }
  }, [page]);

  // infinite scroll: fetch more when the viewer is near the end
  useEffect(() => {
    const idx = reels.findIndex((x) => x._id === activeId);
    if (idx >= 0 && idx >= reels.length - 2 && hasMore && !loading) loadMore();
  }, [activeId, reels, hasMore, loading, loadMore]);

  if (!loading && reels.length === 0)
    return (
      <div className="chat-empty">
        <div className="chat-empty-icon">
          <ReelsIcon width={44} height={44} />
        </div>
        <h3>No reels yet</h3>
        <p className="muted">Be the first to share a short video.</p>
        <button
          className="btn btn-primary"
          onClick={() => window.dispatchEvent(new CustomEvent('lumora:open-create', { detail: { tab: 'reel' } }))}
        >
          Create a reel
        </button>
      </div>
    );

  return (
    <div className="reels-scroll" ref={scroller}>
      {reels.map((r) => (
        <ReelCard
          key={r._id}
          reel={r}
          active={activeId === r._id}
          muted={muted}
          setMuted={setMuted}
          onActive={setActiveId}
          onDelete={(id) => setReels((l) => l.filter((x) => x._id !== id))}
        />
      ))}
      {loading && <p className="muted center reels-loading">Loading…</p>}
    </div>
  );
}