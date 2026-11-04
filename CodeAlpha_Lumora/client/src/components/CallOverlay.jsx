import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import { MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon, VideoIcon, VideoOffIcon } from './Icons.jsx';
import { useCall } from '../context/CallContext.jsx';

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function Stream({ stream, muted = false, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}

/** Full-screen incoming / outgoing / ongoing call, plus a small notice when a call couldn't happen. */
export default function CallOverlay() {
  const { call, remote, local, notice, answer, decline, hangup, toggleMute, toggleCamera } = useCall();
  const [, tick] = useState(0);
  useEffect(() => {
    if (call?.status !== 'active') return undefined;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [call?.status]);

  if (!call)
    return notice ? (
      <div className="call-notice" role="status">
        {notice}
      </div>
    ) : null;

  const video = call.kind === 'video';
  const name = call.peer?.name || call.peer?.username || 'Unknown';
  const status =
    call.status === 'ringing' ? `Incoming ${video ? 'video' : 'voice'} call`
    : call.status === 'active' ? mmss(Date.now() - (call.startedAt || Date.now()))
    : call.status === 'connecting' ? 'Connecting…'
    : call.status === 'calling' ? 'Ringing…'
    : 'Starting…';

  return (
    <div className={`call ${video ? 'is-video' : 'is-audio'} ${video && call.status === 'active' ? 'live' : ''}`} role="dialog" aria-modal="true" aria-label="Call">
      {/* the other person's video (or just their sound for voice calls) */}
      <Stream stream={remote} className={`call-remote ${video && call.status === 'active' ? 'show' : ''}`} />

      <div className="call-top">
        <Avatar user={call.peer} size={video && call.status === 'active' ? 44 : 120} ring />
        <h2>{name}</h2>
        <p aria-live="polite">{status}</p>
      </div>

      {video && local && call.status !== 'ringing' && (
        <Stream stream={local} muted className={`call-local ${call.camOff ? 'off' : ''}`} />
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
            {call.muted ? <MicOffIcon width={26} height={26} /> : <MicIcon width={26} height={26} />}
          </button>
          {video && (
            <button className={`call-btn ${call.camOff ? 'on' : ''}`} onClick={toggleCamera} aria-label={call.camOff ? 'Turn camera on' : 'Turn camera off'} aria-pressed={call.camOff}>
              {call.camOff ? <VideoOffIcon width={26} height={26} /> : <VideoIcon width={26} height={26} />}
            </button>
          )}
          <button className="call-btn decline" onClick={hangup} aria-label="End call">
            <PhoneOffIcon width={28} height={28} />
          </button>
        </div>
      )}
    </div>
  );
}