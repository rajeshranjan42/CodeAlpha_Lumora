import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';
import { CheckIcon, SearchIcon } from './Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { encryptText } from '../e2ee.js';

/** Encrypts `plain` for one person and sends it into your chat with them. Resolves when sent. */
export async function sendPlainTo(myId, person, plain) {
  const { conversation } = await api.openConversation(person._id);
  const enc = await encryptText(myId, conversation.user.publicKey, conversation._id, plain);
  await api.sendMessage(conversation._id, enc.text, enc.iv);
}

/**
 * Pick people you follow / who follow you and send them something as a chat message.
 * `makePlain(note)` returns the plaintext to encrypt for each person (a card, or a forwarded message).
 */
export default function SendPicker({ makePlain, allowNote = true, actionLabel = 'Send', onDone }) {
  const { user } = useAuth();
  const [people, setPeople] = useState(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState({}); // userId -> reason
  const [sentTo, setSentTo] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    Promise.all([api.followers(user.username), api.following(user.username)])
      .then(([a, b]) => {
        if (!alive) return;
        const map = new Map();
        [...b.users, ...a.users].forEach((u) => u && !map.has(u._id) && u._id !== user._id && map.set(u._id, u));
        setPeople([...map.values()]);
      })
      .catch(() => alive && setPeople([]));
    return () => {
      alive = false;
    };
  }, [user.username, user._id]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (people || []).filter((p) => !t || p.username.toLowerCase().includes(t) || (p.name || '').toLowerCase().includes(t));
  }, [people, q]);

  const toggle = (id) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const send = async () => {
    if (!picked.size || busy) return;
    setBusy(true);
    const bad = {};
    const ok = new Set(sentTo);
    const plain = makePlain(allowNote ? note.trim() : '');
    for (const id of picked) {
      const person = people.find((p) => p._id === id);
      try {
        await sendPlainTo(user._id, person, plain);
        ok.add(id);
      } catch (err) {
        bad[id] = err.message || 'Could not send';
      }
    }
    setSentTo(ok);
    setFailed(bad);
    setPicked(new Set(Object.keys(bad)));
    setBusy(false);
    if (!Object.keys(bad).length) onDone?.(ok.size);
  };

  return (
    <div className="send-picker">
      <label className="send-search">
        <SearchIcon width={16} height={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" />
      </label>
      <div className="send-list">
        {people === null && <p className="muted small">Loading…</p>}
        {people && people.length === 0 && <p className="muted small">Follow someone, or get a follower, to send them things here.</p>}
        {people && people.length > 0 && shown.length === 0 && <p className="muted small">No one matches “{q}”.</p>}
        {shown.map((p) => (
          <button
            type="button"
            key={p._id}
            className={`send-row ${picked.has(p._id) ? 'on' : ''}`}
            onClick={() => toggle(p._id)}
            disabled={busy}
          >
            <Avatar user={p} size={38} />
            <span className="send-name">
              <strong>{p.username}</strong>
              <small>{failed[p._id] ? failed[p._id] : sentTo.has(p._id) ? 'Sent ✓' : p.name}</small>
            </span>
            <span className={`pick ${picked.has(p._id) ? 'on' : ''}`} aria-hidden="true">
              {picked.has(p._id) && <CheckIcon width={14} height={14} />}
            </span>
          </button>
        ))}
      </div>
      {allowNote && (
        <input className="send-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Write a message… (optional)" aria-label="Message" />
      )}
      <button type="button" className="btn btn-primary send-go" disabled={!picked.size || busy} onClick={send}>
        {busy ? 'Sending…' : picked.size ? `${actionLabel} to ${picked.size}` : actionLabel}
      </button>
    </div>
  );
}