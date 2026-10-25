import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Modal from '../components/Modal.jsx';
import {
  BackIcon,
  ComposeIcon,
  MessageIcon,
  SearchIcon,
  LockIcon,
  SendIcon,
  TrashIcon,
} from '../components/Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { timeAgo } from '../utils.js';
import { decryptMessage, encryptText, safetyNumber } from '../e2ee.js';

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const clock = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayLabel = (d) => {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

function PresenceAvatar({ user, size, online }) {
  return (
    <span className="presence-wrap">
      <Avatar user={user} size={size} />
      {online && <i className="presence-dot" />}
    </span>
  );
}

/* ───────── start a new conversation ───────── */
function NewMessageModal({ onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return undefined;
    }
    const t = setTimeout(() => {
      api
        .searchUsers(term)
        .then((d) => setResults(d.users.filter((u) => !u.isMe)))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const start = async (u) => {
    try {
      const d = await api.openConversation(u._id);
      onClose();
      navigate(`/messages/${d.conversation._id}`);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Modal title="New message" onClose={onClose}>
      <div className="searchbar">
        <SearchIcon width={20} height={20} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people"
          aria-label="Search people"
        />
      </div>
      {error && <p className="error small">{error}</p>}
      <div className="new-results">
        {!q.trim() && <p className="muted small">Type a name or username to find someone.</p>}
        {q.trim() && results.length === 0 && <p className="muted small">No one found.</p>}
        {results.map((u) => (
          <button key={u._id} className="convo" onClick={() => start(u)}>
            <Avatar user={u} size={44} />
            <span className="convo-text">
              <strong>{u.username}</strong>
              <span>{u.name}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ───────── safety number (verify nobody is intercepting) ───────── */
function SafetyModal({ peer, onClose }) {
  const { user } = useAuth();
  const [code, setCode] = useState('…');

  useEffect(() => {
    safetyNumber(user._id, peer.publicKey)
      .then(setCode)
      .catch(() => setCode('Unavailable'));
  }, [user._id, peer.publicKey]);

  return (
    <Modal title="Verify encryption" onClose={onClose}>
      <div className="safety">
        <LockIcon width={40} height={40} />
        <p>
          Messages with <strong>{peer.name}</strong> are end-to-end encrypted. Only the two of you can read them
          — not even Lumora.
        </p>
        <div className="safety-code" aria-label="Safety number">{code}</div>
        <p className="muted small">
          Compare this number with {peer.name} in person or on a call. If it is the same on both phones, no one
          is intercepting your chat.
        </p>
      </div>
    </Modal>
  );
}

/* ───────── one open conversation ───────── */
function Chat({ id }) {
  const { user } = useAuth();
  const { socket, online, refreshUnread } = useSocket();
  const navigate = useNavigate();

  const [peer, setPeer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [error, setError] = useState('');

  const bodyRef = useRef(null);
  const prevHeight = useRef(0);
  const typingOff = useRef(null);
  const typingClear = useRef(null);
  const lastTypingSent = useRef(0);

  // decrypt a batch of messages for display (the server only ever returns ciphertext)
  const decryptList = useCallback(
    (p, list) =>
      Promise.all(
        list.map(async (m) => ({ ...m, plain: await decryptMessage(user._id, p?.publicKey, id, m) }))
      ),
    [user._id, id]
  );

  // load the conversation
  useEffect(() => {
    let alive = true;
    api
      .messages(id)
      .then(async (d) => {
        const list = await decryptList(d.user, d.messages);
        if (!alive) return;
        setPeer(d.user);
        setMessages(list);
        setHasMore(d.hasMore);
        refreshUnread();
      })
      .catch(() => alive && setNotFound(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, refreshUnread, decryptList]);

  // keep scrolled to the newest message
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    if (prevHeight.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current; // older messages were prepended
      prevHeight.current = 0;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, typing, loading]);

  // live events
  useEffect(() => {
    if (!socket) return undefined;

    const onNew = ({ conversation, message }) => {
      if (conversation !== id) return;
      decryptMessage(user._id, peer?.publicKey, id, message).then((plain) =>
        setMessages((m) => (m.some((x) => x._id === message._id) ? m : [...m, { ...message, plain }]))
      );
      if (message.sender !== user._id) {
        setTyping(false);
        api.markSeen(id).then(refreshUnread).catch(() => {});
      }
    };
    const onSeen = ({ conversation }) => {
      if (conversation === id) setMessages((m) => m.map((x) => (x.sender === user._id ? { ...x, seen: true } : x)));
    };
    const onDeleted = ({ conversation, messageId }) => {
      if (conversation === id) setMessages((m) => m.filter((x) => x._id !== messageId));
    };
    const onTyping = ({ from, typing: isTyping }) => {
      if (peer && from === peer._id) {
        setTyping(isTyping);
        clearTimeout(typingClear.current);
        if (isTyping) typingClear.current = setTimeout(() => setTyping(false), 4000);
      }
    };

    socket.on('message:new', onNew);
    socket.on('messages:seen', onSeen);
    socket.on('message:deleted', onDeleted);
    socket.on('typing', onTyping);
    return () => {
      socket.off('message:new', onNew);
      socket.off('messages:seen', onSeen);
      socket.off('message:deleted', onDeleted);
      socket.off('typing', onTyping);
      clearTimeout(typingClear.current);
    };
  }, [socket, id, peer, user._id, refreshUnread]);

  const emitTyping = (isTyping) => {
    if (socket && peer) socket.emit('typing', { to: peer._id, typing: isTyping });
  };

  const onChange = (e) => {
    setText(e.target.value);
    if (Date.now() - lastTypingSent.current > 2000) {
      lastTypingSent.current = Date.now();
      emitTyping(true);
    }
    clearTimeout(typingOff.current);
    typingOff.current = setTimeout(() => {
      lastTypingSent.current = 0;
      emitTyping(false);
    }, 2500);
  };

  const send = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    setError('');
    clearTimeout(typingOff.current);
    lastTypingSent.current = 0;
    emitTyping(false);
    try {
      // encrypt on this device first; only ciphertext is sent to the server
      const enc = await encryptText(user._id, peer?.publicKey, id, value);
      const d = await api.sendMessage(id, enc.text, enc.iv);
      setMessages((m) => (m.some((x) => x._id === d.message._id) ? m : [...m, { ...d.message, plain: value }]));
    } catch (err) {
      setError(err.message);
      setText(value);
    }
  };

  const unsend = async (messageId) => {
    if (!window.confirm('Unsend this message for everyone?')) return;
    try {
      await api.deleteMessage(messageId);
      setMessages((m) => m.filter((x) => x._id !== messageId));
    } catch (err) {
      setError(err.message);
    }
  };

  const loadOlder = async () => {
    if (!messages.length) return;
    try {
      const d = await api.messages(id, messages[0].createdAt);
      const older = await decryptList(peer || d.user, d.messages);
      prevHeight.current = bodyRef.current?.scrollHeight || 0;
      setMessages((m) => [...older, ...m]);
      setHasMore(d.hasMore);
    } catch (err) {
      setError(err.message);
    }
  };

  if (notFound)
    return (
      <div className="chat-empty">
        <MessageIcon width={56} height={56} />
        <h3>Conversation not found</h3>
        <button className="btn btn-ghost" onClick={() => navigate('/messages')}>
          Back to messages
        </button>
      </div>
    );

  const isOnline = peer && online.has(peer._id);
  let lastMine = -1;
  messages.forEach((m, i) => {
    if (m.sender === user._id) lastMine = i;
  });

  return (
    <div className="chat">
      <header className="chat-head">
        <button className="icon-btn back-btn" onClick={() => navigate('/messages')} aria-label="Back">
          <BackIcon width={22} height={22} />
        </button>
        {peer && (
          <Link to={`/u/${peer.username}`} className="chat-peer">
            <PresenceAvatar user={peer} size={44} online={isOnline} />
            <span className="chat-peer-text">
              <strong>{peer.name}</strong>
              <span className={isOnline ? 'on' : ''}>{isOnline ? 'Active now' : `@${peer.username}`}</span>
            </span>
          </Link>
        )}
      </header>

      <div className="chat-body" ref={bodyRef}>
        {peer &&
          (peer.publicKey ? (
            <button className="e2ee-note" onClick={() => setShowSafety(true)}>
              <LockIcon width={14} height={14} /> Messages are end-to-end encrypted. <u>Verify</u>
            </button>
          ) : (
            <p className="e2ee-note warn">
              <LockIcon width={14} height={14} /> {peer.name} hasn’t turned on encrypted messaging yet. Ask them to
              log in once, then you can chat.
            </p>
          ))}

        {hasMore && (
          <button className="btn btn-ghost btn-sm load-older" onClick={loadOlder}>
            Load earlier messages
          </button>
        )}
        {loading && <p className="muted center">Loading…</p>}

        {!loading && messages.length === 0 && peer && (
          <div className="chat-hello">
            <Avatar user={peer} size={84} ring />
            <h3>{peer.name}</h3>
            <p className="muted small">@{peer.username} · say hi and start the conversation</p>
          </div>
        )}

        {messages.map((m, i) => {
          const mine = m.sender === user._id;
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
          const first = newDay || prev.sender !== m.sender;
          const last = !next || next.sender !== m.sender || !sameDay(next.createdAt, m.createdAt);
          return (
            <div key={m._id}>
              {newDay && <div className="day-sep">{dayLabel(m.createdAt)}</div>}
              <div className={`msg-row ${mine ? 'mine' : 'theirs'} ${first ? 'first' : ''} ${last ? 'last' : ''}`}>
                {!mine && (last ? <Avatar user={peer} size={28} /> : <span className="avatar-gap" />)}
                {mine && (
                  <button className="icon-btn unsend" onClick={() => unsend(m._id)} aria-label="Unsend message" title="Unsend">
                    <TrashIcon width={16} height={16} />
                  </button>
                )}
                <div className="bubble" title={clock(m.createdAt)}>
                  {m.plain === null ? (
                    <em className="undecryptable">🔒 Can’t be decrypted on this device</em>
                  ) : (
                    m.plain
                  )}
                </div>
              </div>
              {mine && i === lastMine && <div className="receipt">{m.seen ? 'Seen' : 'Sent'} · {clock(m.createdAt)}</div>}
            </div>
          );
        })}

        {typing && (
          <div className="msg-row theirs first last">
            <Avatar user={peer} size={28} />
            <div className="bubble typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
      </div>

      {error && <p className="error small chat-error">{error}</p>}
      <form className="chat-input" onSubmit={send}>
        <input
          value={text}
          onChange={onChange}
          maxLength={1000}
          placeholder={peer && !peer.publicKey ? 'Waiting for encryption to be enabled…' : 'Message…'}
          aria-label="Message"
          autoComplete="off"
          disabled={!!peer && !peer.publicKey}
        />
        <button className="send-btn" disabled={!text.trim() || (!!peer && !peer.publicKey)} aria-label="Send">
          <SendIcon width={20} height={20} />
        </button>
      </form>

      {showSafety && peer && <SafetyModal peer={peer} onClose={() => setShowSafety(false)} />}
    </div>
  );
}

/* ───────── page: inbox + chat ───────── */
export default function Messages() {
  const { conversationId } = useParams();
  const { user: me } = useAuth();
  const { socket, online } = useSocket();
  const [convos, setConvos] = useState(null);
  const [previews, setPreviews] = useState({});
  const [composing, setComposing] = useState(false);

  const loadConvos = useCallback(() => {
    api
      .conversations()
      .then((d) => setConvos(d.conversations))
      .catch(() => setConvos([]));
  }, []);

  useEffect(() => {
    loadConvos();
  }, [loadConvos, conversationId]);

  useEffect(() => {
    if (!socket) return undefined;
    const events = ['message:new', 'message:deleted', 'messages:seen'];
    events.forEach((e) => socket.on(e, loadConvos));
    return () => events.forEach((e) => socket.off(e, loadConvos));
  }, [socket, loadConvos]);

  // inbox previews are ciphertext on the server: decrypt them here
  useEffect(() => {
    if (!convos) return undefined;
    let alive = true;
    Promise.all(
      convos.map(async (c) => [c._id, await decryptMessage(me._id, c.user.publicKey, c._id, c.lastMessage)])
    ).then((entries) => alive && setPreviews(Object.fromEntries(entries)));
    return () => {
      alive = false;
    };
  }, [convos, me._id]);

  return (
    <div className={`chat-shell ${conversationId ? 'has-chat' : ''}`}>
      <aside className="inbox">
        <div className="inbox-head">
          <h2>Messages</h2>
          <button className="icon-btn" onClick={() => setComposing(true)} aria-label="New message">
            <ComposeIcon width={22} height={22} />
          </button>
        </div>

        <div className="inbox-list">
          {convos === null && <p className="muted center">Loading…</p>}
          {convos?.length === 0 && (
            <div className="inbox-empty">
              <p className="muted">No conversations yet.</p>
              <button className="btn btn-primary btn-sm" onClick={() => setComposing(true)}>
                Start one
              </button>
            </div>
          )}
          {convos?.map((c) => (
            <Link
              key={c._id}
              to={`/messages/${c._id}`}
              className={`convo ${c._id === conversationId ? 'active' : ''} ${c.unread ? 'unread' : ''}`}
            >
              <PresenceAvatar user={c.user} size={52} online={online.has(c.user._id)} />
              <span className="convo-text">
                <strong>{c.user.name}</strong>
                <span>
                  {c.lastMessage.mine ? 'You: ' : ''}
                  {previews[c._id] ?? '🔒 Encrypted message'}
                </span>
              </span>
              <span className="convo-meta">
                <span>{timeAgo(c.lastMessage.createdAt)}</span>
                {c.unread > 0 && <i className="dot-unread" aria-label={`${c.unread} unread`} />}
              </span>
            </Link>
          ))}
        </div>
      </aside>

      <section className="chat-pane">
        {conversationId ? (
          <Chat key={conversationId} id={conversationId} />
        ) : (
          <div className="chat-empty">
            <div className="chat-empty-icon">
              <MessageIcon width={44} height={44} />
            </div>
            <h3>Your messages</h3>
            <p className="muted">Send a private message to a friend.</p>
            <button className="btn btn-primary" onClick={() => setComposing(true)}>
              Send message
            </button>
          </div>
        )}
      </section>

      {composing && <NewMessageModal onClose={() => setComposing(false)} />}
    </div>
  );
}