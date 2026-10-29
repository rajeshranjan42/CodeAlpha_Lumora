import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Logo, { LogoMark } from './Logo.jsx';
import Avatar from './Avatar.jsx';
import CreatePostModal from './CreatePostModal.jsx';
import UploadTray from './UploadTray.jsx';
import {
  HomeIcon,
  CompassIcon,
  PlusIcon,
  UserIcon,
  LogoutIcon,
  MoonIcon,
  SunIcon,
  MessageIcon,
  ReelsIcon,
  BellIcon,
} from './Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { notificationLink, notificationText } from '../utils.js';

export default function Layout() {
  const { user, logout, theme, toggleTheme } = useAuth();
  const { unread, notifUnread } = useSocket();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState('post');
  const [menu, setMenu] = useState(false); // account menu (small screens)
  const [toast, setToast] = useState(null); // a live notification, shown for a few seconds

  const inMessages = pathname.startsWith('/messages');
  const inChat = /^\/messages\/.+/.test(pathname);
  const inReels = pathname.startsWith('/reels');
  const bellBadge = notifUnread > 0 ? <span className="badge">{notifUnread > 99 ? '99+' : notifUnread}</span> : null;
  const badge = unread > 0 ? <span className="badge">{unread > 99 ? '99+' : unread}</span> : null;

  const openCreate = (t = 'post') => {
    setTab(t);
    setCreating(true);
  };

  const doLogout = () => {
    setMenu(false);
    logout();
    navigate('/login');
  };

  useEffect(() => {
    const open = (e) => openCreate(e.detail?.tab || 'post');
    window.addEventListener('lumora:open-create', open);
    return () => window.removeEventListener('lumora:open-create', open);
  }, []);

  useEffect(() => setMenu(false), [pathname]);

  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);

  // pop-up for a new like / comment / follow (not while you're already on the notifications page)
  useEffect(() => {
    let timer;
    const onNotif = (e) => {
      if (window.location.pathname.startsWith('/notifications')) return;
      setToast(e.detail);
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 5000);
    };
    window.addEventListener('lumora:notification', onNotif);
    return () => {
      window.removeEventListener('lumora:notification', onNotif);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className={`shell ${inChat ? 'in-chat' : ''} ${inReels ? 'in-reels' : ''}`}>
      <aside className="sidebar">
        <NavLink to="/" className="sidebar-logo">
          <Logo />
        </NavLink>
        <nav>
          <NavLink to="/" end className="nav-item">
            <HomeIcon /> <span>Home</span>
          </NavLink>
          <NavLink to="/explore" className="nav-item">
            <CompassIcon /> <span>Explore</span>
          </NavLink>
          <NavLink to="/reels" className="nav-item">
            <ReelsIcon /> <span>Reels</span>
          </NavLink>
          <NavLink to="/messages" className="nav-item">
            <MessageIcon /> <span>Messages</span>
            {badge}
          </NavLink>
          <NavLink to="/notifications" className="nav-item">
            <BellIcon /> <span>Notifications</span>
            {bellBadge}
          </NavLink>
          <button className="nav-item" onClick={() => openCreate()}>
            <PlusIcon /> <span>Create</span>
          </button>
          <NavLink to={`/u/${user.username}`} className="nav-item">
            <Avatar user={user} size={26} /> <span>Profile</span>
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <button className="nav-item" onClick={toggleTheme}>
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
            <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
          </button>
          <button className="nav-item" onClick={doLogout}>
            <LogoutIcon /> <span>Log out</span>
          </button>
        </div>
      </aside>

      <header className="topbar">
        <LogoMark size={32} />
        <span className="topbar-brand">
          <span className="logo-name">Lumora</span>
          <span className="topbar-sub">CodeAlpha · by Rajesh Ranjan</span>
        </span>
        <NavLink to="/notifications" className="topbar-bell" aria-label="Notifications">
          <BellIcon width={24} height={24} />
          {bellBadge}
        </NavLink>
        <button
          className="topbar-avatar"
          onClick={() => setMenu((m) => !m)}
          aria-label="Account menu"
          aria-expanded={menu}
          aria-haspopup="menu"
        >
          <Avatar user={user} size={36} ring />
        </button>

        {menu && (
          <>
            <div className="menu-scrim" onClick={() => setMenu(false)} />
            <div className="menu" role="menu">
              <div className="menu-user">
                <Avatar user={user} size={44} />
                <div>
                  <strong>{user.name}</strong>
                  <span>@{user.username}</span>
                </div>
              </div>
              <NavLink to={`/u/${user.username}`} className="menu-item" role="menuitem">
                <UserIcon width={20} height={20} /> My profile
              </NavLink>
              <button className="menu-item" role="menuitem" onClick={toggleTheme}>
                {theme === 'light' ? <MoonIcon width={20} height={20} /> : <SunIcon width={20} height={20} />}
                {theme === 'light' ? 'Dark mode' : 'Light mode'}
              </button>
              <button className="menu-item danger" role="menuitem" onClick={doLogout}>
                <LogoutIcon width={20} height={20} /> Log out
              </button>
            </div>
          </>
        )}
      </header>

      <main className={`main ${inMessages || inReels ? 'flush' : ''}`}>
        <Outlet />
      </main>

      <nav className="bottom-nav">
        <NavLink to="/" end aria-label="Home">
          <HomeIcon />
        </NavLink>
        <NavLink to="/explore" aria-label="Explore">
          <CompassIcon />
        </NavLink>
        <button onClick={() => openCreate()} aria-label="Create">
          <PlusIcon />
        </button>
        <NavLink to="/reels" aria-label="Reels">
          <ReelsIcon />
        </NavLink>
        <NavLink to="/messages" aria-label="Messages">
          <MessageIcon />
          {badge}
        </NavLink>
        <NavLink to={`/u/${user.username}`} aria-label="Profile">
          <UserIcon />
        </NavLink>
      </nav>

      {creating && <CreatePostModal initialTab={tab} onClose={() => setCreating(false)} />}

      <UploadTray />

      {toast && (
        <Link to={notificationLink(toast)} className="toast" onClick={() => setToast(null)}>
          <Avatar user={toast.actor} size={36} />
          <span>
            <strong>{toast.actor.username}</strong> {notificationText(toast)}
          </span>
        </Link>
      )}
    </div>
  );
}