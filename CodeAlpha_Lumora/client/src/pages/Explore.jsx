import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, assetUrl } from '../api.js';
import Modal from '../components/Modal.jsx';
import PostCard from '../components/PostCard.jsx';
import UserRow from '../components/UserRow.jsx';
import { SearchIcon, GlowIcon, CommentIcon, PlayIcon } from '../components/Icons.jsx';
import { compact } from '../utils.js';

export function PostGrid({ posts, onOpen }) {
  return (
    <div className="grid">
      {posts.map((p) => (
        <button key={p._id} className="tile" onClick={() => onOpen(p)}>
          {p.video ? (
            <>
              <video src={`${assetUrl(p.video)}#t=0.1`} preload="metadata" muted playsInline />
              <span className="reel-badge">
                <PlayIcon width={16} height={16} />
              </span>
            </>
          ) : p.image ? (
            <img src={assetUrl(p.image)} alt={p.caption || 'Post'} loading="lazy" />
          ) : (
            <span className="tile-text">{p.caption}</span>
          )}
          <span className="tile-over">
            <span><GlowIcon width={18} height={18} filled /> {compact(p.likesCount)}</span>
            <span><CommentIcon width={18} height={18} /> {compact(p.commentsCount)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export default function Explore() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);

  const load = useCallback(async (p) => {
    setLoading(true);
    try {
      const d = await api.explore(p);
      setPosts((prev) => (p === 1 ? d.posts : [...prev, ...d.posts]));
      setHasMore(d.hasMore);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  useEffect(() => {
    const term = q.trim();
    if (!term) return setResults(null);
    const t = setTimeout(() => {
      api.searchUsers(term).then((d) => setResults(d.users)).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="page">
      <div className="searchbar">
        <SearchIcon width={20} height={20} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people by name or username"
          aria-label="Search people"
        />
      </div>

      {results ? (
        <div className="card side-card">
          {results.length === 0 && <p className="muted">No one found for “{q}”.</p>}
          {results.map((u) => (
            <UserRow key={u._id} person={u} />
          ))}
        </div>
      ) : (
        <>
          <h2 className="section-title">Discover</h2>
          <PostGrid posts={posts} onOpen={(p) => (p.video ? navigate(`/reels/${p._id}`) : setOpen(p))} />
          {!loading && posts.length === 0 && (
            <div className="card empty">
              <h3>Nothing here yet</h3>
              <p className="muted">Be the first to share something bright.</p>
            </div>
          )}
          {loading && <p className="muted center">Loading…</p>}
          {hasMore && !loading && (
            <button className="btn btn-ghost btn-block" onClick={() => load(page + 1)}>
              Load more
            </button>
          )}
        </>
      )}

      {open && (
        <Modal title="Post" onClose={() => setOpen(null)} wide>
          <PostCard
            post={open}
            startOpen
            onDelete={(id) => {
              setPosts((l) => l.filter((x) => x._id !== id));
              setOpen(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}