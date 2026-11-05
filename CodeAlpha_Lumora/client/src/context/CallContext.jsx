import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useSocket } from './SocketContext.jsx';
import { useAuth } from './AuthContext.jsx';

/**
 * Voice / video calls, one-to-one or a small group (up to 4 people).
 * The server only introduces people and passes WebRTC setup messages (over the existing socket); audio and
 * video then travel directly between devices, encrypted by WebRTC. In a group every pair of people has its
 * own direct connection, and whoever joins is the one who starts the connections.
 */
const CallContext = createContext(null);
export const useCall = () => useContext(CallContext);

const newId = () => `call-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random().toString(36).slice(2)}`}`;

const FACING = { user: 'user', environment: 'environment' };

async function getMedia(kind, facing = 'user') {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('Calls need a secure (https) connection and a browser that supports them.');
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: kind === 'video' ? { facingMode: FACING[facing] || 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
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
  const [remotes, setRemotes] = useState([]); // [{ user, stream }] one per other person on the call
  const [local, setLocal] = useState(null);
  const [notice, setNotice] = useState('');
  const [reactions, setReactions] = useState([]); // floating emoji [{ key, emoji, name }]
  const [sinkId, setSinkId] = useState(''); // chosen speaker ('' = the device default)
  const [outputs, setOutputs] = useState([]); // speakers / headphones this device offers
  const [canFlip, setCanFlip] = useState(false); // more than one camera?
  const callRef = useRef(null); // always the latest call (handlers run outside React renders)
  const peers = useRef(new Map()); // userId -> { pc, user, pending: [ICE candidates before the offer/answer] }
  const localRef = useRef(null);
  const facingRef = useRef('user');
  const known = useRef(new Map()); // userId -> { _id, name, username, avatar } of people on (or added to) this call
  const queue = useRef(Promise.resolve()); // setup messages are handled one at a time, in order
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
    peers.current.forEach((p) => {
      p.pc.onconnectionstatechange = null;
      p.pc.ontrack = null;
      p.pc.close();
    });
    peers.current = new Map();
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    callRef.current = null;
    facingRef.current = 'user';
    known.current = new Map();
    setCall(null);
    setRemotes([]);
    setLocal(null);
    setReactions([]);
    setSinkId('');
  }, []);

  const endLocal = (msg) => {
    const c = callRef.current;
    if (c) socketRef.current?.emit('call:end', { callId: c.id });
    cleanup();
    if (msg) flash(msg);
  };

  const setRemoteStream = (userId, stream) =>
    setRemotes((list) => {
      const user = peers.current.get(userId)?.user || known.current.get(userId) || { _id: userId };
      return list.some((r) => r.user._id === userId)
        ? list.map((r) => (r.user._id === userId ? { ...r, stream } : r))
        : [...list, { user, stream }];
    });

  const dropPeer = (userId) => {
    const p = peers.current.get(userId);
    if (p) {
      p.pc.onconnectionstatechange = null;
      p.pc.ontrack = null;
      p.pc.close();
      peers.current.delete(userId);
    }
    setRemotes((list) => list.filter((r) => r.user._id !== userId));
  };

  /** One direct connection to one other person on the call. */
  const makePc = async (callId, userId, user) => {
    const old = peers.current.get(userId);
    if (old) return old.pc;
    if (!iceCache.current) {
      try {
        iceCache.current = (await api.callIce()).iceServers;
      } catch {
        iceCache.current = [{ urls: 'stun:stun.l.google.com:19302' }];
      }
    }
    if (!localRef.current || peers.current.has(userId)) return peers.current.get(userId)?.pc; // call ended / raced meanwhile
    const pc = new RTCPeerConnection({ iceServers: iceCache.current });
    const entry = { pc, user: user || known.current.get(userId) || { _id: userId }, pending: [] };
    peers.current.set(userId, entry);
    localRef.current.getTracks().forEach((t) => pc.addTrack(t, localRef.current));
    pc.ontrack = (e) => setRemoteStream(userId, e.streams[0] || new MediaStream([e.track]));
    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit('call:signal', { callId, to: userId, data: { type: 'ice', candidate: e.candidate.toJSON() } });
    };
    const lost = (why) => {
      if (peers.current.get(userId)?.pc !== pc) return;
      dropPeer(userId);
      if (peers.current.size === 0) endLocal(why);
      else flash(`${entry.user.name || 'Someone'} lost connection.`);
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') update({ status: 'active', startedAt: callRef.current?.startedAt || Date.now() });
      else if (s === 'failed') lost('The call couldn’t connect. Your network may block direct calls; a TURN server fixes this.');
      else if (s === 'disconnected')
        setTimeout(() => {
          if (peers.current.get(userId)?.pc === pc && pc.connectionState === 'disconnected') lost('Connection lost.');
        }, 8000);
    };
    return pc;
  };

  /** I joined: start a connection to everyone already on the call. */
  const connectTo = async (callId, list) => {
    for (const person of list) {
      known.current.set(person._id, person);
      const pc = await makePc(callId, person._id, person);
      if (!pc) return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('call:signal', { callId, to: person._id, data: { type: 'offer', sdp: pc.localDescription.sdp } });
    }
  };

  /* ── start a call (caller) ── */
  const startCall = useCallback(async (peer, kind = 'audio') => {
    if (callRef.current) return;
    const s = socketRef.current;
    if (!s || !s.connected) return flash('You’re offline. Reconnecting…');
    const id = newId();
    begin({ id, kind, peer, incoming: false, status: 'starting', muted: false, camOff: false, facing: 'user' });
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
      socketRef.current?.emit('call:accept', { callId: c.id }); // the server replies with who is already on the call
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

  /** Front <-> back camera (phones): a new camera track replaces the old one on every connection. */
  const flipCamera = async () => {
    if (!localRef.current?.getVideoTracks().length) return;
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: next }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      const track = fresh.getVideoTracks()[0];
      const old = localRef.current.getVideoTracks()[0];
      track.enabled = old ? old.enabled : true;
      for (const { pc } of peers.current.values()) {
        const sender = pc.getSenders().find((x) => x.track && x.track.kind === 'video');
        if (sender) await sender.replaceTrack(track);
      }
      if (old) {
        localRef.current.removeTrack(old);
        old.stop();
      }
      localRef.current.addTrack(track);
      facingRef.current = next;
      update({ facing: next });
      setLocal(new MediaStream(localRef.current.getTracks())); // fresh object so the preview refreshes
    } catch {
      flash('Couldn’t switch the camera.');
    }
  };

  /** Speaker: switch between the sound outputs this device offers (where the browser allows it). */
  const cycleSpeaker = () => {
    if (outputs.length < 2) return;
    const i = outputs.findIndex((o) => o.deviceId === sinkId);
    const next = outputs[(i + 1) % outputs.length];
    setSinkId(next.deviceId);
    flash(`Sound: ${next.label || 'Speaker'}`);
  };

  const sendReaction = (emoji) => {
    const c = callRef.current;
    if (!c || c.status !== 'active') return;
    socketRef.current?.emit('call:react', { callId: c.id, emoji });
    pop(emoji, 'You');
  };

  /** Ring one more person into the running call. */
  const addPerson = (person) => {
    const c = callRef.current;
    const s = socketRef.current;
    if (!c || !s) return;
    known.current.set(person._id, person);
    s.emit('call:add', { callId: c.id, to: person._id }, (r) => {
      if (r?.error) flash(r.busy ? `${person.name || 'They'} are on another call.` : r.offline ? `${person.name || 'They'} are offline right now.` : r.error);
      else flash(`Calling ${person.name || person.username}…`);
    });
  };

  const pop = (emoji, name) => {
    const key = `${Date.now()}${Math.random()}`;
    setReactions((list) => [...list.slice(-12), { key, emoji, name, x: 10 + Math.round(Math.random() * 70) }]);
    setTimeout(() => setReactions((list) => list.filter((x) => x.key !== key)), 3200);
  };

  // once a call is running, find out about cameras and speakers (names only show up after permission)
  const active = call?.status === 'active';
  useEffect(() => {
    if (!active || !navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((d) => {
      setCanFlip(d.filter((x) => x.kind === 'videoinput').length > 1);
      setOutputs(typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype ? d.filter((x) => x.kind === 'audiooutput') : []);
    }).catch(() => {});
  }, [active]);

  /* ── messages from the server ── */
  useEffect(() => {
    if (!socket) return undefined;

    const onIncoming = ({ callId, kind, from, group }) => {
      if (callRef.current) return; // the server already prevents this; just in case
      begin({ id: callId, kind, peer: from, incoming: true, status: 'ringing', muted: false, camOff: false, group: !!group, facing: 'user' });
    };

    // I answered (or the call I started was answered by someone joining): the joiner starts the connections
    const onAccepted = ({ callId, peers: others }) => {
      const c = callRef.current;
      if (!c || c.id !== callId) return;
      update({ status: 'connecting' });
      queue.current = queue.current
        .then(() => connectTo(callId, others || []))
        .catch(() => endLocal('The call couldn’t be set up.'));
    };

    const onPeerJoined = ({ callId, user: who }) => {
      const c = callRef.current;
      if (!c || c.id !== callId || !who) return;
      known.current.set(who._id, who);
      const p = peers.current.get(who._id);
      if (p) p.user = who;
      setRemotes((list) => list.map((r) => (r.user._id === who._id ? { ...r, user: who } : r)));
      if (c.status !== 'active') update({ status: 'connecting', peer: c.incoming ? c.peer : who });
      else flash(`${who.name || who.username} joined.`);
    };

    const onPeerLeft = ({ callId, userId }) => {
      const c = callRef.current;
      if (!c || c.id !== callId) return;
      const name = known.current.get(userId)?.name;
      dropPeer(userId);
      if (name) flash(`${name} left the call.`);
    };

    const peerNote = (verb) => ({ callId, userId }) => {
      const c = callRef.current;
      if (!c || c.id !== callId) return;
      flash(`${known.current.get(userId)?.name || 'Someone'} ${verb}.`);
    };
    const onDeclined = peerNote('declined the call');
    const onNoAnswer = peerNote('didn’t answer');

    const handleSignal = async ({ callId, from, data }) => {
      const c = callRef.current;
      if (!c || c.id !== callId || !data || !from) return;
      if (data.type === 'offer') {
        const pc = await makePc(callId, from);
        if (!pc) return;
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        await flush(from);
        const ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        socket.emit('call:signal', { callId, to: from, data: { type: 'answer', sdp: pc.localDescription.sdp } });
      } else {
        const entry = peers.current.get(from);
        if (!entry) return;
        if (data.type === 'answer') {
          await entry.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
          await flush(from);
        } else if (data.type === 'ice' && data.candidate) {
          if (entry.pc.remoteDescription) await entry.pc.addIceCandidate(data.candidate).catch(() => {});
          else entry.pending.push(data.candidate);
        }
      }
    };

    const flush = async (userId) => {
      const entry = peers.current.get(userId);
      if (!entry) return;
      const list = entry.pending;
      entry.pending = [];
      for (const cand of list) await entry.pc.addIceCandidate(cand).catch(() => {});
    };

    const onSignal = (msg) => {
      queue.current = queue.current.then(() => handleSignal(msg)).catch(() => endLocal('The call couldn’t be set up.'));
    };

    const onReact = ({ callId, from, emoji }) => {
      const c = callRef.current;
      if (!c || c.id !== callId) return;
      pop(emoji, known.current.get(from)?.name || '');
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
    socket.on('call:peer-joined', onPeerJoined);
    socket.on('call:peer-left', onPeerLeft);
    socket.on('call:peer-declined', onDeclined);
    socket.on('call:peer-missed', onNoAnswer);
    socket.on('call:react', onReact);
    socket.on('call:signal', onSignal);
    socket.on('call:ended', onEnded);
    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:peer-joined', onPeerJoined);
      socket.off('call:peer-left', onPeerLeft);
      socket.off('call:peer-declined', onDeclined);
      socket.off('call:peer-missed', onNoAnswer);
      socket.off('call:react', onReact);
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
    <CallContext.Provider value={{ call, remotes, local, notice, reactions, sinkId, outputs, canFlip, startCall, answer, decline, hangup, toggleMute, toggleCamera, flipCamera, cycleSpeaker, sendReaction, addPerson }}>
      {children}
    </CallContext.Provider>
  );
}