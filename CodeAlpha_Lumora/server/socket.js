const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Conversation = require('./models/Conversation');
const User = require('./models/User');
const push = require('./utils/push');

/**
 * Real-time layer. REST endpoints persist data; sockets push it:
 *  - each user joins a private room  user:<id>
 *  - server emits message:new / message:deleted / messages:seen to those rooms
 *  - clients emit "typing"; server also tracks who is online
 */
module.exports = function initSocket(httpServer, origin) {
  const io = new Server(httpServer, { cors: { origin } });
  const online = new Map(); // userId -> Set(socketId)

  /* ── voice / video calls ──
     The server only introduces the two people and relays WebRTC setup messages; the call audio/video itself
     goes directly between their devices (encrypted by WebRTC). One call per user at a time. */
  const RING_MS = 45 * 1000;
  const calls = new Map(); // callId -> { caller, callee, kind, callerSocket, calleeSocket, state, timer }
  const inCall = new Map(); // userId -> callId

  const finish = (callId, reason, exceptSocket) => {
    const c = calls.get(callId);
    if (!c) return;
    clearTimeout(c.timer);
    calls.delete(callId);
    if (inCall.get(c.caller) === callId) inCall.delete(c.caller);
    if (inCall.get(c.callee) === callId) inCall.delete(c.callee);
    // tell every device of both people (a ringing phone and a ringing laptop must both stop)
    [c.caller, c.callee].forEach((u) => {
      let to = io.to(`user:${u}`);
      if (exceptSocket) to = to.except(exceptSocket);
      to.emit('call:ended', { callId, reason });
    });
  };

  io.use((socket, next) => {
    try {
      const { id } = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
      socket.userId = String(id);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const uid = socket.userId;
    socket.join(`user:${uid}`);

    const sockets = online.get(uid) || new Set();
    sockets.add(socket.id);
    online.set(uid, sockets);
    if (sockets.size === 1) io.emit('presence', { userId: uid, online: true });

    socket.on('presence:list', (cb) => {
      if (typeof cb === 'function') cb([...online.keys()]);
    });

    socket.on('call:invite', async (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const to = data && typeof data.to === 'string' ? data.to : '';
        const kind = data && data.kind === 'video' ? 'video' : 'audio';
        const callId = data && typeof data.callId === 'string' && /^[\w-]{8,64}$/.test(data.callId) ? data.callId : '';
        if (!to || !callId || to === uid) return reply({ error: 'Invalid call' });
        if (inCall.has(uid)) return reply({ error: 'You are already in a call' });
        // only people who already have a conversation can call each other
        if (!(await Conversation.exists({ participants: { $all: [uid, to] } }))) return reply({ error: 'You can only call people you have chatted with' });
        const me = await User.findById(uid).select('name username avatar').lean();
        if (!me) return reply({ error: 'Invalid call' });
        if (!online.has(to)) {
          push.sendTo(to, { title: 'Missed call', body: `${me.name || me.username} tried to ${kind === 'video' ? 'video call' : 'call'} you`, url: '/messages', tag: `call-${callId}` });
          return reply({ error: 'They are offline right now', offline: true });
        }
        if (inCall.has(to)) return reply({ error: 'They are on another call', busy: true });

        const call = { caller: uid, callee: to, kind, callerSocket: socket.id, calleeSocket: null, state: 'ringing' };
        call.timer = setTimeout(() => {
          push.sendTo(to, { title: 'Missed call', body: `${me.name || me.username} called you`, url: '/messages', tag: `call-${callId}` });
          finish(callId, 'missed');
        }, RING_MS);
        calls.set(callId, call);
        inCall.set(uid, callId);
        inCall.set(to, callId);
        io.to(`user:${to}`).emit('call:incoming', { callId, kind, from: { _id: uid, name: me.name, username: me.username, avatar: me.avatar } });
        reply({ ok: true });
      } catch (err) {
        console.error('call:invite failed:', err.message);
        reply({ error: 'Could not start the call' });
      }
    });

    socket.on('call:accept', ({ callId } = {}) => {
      const c = calls.get(callId);
      if (!c || c.callee !== uid || c.state !== 'ringing') return;
      c.state = 'active';
      c.calleeSocket = socket.id;
      clearTimeout(c.timer);
      socket.to(`user:${uid}`).emit('call:ended', { callId, reason: 'answered-elsewhere' }); // my other devices stop ringing
      io.to(c.callerSocket).emit('call:accepted', { callId });
    });

    socket.on('call:reject', ({ callId } = {}) => {
      const c = calls.get(callId);
      if (c && c.callee === uid && c.state === 'ringing') finish(callId, 'declined');
    });

    socket.on('call:end', ({ callId } = {}) => {
      const c = calls.get(callId);
      if (c && (c.caller === uid || c.callee === uid)) finish(callId, 'ended');
    });

    // WebRTC setup messages (offer / answer / ICE candidates), forwarded only to the other person's device
    socket.on('call:signal', ({ callId, data } = {}) => {
      const c = calls.get(callId);
      if (!c || c.state !== 'active' || !data || typeof data !== 'object') return;
      if (JSON.stringify(data).length > 20000) return;
      const target = c.caller === uid ? c.calleeSocket : c.callee === uid ? c.callerSocket : null;
      if (target) io.to(target).emit('call:signal', { callId, data });
    });

    socket.on('typing', (data) => {
      if (data && typeof data.to === 'string') {
        io.to(`user:${data.to}`).emit('typing', { from: uid, typing: !!data.typing });
      }
    });

    socket.on('disconnect', () => {
      const set = online.get(uid);
      if (!set) return;
      set.delete(socket.id);
      // a device that was in the call dropped: end it for the other person (a ringing call ends only when no device is left)
      const callId = inCall.get(uid);
      const c = callId && calls.get(callId);
      if (c && (c.callerSocket === socket.id || c.calleeSocket === socket.id || (set.size === 0 && c.state === 'ringing'))) {
        finish(callId, 'disconnected', socket.id);
      }
      if (set.size === 0) {
        online.delete(uid);
        io.emit('presence', { userId: uid, online: false });
      }
    });
  });

  return io;
};