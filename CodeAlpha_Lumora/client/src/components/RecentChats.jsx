import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { decryptMessage } from '../e2ee.js';
import { cache } from '../cache.js';
import { previewText } from '../e2ee.js';
import { timeAgo } from '../utils.js';

export default function RecentChats() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [convos, setConvos] = useState(() => cache.get('recent-chats') || null);
  const [previews, setPreviews] = useState({});

  const load = useCallback(() => {
    api
      .conversations()
      .then((d) => setConvos(cache.set('recent-chats', d.conversations.slice(0, 3))))
      .catch(() => setConvos([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!socket) return undefined;
    const events = ['message:new', 'message:deleted', 'messages:seen'];
    events.forEach((e) => socket.on(e, load));
    return () => events.forEach((e) => socket.off(e, load));
  }, [socket, load]);

  // previews are ciphertext on the server: decrypt on this device
  useEffect(() => {
    if (!convos) return undefined;
    let alive = true;
    Promise.all(
      convos.map(async (c) => [c._id, previewText(await decryptMessage(user._id, c.user.publicKey, c._id, c.lastMessage))])
    ).then((entries) => alive && setPreviews(Object.fromEntries(entries)));
    return () => {
      alive = false;
    };
  }, [convos, user._id]);

  return (
    <section className="card side-card">
      <div className="row-between">
        <h4>Messages</h4>
        <Link to="/messages" className="link-btn small">
          See all
        </Link>
      </div>
      {convos === null && <p className="muted small">Loading…</p>}
      {convos?.length === 0 && (
        <p className="muted small">No chats yet. Visit a profile and tap Message.</p>
      )}
      {convos?.map((c) => (
        <Link key={c._id} to={`/messages/${c._id}`} className={`mini-convo ${c.unread ? 'unread' : ''}`}>
          <Avatar user={c.user} size={40} />
          <span className="convo-text">
            <strong>{c.user.username}</strong>
            <span>
              {c.lastMessage.mine ? 'You: ' : ''}
              {previews[c._id] ?? '🔒 Encrypted message'}
            </span>
          </span>
          <span className="muted tiny">{timeAgo(c.lastMessage.createdAt)}</span>
        </Link>
      ))}
    </section>
  );
}