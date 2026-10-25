import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import PostCard from '../components/PostCard.jsx';
import Suggestions from '../components/Suggestions.jsx';
import StoriesBar from '../components/StoriesBar.jsx';
import RecentChats from '../components/RecentChats.jsx';
import Avatar from '../components/Avatar.jsx';
import { ImageIcon } from '../components/Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { compact } from '../utils.js';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export default function Feed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);

  // live counters: refetched on load and whenever you follow / unfollow / post
  const loadStats = useCallback(() => {
    api
      .profile(user.username)
      .then((d) => setStats(d.user))
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
    setLoading(true);
    try {
      const d = await api.feed(p);
      setPosts((prev) => (p === 1 ? d.posts : [...prev, ...d.posts]));
      setHasMore(d.hasMore);
      setPage(p);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

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
          <p className="muted">Here’s what’s glowing in your circle today.</p>
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
            <h3>Your feed is quiet</h3>
            <p className="muted">
              Follow a few people or <Link to="/explore">explore</Link> what others are sharing — or
              post your first glow.
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