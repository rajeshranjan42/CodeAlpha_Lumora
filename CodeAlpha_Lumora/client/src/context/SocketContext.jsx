import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken } from '../api.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext({
  socket: null,
  online: new Set(),
  unread: 0,
  refreshUnread: () => {},
});

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [online, setOnline] = useState(() => new Set());
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(() => {
    api
      .unreadCount()
      .then((d) => setUnread(d.count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      setSocket(null);
      setUnread(0);
      setOnline(new Set());
      return undefined;
    }

    const opts = { auth: { token: getToken() } };
    const s = SOCKET_URL ? io(SOCKET_URL, opts) : io(opts);

    s.on('connect', () => s.emit('presence:list', (ids) => setOnline(new Set(ids))));
    s.on('presence', ({ userId, online: isOn }) =>
      setOnline((prev) => {
        const next = new Set(prev);
        if (isOn) next.add(userId);
        else next.delete(userId);
        return next;
      })
    );
    ['message:new', 'messages:seen', 'message:deleted'].forEach((e) => s.on(e, refreshUnread));

    setSocket(s);
    refreshUnread();
    return () => {
      s.disconnect();
    };
  }, [user?._id, refreshUnread]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SocketContext.Provider value={{ socket, online, unread, refreshUnread }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);