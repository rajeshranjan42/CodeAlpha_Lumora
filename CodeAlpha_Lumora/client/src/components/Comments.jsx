import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';
import { TrashIcon } from './Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { timeAgo } from '../utils.js';

export default function Comments({ post, onCountChange }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .comments(post._id)
      .then((d) => alive && setItems(d.comments))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [post._id]);

  const submit = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError('');
    try {
      const d = await api.addComment(post._id, value);
      setItems((c) => [...c, d.comment]);
      onCountChange(items.length + 1);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteComment(id);
      setItems((c) => c.filter((x) => x._id !== id));
      onCountChange(items.length - 1);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="comments">
      {loading && <p className="muted small">Loading thoughts…</p>}
      {!loading && items.length === 0 && (
        <p className="muted small">No comments yet. Be the first to say something kind.</p>
      )}
      <ul>
        {items.map((c) => (
          <li key={c._id} className="comment">
            <Avatar user={c.author} size={30} />
            <div className="comment-body">
              <p>
                <Link to={`/u/${c.author.username}`} className="comment-author">
                  {c.author.username}
                </Link>{' '}
                {c.text}
              </p>
              <span className="muted tiny">{timeAgo(c.createdAt)}</span>
            </div>
            {(c.author._id === user._id || post.author._id === user._id) && (
              <button className="icon-btn danger" onClick={() => remove(c._id)} aria-label="Delete comment">
                <TrashIcon width={16} height={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error small">{error}</p>}
      <form className="comment-form" onSubmit={submit}>
        <input
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment…"
          aria-label="Add a comment"
        />
        <button className="link-btn" disabled={!text.trim() || sending}>
          Post
        </button>
      </form>
    </div>
  );
}
