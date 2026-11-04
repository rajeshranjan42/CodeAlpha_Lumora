import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useSocket } from './SocketContext.jsx';
import { useAuth } from './AuthContext.jsx';

/**
 * Voice / video calls.
 * The server only introduces the two people and passes WebRTC setup messages (over the existing socket);
 * audio and video then travel directly between the two devices, encrypted by WebRTC.
 */
const CallContext = createContext(null);
export const useCall = () => useContext(CallContext);

const newId = () => `call-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

async function getMedia(kind) {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('Calls need a secure (https) connection and a browser that supports them.');
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: kind === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });
  } catch (e) {
    const what = kind === 'video' ? 'microphone and camera' : 'microphone';
    if (e.name === 'NotAllowedError') throw new Error(`Allow ${what} access in your browser to make calls.`);
    if (e.name === 'NotFoundError') throw new Error(`No ${what} found on this device.`);
    throw new Error(`Couldn’t start your ${what}. Is another app using it?`);
  }
}

export function CallProvider({ children }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [call, setCall] = useState(null); // { id, kind, peer, incoming, status, muted, camOff, startedAt }
  const [remote, setRemote] = useState(null);
  const [local, setLocal] = useState(null);
  const [notice, setNotice] = useState('');
  const callRef = useRef(null); // always the latest call (handlers run outside React renders)
  const pcRef = useRef(null);
  const localRef = useRef(null);
  const pending = useRef([]); // ICE candidates that arrived before the offer/answer
  const iceCache = useRef(null);
  const socketRef = useRef(null);
  const noticeTimer = useRef(null);
  socketRef.current = socket;

  const flash = (msg) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 6000);
  };
  const begin = (c) => {
    callRef.current = c;
    setCall(c);
  };
  const update = (patch) => {
    if (!callRef.current) return;
    callRef.current = { ...callRef.current, ...patch };
    setCall(callRef.current);
  };

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
    }
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    pending.current = [];
    callRef.current = null;
    setCall(null);
    setRemote(null);
    setLocal(null);
  }, []);

  const endLocal = (msg) => {
    const c = callRef.current;
    if (c) socketRef.current?.emit('call:end', { callId: c.id });
    cleanup();
    if (msg) flash(msg);
  };

  const makePc = async (callId) => {
    if (!iceCache.current) {
      try {
        iceCache.current = (await api.callIce()).iceServers;
      } catch {
        iceCache.current = [{ urls: 'stun:stun.l.google.com:19302' }];
      }
    }
    const pc = new RTCPeerConnection({ iceServers: iceCache.current });
    localRef.current.getTracks().forEach((t) => pc.addTrack(t, localRef.current));
    pc.ontrack = (e) => setRemote(e.streams[0] || new MediaStream([e.track]));
    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit('call:signal', { callId, data: { type: 'ice', candidate: e.candidate.toJSON() } });
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') update({ status: 'active', startedAt: callRef.current?.startedAt || Date.now() });
      else if (s === 'failed')
        endLocal('The call couldn’t connect. Your network may block direct calls; a TURN server fixes this.');
      else if (s === 'disconnected')
        setTimeout(() => {
          if (pcRef.current === pc && pc.connectionState === 'disconnected') endLocal('Connection lost.');
        }, 8000);
    };
    pcRef.current = pc;
    return pc;
  };

  /* ── start a call (caller) ── */
  const startCall = useCallback(async (peer, kind = 'audio') => {
    if (callRef.current) return;
    const s = socketRef.current;
    if (!s || !s.connected) return flash('You’re offline. Reconnecting…');
    const id = newId();
    begin({ id, kind, peer, incoming: false, status: 'starting', muted: false, camOff: false });
    try {
      const stream = await getMedia(kind);
      if (!callRef.current || callRef.current.id !== id) return stream.getTracks().forEach((t) => t.stop()); // cancelled meanwhile
      localRef.current = stream;
      setLocal(stream);
    } catch (e) {
      cleanup();
      return flash(e.message);
    }
    s.emit('call:invite', { to: peer._id, kind, callId: id }, (r) => {
      if (r?.error) {
        cleanup();
        flash(r.busy ? `${peer.name || 'They'} are on another call.` : r.offline ? `${peer.name || 'They'} are offline right now.` : r.error);
      } else update({ status: 'calling' });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── answer / decline / hang up ── */
  const answer = useCallback(async () => {
    const c = callRef.current;
    if (!c || !c.incoming || c.status !== 'ringing') return;
    update({ status: 'connecting' });
    try {
      const stream = await getMedia(c.kind);
      localRef.current = stream;
      setLocal(stream);
      await makePc(c.id); // ready before the caller's offer arrives
      socketRef.current?.emit('call:accept', { callId: c.id });
    } catch (e) {
      socketRef.current?.emit('call:reject', { callId: c.id });
      cleanup();
      flash(e.message);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const decline = useCallback(() => {
    const c = callRef.current;
    if (c) socketRef.current?.emit('call:reject', { callId: c.id });
    cleanup();
  }, [cleanup]);

  const hangup = useCallback(() => endLocal(''), []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = () => {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    update({ muted: !track.enabled });
  };
  const toggleCamera = () => {
    const track = localRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    update({ camOff: !track.enabled });
  };

  /* ── messages from the server ── */
  useEffect(() => {
    if (!socket) return undefined;

    const onIncoming = ({ callId, kind, from }) => {
      if (callRef.current) return; // the server already prevents this; just in case
      begin({ id: callId, kind, peer: from, incoming: true, status: 'ringing', muted: false, camOff: false });
    };

    const onAccepted = async ({ callId }) => {
      const c = callRef.current;
      if (!c || c.id !== callId || c.incoming) return;
      update({ status: 'connecting' });
      try {
        const pc = await makePc(callId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:signal', { callId, data: { type: 'offer', sdp: pc.localDescription.sdp } });
      } catch {
        endLocal('The call couldn’t be set up.');
      }
    };

    const flush = async (pc) => {
      const list = pending.current;
      pending.current = [];
      for (const cand of list) await pc.addIceCandidate(cand).catch(() => {});
    };

    const onSignal = async ({ callId, data }) => {
      const c = callRef.current;
      const pc = pcRef.current;
      if (!c || c.id !== callId || !pc || !data) return;
      try {
        if (data.type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          await flush(pc);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          socket.emit('call:signal', { callId, data: { type: 'answer', sdp: pc.localDescription.sdp } });
        } else if (data.type === 'answer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
          await flush(pc);
        } else if (data.type === 'ice' && data.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
          else pending.current.push(data.candidate);
        }
      } catch {
        endLocal('The call couldn’t be set up.');
      }
    };

    const onEnded = ({ callId, reason }) => {
      const c = callRef.current;
      if (!c || c.id !== callId) return;
      const name = c.peer?.name || 'They';
      const msg =
        reason === 'declined' ? `${name} declined the call.`
        : reason === 'missed' ? (c.incoming ? `Missed call from ${name}.` : `${name} didn’t answer.`)
        : reason === 'disconnected' ? 'The call dropped.'
        : '';
      cleanup();
      if (msg) flash(msg);
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:signal', onSignal);
    socket.on('call:ended', onEnded);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:signal', onSignal);
      socket.off('call:ended', onEnded);
    };
  }, [socket, cleanup]); // eslint-disable-line react-hooks/exhaustive-deps

  // logging out (or losing the socket for good) must never leave the camera on
  useEffect(() => {
    if (!user) cleanup();
  }, [user, cleanup]);
  useEffect(() => cleanup, [cleanup]);

  /* ── ring tones (made with the Web Audio API, no files needed) ── */
  const ringing = call?.status === 'ringing';
  const calling = call?.status === 'calling';
  useEffect(() => {
    if (!ringing && !calling) return undefined;
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return undefined;
    }
    const tone = (freq, dur, at) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + at + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + dur + 0.05);
    };
    const ring = () => {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (ringing) {
        tone(440, 0.2, 0);
        tone(480, 0.2, 0.28);
        navigator.vibrate?.([300, 150, 300]);
      } else tone(425, 0.4, 0);
    };
    ring();
    const t = setInterval(ring, ringing ? 2200 : 3200);
    return () => {
      clearInterval(t);
      ctx.close().catch(() => {});
    };
  }, [ringing, calling]);

  return (
    <CallContext.Provider value={{ call, remote, local, notice, startCall, answer, decline, hangup, toggleMute, toggleCamera }}>
      {children}
    </CallContext.Provider>
  );
}