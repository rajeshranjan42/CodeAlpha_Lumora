import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import PostCard from '../components/PostCard.jsx';

/** A single post opened from a shared link or a notification. Reels redirect to the reel viewer. */
export default function PostPage() {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setPost(null);
    setError('');
    api
      .post(id)
      .then((d) => alive && setPost(d.post))
      .catch(() => alive && setError('This post is no longer available.'));
    return () => {
      alive = false;
    };
  }, [id]);

  if (post?.video) return <Navigate to={`/reels/${post._id}`} replace />;
  return (
    <div className="page">
      {error && (
        <div className="card empty">
          <h3>Post not found</h3>
          <p className="muted">{error}</p>
          <Link className="btn btn-primary" to="/">Back home</Link>
        </div>
      )}
      {!post && !error && <p className="muted center">Loading…</p>}
      {post && <PostCard key={post._id} post={post} startOpen onDelete={() => window.history.back()} />}
    </div>
  );
}