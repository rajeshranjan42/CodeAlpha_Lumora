const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

/**
 * Real-time layer. REST endpoints persist data; sockets push it:
 *  - each user joins a private room  user:<id>
 *  - server emits message:new / message:deleted / messages:seen to those rooms
 *  - clients emit "typing"; server also tracks who is online
 */
module.exports = function initSocket(httpServer, origin) {
  const io = new Server(httpServer, { cors: { origin } });
  const online = new Map(); // userId -> Set(socketId)

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

    socket.on('typing', (data) => {
      if (data && typeof data.to === 'string') {
        io.to(`user:${data.to}`).emit('typing', { from: uid, typing: !!data.typing });
      }
    });

    socket.on('disconnect', () => {
      const set = online.get(uid);
      if (!set) return;
      set.delete(socket.id);
      if (set.size === 0) {
        online.delete(uid);
        io.emit('presence', { userId: uid, online: false });
      }
    });
  });

  return io;
};