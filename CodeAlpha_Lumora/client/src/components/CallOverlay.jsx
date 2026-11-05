import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';
import {
  FlipCameraIcon,
  MicIcon,
  MicOffIcon,
  PhoneIcon,
  PhoneOffIcon,
  SmileIcon,
  SpeakerIcon,
  UserPlusIcon,
  VideoIcon,
  VideoOffIcon,
  CloseIcon,
} from './Icons.jsx';
import { useCall } from '../context/CallContext.jsx';

const REACTION_EMOJIS = ['❤️', '😂', '😮', '👏', '🔥', '👍'];
const MAX_PARTY = 4;

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** A <video> that plays a stream (and, where the browser allows, through a chosen speaker). */
function Stream({ stream, muted = false, className = '', sinkId = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  useEffect(() => {
    if (sinkId && ref.current?.setSinkId) ref.current.setSinkId(sinkId).catch(() => {});
  }, [sinkId, stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}

/** Pick someone you've chatted with and ring them into this call. */
function AddPerson({ inCallIds, full, onPick, onClose }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    let alive = true;
    api.conversations()
      .then((d) => alive && setList((d.conversations || []).map((c) => c.user).filter(Boolean)))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, []);
  const people = (list || []).filter((u) => !inCallIds.includes(u._id));
  return (
    <div className="call-sheet" role="dialog" aria-label="Add people to the call">
      <div className="call-sheet-head">
        <strong>Add to call</strong>
        <button className="call-sheet-x" onClick={onClose} aria-label="Close"><CloseIcon width={18} height={18} /></button>
      </div>
      {full && <p className="call-sheet-note">A call can have up to {MAX_PARTY} people.</p>}
      {list === null && <p className="call-sheet-note">Loading…</p>}
      {list && people.length === 0 && <p className="call-sheet-note">No one else to add. You can add people you have chatted with.</p>}
      <div className="call-sheet-list">
        {people.map((u) => (
          <button key={u._id} className="call-sheet-row" disabled={full} onClick={() => { onPick(u); onClose(); }}>
            <Avatar user={u} size={36} />
            <span>{u.name || u.username}</span>
            <UserPlusIcon width={18} height={18} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Full-screen incoming / outgoing / ongoing call, plus a small notice when a call couldn't happen. */
export default function CallOverlay() {
  const {
    call, remotes, local, notice, reactions, sinkId, outputs, canFlip,
    answer, decline, hangup, toggleMute, toggleCamera, flipCamera, cycleSpeaker, sendReaction, addPerson,
  } = useCall();
  const [, tick] = useState(0);
  const [tray, setTray] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (call?.status !== 'active') return undefined;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [call?.status]);
  useEffect(() => {
    if (!call) {
      setTray(false);
      setAdding(false);
    }
  }, [call]);

  if (!call)
    return notice ? (
      <div className="call-notice" role="status">
        {notice}
      </div>
    ) : null;

  const video = call.kind === 'video';
  const live = video && call.status === 'active';
  const group = remotes.length > 1;
  const names = remotes.map((r) => r.user.name || r.user.username).filter(Boolean);
  const name = group ? `${names[0]}, ${names[1]}${names.length > 2 ? ` +${names.length - 2}` : ''}` : remotes[0]?.user.name || call.peer?.name || call.peer?.username || 'Unknown';
  const status =
    call.status === 'ringing' ? `Incoming ${call.group ? 'group ' : ''}${video ? 'video' : 'voice'} call`
    : call.status === 'active' ? mmss(Date.now() - (call.startedAt || Date.now()))
    : call.status === 'connecting' ? 'Connecting…'
    : call.status === 'calling' ? 'Ringing…'
    : 'Starting…';
  const inCall = call.status === 'active' || call.status === 'connecting' || call.status === 'calling';

  return (
    <div className={`call ${video ? 'is-video' : 'is-audio'} ${live ? 'live' : ''} ${group ? 'is-group' : ''}`} role="dialog" aria-modal="true" aria-label="Call">
      {/* the other people's video (or just their sound for voice calls); a grid when there are several */}
      {group && live ? (
        <div className={`call-grid n${remotes.length}`}>
          {remotes.map((r) => (
            <div className="call-tile" key={r.user._id}>
              <Stream stream={r.stream} sinkId={sinkId} />
              <span className="call-tag">{r.user.name || r.user.username}</span>
            </div>
          ))}
        </div>
      ) : (
        remotes.map((r, i) => (
          <Stream key={r.user._id} stream={r.stream} sinkId={sinkId} className={`call-remote ${live && i === 0 ? 'show' : ''}`} />
        ))
      )}

      <div className="call-top">
        {group && !live ? (
          <div className="call-faces">{remotes.map((r) => <Avatar key={r.user._id} user={r.user} size={72} ring />)}</div>
        ) : (
          <Avatar user={remotes[0]?.user || call.peer} size={live ? 44 : 120} ring />
        )}
        <h2>{name}</h2>
        <p aria-live="polite">{status}</p>
      </div>

      {/* emoji reactions floating up */}
      <div className="call-floats" aria-hidden="true">
        {reactions.map((r) => (
          <span key={r.key} className="call-float" style={{ left: `${r.x}%` }}>
            {r.emoji}
            {r.name && <small>{r.name}</small>}
          </span>
        ))}
      </div>

      {video && local && call.status !== 'ringing' && (
        <Stream stream={local} muted className={`call-local ${call.camOff ? 'off' : ''} ${call.facing === 'environment' ? 'rear' : ''}`} />
      )}

      {notice && <div className="call-notice in-call" role="status">{notice}</div>}

      {tray && call.status === 'active' && (
        <div className="call-tray" role="group" aria-label="Reactions">
          {REACTION_EMOJIS.map((e) => (
            <button key={e} onClick={() => { sendReaction(e); }} aria-label={`React ${e}`}>{e}</button>
          ))}
        </div>
      )}
      {adding && (
        <AddPerson inCallIds={remotes.map((r) => r.user._id)} full={remotes.length + 1 >= MAX_PARTY} onPick={addPerson} onClose={() => setAdding(false)} />
      )}

      {call.status === 'ringing' ? (
        <div className="call-actions">
          <button className="call-btn decline" onClick={decline} aria-label="Decline">
            <PhoneOffIcon width={28} height={28} />
          </button>
          <button className="call-btn accept" onClick={answer} aria-label="Accept">
            {video ? <VideoIcon width={28} height={28} /> : <PhoneIcon width={28} height={28} />}
          </button>
        </div>
      ) : (
        <div className="call-actions">
          <button className={`call-btn ${call.muted ? 'on' : ''}`} onClick={toggleMute} aria-label={call.muted ? 'Unmute' : 'Mute'} aria-pressed={call.muted}>
            {call.muted ? <MicOffIcon width={24} height={24} /> : <MicIcon width={24} height={24} />}
          </button>
          {video && (
            <button className={`call-btn ${call.camOff ? 'on' : ''}`} onClick={toggleCamera} aria-label={call.camOff ? 'Turn camera on' : 'Turn camera off'} aria-pressed={call.camOff}>
              {call.camOff ? <VideoOffIcon width={24} height={24} /> : <VideoIcon width={24} height={24} />}
            </button>
          )}
          {video && canFlip && (
            <button className="call-btn" onClick={flipCamera} aria-label="Switch camera">
              <FlipCameraIcon width={24} height={24} />
            </button>
          )}
          {outputs.length > 1 && (
            <button className="call-btn" onClick={cycleSpeaker} aria-label="Change speaker">
              <SpeakerIcon width={24} height={24} />
            </button>
          )}
          {call.status === 'active' && (
            <button className={`call-btn ${tray ? 'on' : ''}`} onClick={() => { setTray((t) => !t); setAdding(false); }} aria-label="Reactions" aria-pressed={tray}>
              <SmileIcon width={24} height={24} />
            </button>
          )}
          {inCall && (
            <button className={`call-btn ${adding ? 'on' : ''}`} onClick={() => { setAdding((a) => !a); setTray(false); }} aria-label="Add person" aria-pressed={adding}>
              <UserPlusIcon width={24} height={24} />
            </button>
          )}
          <button className="call-btn decline" onClick={hangup} aria-label="End call">
            <PhoneOffIcon width={26} height={26} />
          </button>
        </div>
      )}
    </div>
  );
}