import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api, getToken } from '../api.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext({
  socket: null,
  online: new Set(),
  unread: 0,
  refreshUnread: () => {},
  notifUnread: 0,
  setNotifUnread: () => {},
});

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [online, setOnline] = useState(() => new Set());
  const [unread, setUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);

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
      setNotifUnread(0);
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

    // a new like / comment / follow: bump the bell and let pages (and the toast) know
    s.on('notification:new', (n) => {
      setNotifUnread((c) => c + 1);
      window.dispatchEvent(new CustomEvent('lumora:notification', { detail: n }));
    });

    setSocket(s);
    refreshUnread();
    api
      .notificationCount()
      .then((d) => setNotifUnread(d.count))
      .catch(() => {});
    return () => {
      s.disconnect();
    };
  }, [user?._id, refreshUnread]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SocketContext.Provider value={{ socket, online, unread, refreshUnread, notifUnread, setNotifUnread }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);