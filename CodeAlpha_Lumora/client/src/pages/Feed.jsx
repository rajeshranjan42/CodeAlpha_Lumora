import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import PostCard from '../components/PostCard.jsx';
import Suggestions from '../components/Suggestions.jsx';
import StoriesBar from '../components/StoriesBar.jsx';
import RecentChats from '../components/RecentChats.jsx';
import Avatar from '../components/Avatar.jsx';
import { ImageIcon } from '../components/Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { cache } from '../cache.js';
import { compact } from '../utils.js';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function Feed() {
  const { user } = useAuth();
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem('lumora_feed_mode') === 'following' ? 'following' : 'foryou';
    } catch {
      return 'foryou';
    }
  });
  const cacheKey = `feed:${mode}`;
  const cached = cache.get(cacheKey);
  const seed = useRef(cached?.seed || Math.floor(Math.random() * 2147483647) + 1); // new shuffle on every fresh visit
  const [posts, setPosts] = useState(cached?.posts || []);
  const [page, setPage] = useState(cached?.page || 1);
  const [hasMore, setHasMore] = useState(cached?.hasMore || false);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(() => cache.get(`stats:${user.username}`) || null);

  // live counters: refetched on load and whenever you follow / unfollow / post
  const loadStats = useCallback(() => {
    api
      .profile(user.username)
      .then((d) => setStats(cache.set(`stats:${user.username}`, d.user)))
      .catch(() => {});
  }, [user.username]);

  useEffect(() => {
    loadStats();
    window.addEventListener('lumora:follow-changed', loadStats);
    window.addEventListener('lumora:post-created', loadStats);
    return () => {
      window.removeEventListener('lumora:follow-changed', loadStats);
      window.removeEventListener('lumora:post-created', loadStats);
    };
  }, [loadStats]);

  const load = useCallback(async (p) => {
    setLoading(p > 1 || !cache.get(cacheKey)); // with cached posts on screen, refresh quietly
    try {
      if (p === 1) seed.current = Math.floor(Math.random() * 2147483647) + 1;
      const d = await api.feed(p, mode, seed.current);
      setPosts((prev) => (p === 1 ? d.posts : [...prev, ...d.posts]));
      setHasMore(d.hasMore);
      setPage(p);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [mode, cacheKey]);

  useEffect(() => {
    load(1);
  }, [load]);

  useEffect(() => {
    if (posts.length) cache.set(cacheKey, { posts, page, hasMore, seed: seed.current });
  }, [posts, page, hasMore, cacheKey]);

  const switchMode = (m) => {
    if (m === mode) return;
    try {
      localStorage.setItem('lumora_feed_mode', m);
    } catch {
      /* ignore */
    }
    const c = cache.get(`feed:${m}`);
    setPosts(c?.posts || []);
    setPage(c?.page || 1);
    setHasMore(c?.hasMore || false);
    setLoading(!c);
    setError('');
    setMode(m);
  };

  useEffect(() => {
    const onCreated = (e) => setPosts((p) => [e.detail, ...p]);
    window.addEventListener('lumora:post-created', onCreated);
    return () => window.removeEventListener('lumora:post-created', onCreated);
  }, []);

  const openCreate = () => window.dispatchEvent(new CustomEvent('lumora:open-create'));

  return (
    <div className="two-col">
      <div className="col-main">
        <div className="greeting">
          <h1>
            {greeting()}, <em>{user.name.split(' ')[0]}</em>
          </h1>
          <p className="muted">
            {mode === 'foryou' ? 'A fresh mix from everyone on Lumora.' : 'Here’s what’s glowing in your circle today.'}
          </p>
        </div>

        <div className="feed-tabs tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'foryou'} className={mode === 'foryou' ? 'on' : ''} onClick={() => switchMode('foryou')}>
            For you
          </button>
          <button role="tab" aria-selected={mode === 'following'} className={mode === 'following' ? 'on' : ''} onClick={() => switchMode('following')}>
            Following
          </button>
        </div>

        <StoriesBar />

        <div className="card composer">
          <Avatar user={user} size={46} />
          <button className="composer-input" onClick={openCreate}>
            What’s glowing in your world today?
          </button>
          <button className="composer-photo" onClick={openCreate} aria-label="Add photo">
            <ImageIcon width={22} height={22} />
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {posts.map((p) => (
          <PostCard key={p._id} post={p} onDelete={(id) => setPosts((l) => l.filter((x) => x._id !== id))} />
        ))}

        {!loading && posts.length === 0 && !error && (
          <div className="card empty">
            <h3>{mode === 'following' ? 'Nothing from your circle yet' : 'Your feed is quiet'}</h3>
            <p className="muted">
              {mode === 'following' ? 'Follow a few people, or switch to “For you” to see everyone.' : 'Be the first to post a glow, or '}
              {mode === 'foryou' && <Link to="/explore">explore</Link>}
              {mode === 'foryou' && '.'}
            </p>
          </div>
        )}

        {loading && <p className="muted center">Loading…</p>}
        {hasMore && !loading && (
          <button className="btn btn-ghost btn-block" onClick={() => load(page + 1)}>
            Load more
          </button>
        )}
      </div>

      <aside className="col-side">
        <div className="card side-card me">
          <Link to={`/u/${user.username}`} className="user-row-link">
            <Avatar user={user} size={56} ring />
            <div className="user-row-text">
              <strong>{user.username}</strong>
              <span>{user.name}</span>
            </div>
          </Link>
          <div className="mini-stats">
            <div>
              <strong>{compact(stats?.postsCount ?? 0)}</strong>
              <span>Posts</span>
            </div>
            <div>
              <strong>{compact(stats?.followersCount ?? 0)}</strong>
              <span>Followers</span>
            </div>
            <div>
              <strong>{compact(stats?.followingCount ?? 0)}</strong>
              <span>Following</span>
            </div>
          </div>
        </div>
        <RecentChats />
        <Suggestions />
        <p className="muted tiny footer-note">Lumora · CodeAlpha · by Rajesh Ranjan</p>
      </aside>
    </div>
  );
}