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

  /* ── voice / video calls (1:1, and up to MAX_PARTY people when someone is added) ──
     The server only introduces people and relays WebRTC setup messages; the call audio/video itself goes
     directly between devices (encrypted by WebRTC), one connection per pair of people.
     A person is in at most one call at a time. */
  const RING_MS = 45 * 1000;
  const MAX_PARTY = 4;
  const REACTIONS = ['❤️', '😂', '😮', '👏', '🔥', '👍'];
  const calls = new Map(); // callId -> { kind, members: Map(userId -> socketId), ringing: Map(userId -> { timer }) }
  const inCall = new Map(); // userId -> callId (in the call or being rung)

  const userCard = (u) => ({ _id: String(u._id), name: u.name, username: u.username, avatar: u.avatar });
  const toMembers = (c, event, payload, exceptUid) =>
    c.members.forEach((sid, u) => u !== exceptUid && io.to(sid).emit(event, payload));

  /** Ends the call for everyone left (and everyone who was still being rung). */
  const endAll = (callId, reason, extraUids = [], exceptSocket) => {
    const c = calls.get(callId);
    if (!c) return;
    calls.delete(callId);
    const uids = new Set([...c.members.keys(), ...c.ringing.keys(), ...extraUids]);
    c.ringing.forEach((r) => clearTimeout(r.timer));
    uids.forEach((u) => {
      if (inCall.get(u) === callId) inCall.delete(u);
      let to = io.to(`user:${u}`);
      if (exceptSocket) to = to.except(exceptSocket);
      to.emit('call:ended', { callId, reason });
    });
  };

  /** After someone left / declined / didn't answer: keep going if two or more people remain (or others still ring). */
  const settle = (callId, reason, extraUids) => {
    const c = calls.get(callId);
    if (!c) return;
    if (c.members.size === 0 || (c.members.size === 1 && c.ringing.size === 0)) endAll(callId, reason, extraUids);
    else extraUids.forEach((u) => io.to(`user:${u}`).emit('call:ended', { callId, reason }));
  };

  const dropRinging = (callId, uid, reason) => {
    const c = calls.get(callId);
    const r = c && c.ringing.get(uid);
    if (!r) return false;
    clearTimeout(r.timer);
    c.ringing.delete(uid);
    if (inCall.get(uid) === callId) inCall.delete(uid);
    toMembers(c, reason === 'missed' ? 'call:peer-missed' : 'call:peer-declined', { callId, userId: uid });
    settle(callId, reason, [uid]);
    return true;
  };

  const leave = (callId, uid, reason) => {
    const c = calls.get(callId);
    if (!c || !c.members.has(uid)) return;
    c.members.delete(uid);
    if (inCall.get(uid) === callId) inCall.delete(uid);
    toMembers(c, 'call:peer-left', { callId, userId: uid });
    settle(callId, reason, [uid]);
  };

  /** Rings `to` for call `callId` on behalf of `me`. Returns an error string or ''. */
  const ring = async (callId, c, me, to) => {
    if (!online.has(to)) {
      push.sendTo(to, { title: 'Missed call', body: `${me.name || me.username} tried to ${c.kind === 'video' ? 'video call' : 'call'} you`, url: '/messages', tag: `call-${callId}` });
      return { error: 'They are offline right now', offline: true };
    }
    if (inCall.has(to)) return { error: 'They are on another call', busy: true };
    const timer = setTimeout(() => {
      push.sendTo(to, { title: 'Missed call', body: `${me.name || me.username} called you`, url: '/messages', tag: `call-${callId}` });
      dropRinging(callId, to, 'missed');
    }, RING_MS);
    c.ringing.set(to, { timer });
    inCall.set(to, callId);
    io.to(`user:${to}`).emit('call:incoming', { callId, kind: c.kind, group: c.members.size > 1, from: userCard(me) });
    return {};
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

    const loadMe = () => User.findById(uid).select('name username avatar').lean();
    const shareChat = (x, y) => Conversation.exists({ participants: { $all: [x, y] } });

    socket.on('call:invite', async (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const to = data && typeof data.to === 'string' ? data.to : '';
        const kind = data && data.kind === 'video' ? 'video' : 'audio';
        const callId = data && typeof data.callId === 'string' && /^[\w-]{8,64}$/.test(data.callId) ? data.callId : '';
        if (!to || !callId || to === uid || calls.has(callId)) return reply({ error: 'Invalid call' });
        if (inCall.has(uid)) return reply({ error: 'You are already in a call' });
        // only people who already have a conversation can call each other
        if (!(await shareChat(uid, to))) return reply({ error: 'You can only call people you have chatted with' });
        const me = await loadMe();
        if (!me) return reply({ error: 'Invalid call' });

        const c = { kind, members: new Map([[uid, socket.id]]), ringing: new Map() };
        calls.set(callId, c);
        inCall.set(uid, callId);
        const r = await ring(callId, c, me, to);
        if (r.error) {
          calls.delete(callId);
          inCall.delete(uid);
          return reply(r);
        }
        reply({ ok: true });
      } catch (err) {
        console.error('call:invite failed:', err.message);
        reply({ error: 'Could not start the call' });
      }
    });

    // someone already in the call rings one more person (up to MAX_PARTY in total)
    socket.on('call:add', async (data, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const callId = data && data.callId;
        const to = data && typeof data.to === 'string' ? data.to : '';
        const c = calls.get(callId);
        if (!c || c.members.get(uid) !== socket.id || !to || to === uid) return reply({ error: 'Invalid call' });
        if (c.members.has(to) || c.ringing.has(to)) return reply({ error: 'They are already in this call' });
        if (c.members.size + c.ringing.size >= MAX_PARTY) return reply({ error: `A call can have up to ${MAX_PARTY} people` });
        if (!(await shareChat(uid, to))) return reply({ error: 'You can only add people you have chatted with' });
        const me = await loadMe();
        if (!me || !calls.has(callId)) return reply({ error: 'Invalid call' });
        const r = await ring(callId, c, me, to);
        if (r.error) return reply(r);
        reply({ ok: true });
      } catch (err) {
        console.error('call:add failed:', err.message);
        reply({ error: 'Could not add them' });
      }
    });

    socket.on('call:accept', async ({ callId } = {}) => {
      try {
        const c = calls.get(callId);
        const r = c && c.ringing.get(uid);
        if (!r) return;
        clearTimeout(r.timer);
        c.ringing.delete(uid);
        const existing = [...c.members.keys()];
        c.members.set(uid, socket.id);
        socket.to(`user:${uid}`).emit('call:ended', { callId, reason: 'answered-elsewhere' }); // my other devices stop ringing
        const [me, others] = await Promise.all([loadMe(), User.find({ _id: { $in: existing } }).select('name username avatar').lean()]);
        if (!calls.has(callId)) return;
        existing.forEach((u) => io.to(c.members.get(u)).emit('call:peer-joined', { callId, user: userCard(me) }));
        // the new person starts a connection to everyone already in the call
        socket.emit('call:accepted', { callId, peers: others.map(userCard) });
      } catch (err) {
        console.error('call:accept failed:', err.message);
      }
    });

    socket.on('call:reject', ({ callId } = {}) => {
      dropRinging(callId, uid, 'declined');
    });

    socket.on('call:end', ({ callId } = {}) => {
      const c = calls.get(callId);
      if (!c) return;
      if (c.ringing.has(uid)) return void dropRinging(callId, uid, 'declined');
      leave(callId, uid, 'ended');
    });

    // WebRTC setup messages (offer / answer / ICE candidates) go only to the one person they are meant for
    socket.on('call:signal', ({ callId, to, data } = {}) => {
      const c = calls.get(callId);
      if (!c || c.members.get(uid) !== socket.id || typeof to !== 'string' || !data || typeof data !== 'object') return;
      if (JSON.stringify(data).length > 20000) return;
      const target = c.members.get(to);
      if (target) io.to(target).emit('call:signal', { callId, from: uid, data });
    });

    // a quick emoji reaction, shown to everyone else in the call
    socket.on('call:react', ({ callId, emoji } = {}) => {
      const c = calls.get(callId);
      if (!c || c.members.get(uid) !== socket.id || !REACTIONS.includes(emoji)) return;
      toMembers(c, 'call:react', { callId, from: uid, emoji }, uid);
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
      // a device that was in the call dropped: take that person out (a ringing call ends only when no device is left)
      const callId = inCall.get(uid);
      const c = callId && calls.get(callId);
      if (c && c.members.get(uid) === socket.id) leave(callId, uid, 'disconnected');
      else if (c && set.size === 0 && c.ringing.has(uid)) dropRinging(callId, uid, 'disconnected');
      if (set.size === 0) {
        online.delete(uid);
        io.emit('presence', { userId: uid, online: false });
      }
    });
  });

  return io;
};