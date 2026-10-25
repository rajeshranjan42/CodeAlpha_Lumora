import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, assetUrl } from '../api.js';
import Avatar from './Avatar.jsx';
import Comments from './Comments.jsx';
import { GlowIcon, CommentIcon, MuteIcon, ReelsIcon, TrashIcon, VolumeIcon } from './Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { timeAgo, compact } from '../utils.js';

/** A reel shown inside the feed: plays muted while on screen, tap for sound. */
function FeedVideo({ post, burst, onDoubleTap }) {
  const navigate = useNavigate();
  const box = useRef(null);
  const video = useRef(null);
  const clickTimer = useRef(null);
  const [muted, setMuted] = useState(true);

  // a single click opens the reel in the full-screen scrolling viewer; a double click glows it
  const openReel = () => {
    clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => navigate(`/reels/${post._id}`), 220);
  };
  const glow = () => {
    clearTimeout(clickTimer.current);
    onDoubleTap();
  };
  useEffect(() => () => clearTimeout(clickTimer.current), []);

  useEffect(() => {
    const el = box.current;
    const v = video.current;
    if (!el || !v) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.6) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: [0, 0.6] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted]);

  return (
    <div className="post-media post-video" ref={box}>
      <video
        ref={video}
        src={assetUrl(post.video)}
        loop
        muted
        playsInline
        preload="metadata"
        onClick={openReel}
        onDoubleClick={glow}
      />
      <Link to={`/reels/${post._id}`} className="reel-pill">
        <ReelsIcon width={16} height={16} /> Reel
      </Link>
      <button className="feed-mute" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>
        {muted ? <MuteIcon width={18} height={18} /> : <VolumeIcon width={18} height={18} />}
      </button>
      {burst && <GlowIcon className="burst" width={96} height={96} filled />}
    </div>
  );
}

export default function PostCard({ post: initial, onDelete, startOpen = false }) {
  const { user } = useAuth();
  const [post, setPost] = useState(initial);
  const [showComments, setShowComments] = useState(startOpen);
  const [burst, setBurst] = useState(false);

  const isMine = post.author._id === user._id;
  const isReel = !!post.video;

  const toggleGlow = async () => {
    const prev = post;
    const liked = !post.liked;
    setPost({ ...post, liked, likesCount: post.likesCount + (liked ? 1 : -1) });
    if (liked) {
      setBurst(true);
      setTimeout(() => setBurst(false), 600);
    }
    try {
      const res = await api.toggleLike(post._id);
      setPost((p) => ({ ...p, liked: res.liked, likesCount: res.likesCount }));
    } catch {
      setPost(prev);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete this ${isReel ? 'reel' : 'post'}? This cannot be undone.`)) return;
    try {
      await api.deletePost(post._id);
      onDelete?.(post._id);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <article className="card post">
      <header className="post-head">
        <Link to={`/u/${post.author.username}`} className="post-author">
          <Avatar user={post.author} size={42} ring />
          <div>
            <strong>{post.author.username}</strong>
            <span className="muted tiny">{timeAgo(post.createdAt)}</span>
          </div>
        </Link>
        {isMine && (
          <button className="icon-btn danger" onClick={remove} aria-label="Delete post">
            <TrashIcon width={18} height={18} />
          </button>
        )}
      </header>

      {isReel ? (
        <FeedVideo post={post} burst={burst} onDoubleTap={() => !post.liked && toggleGlow()} />
      ) : post.image ? (
        <div className="post-media" onDoubleClick={() => !post.liked && toggleGlow()}>
          <img src={assetUrl(post.image)} alt={post.caption || 'Post'} loading="lazy" />
          {burst && <GlowIcon className="burst" width={96} height={96} filled />}
        </div>
      ) : (
        <div className="post-textcard" onDoubleClick={() => !post.liked && toggleGlow()}>
          <p>{post.caption}</p>
          {burst && <GlowIcon className="burst" width={96} height={96} filled />}
        </div>
      )}

      <div className="post-actions">
        <button
          className={`action ${post.liked ? 'glowing' : ''}`}
          onClick={toggleGlow}
          aria-pressed={post.liked}
          aria-label="Glow"
        >
          <GlowIcon width={26} height={26} filled={post.liked} />
          <span>{compact(post.likesCount)}</span>
        </button>
        <button className="action" onClick={() => setShowComments((s) => !s)} aria-label="Comments">
          <CommentIcon width={26} height={26} />
          <span>{compact(post.commentsCount)}</span>
        </button>
      </div>

      {(post.image || isReel) && post.caption && (
        <p className="post-caption">
          <Link to={`/u/${post.author.username}`}>{post.author.username}</Link> {post.caption}
        </p>
      )}

      {showComments && (
        <Comments
          post={post}
          onCountChange={(n) => setPost((p) => ({ ...p, commentsCount: n }))}
        />
      )}
    </article>
  );
}