import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, assetUrl } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import FollowButton from '../components/FollowButton.jsx';
import { BellIcon, CloseIcon, PlayIcon } from '../components/Icons.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { cache } from '../cache.js';
import { notificationLink, notificationText, timeAgo } from '../utils.js';

function Thumb({ post }) {
  if (!post) return null;
  if (post.thumb) return <img className="notif-thumb" src={assetUrl(post.thumb)} alt="" loading="lazy" />;
  if (post.video)
    return (
      <span className="notif-thumb video">
        <video src={`${assetUrl(post.video)}#t=0.1`} preload="metadata" muted playsInline />
        <PlayIcon width={14} height={14} />
      </span>
    );
  return null;
}

export default function Notifications() {
  const { setNotifUnread } = useSocket();
  const cached = cache.get('notifications');
  const [items, setItems] = useState(cached?.items || null);
  const [hasMore, setHasMore] = useState(cached?.hasMore || false);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .notifications(1)
      .then((d) => {
        setItems(d.notifications);
        setHasMore(d.hasMore);
        setPage(1);
        cache.set('notifications', { items: d.notifications, hasMore: d.hasMore });
        // opening the page counts as reading; this view keeps the "new" highlights until you leave
        if (d.notifications.some((n) => !n.read)) {
          api.readNotifications().then(() => setNotifUnread(0)).catch(() => {});
        } else setNotifUnread(0);
      })
      .catch((e) => setError(e.message));
  }, [setNotifUnread]);

  useEffect(() => {
    load();
  }, [load]);

  // live: new ones appear at the top while the page is open
  useEffect(() => {
    const onNew = (e) => {
      setItems((l) => [e.detail, ...(l || []).filter((x) => x._id !== e.detail._id)]);
      api.readNotifications().then(() => setNotifUnread(0)).catch(() => {});
    };
    window.addEventListener('lumora:notification', onNew);
    return () => window.removeEventListener('lumora:notification', onNew);
  }, [setNotifUnread]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const d = await api.notifications(page + 1);
      setItems((l) => [...l, ...d.notifications]);
      setHasMore(d.hasMore);
      setPage((p) => p + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const remove = async (id) => {
    setItems((l) => l.filter((x) => x._id !== id));
    api.deleteNotification(id).catch(() => {});
  };

  return (
    <div className="page notif-page">
      <h2 className="section-title">Notifications</h2>
      {error && <p className="error">{error}</p>}
      {items === null && !error && <p className="muted center">Loading…</p>}

      {items?.length === 0 && (
        <div className="card empty">
          <BellIcon width={40} height={40} />
          <h3>All quiet for now</h3>
          <p className="muted">When someone glows, comments on or follows you, you’ll see it here.</p>
        </div>
      )}

      {items?.length > 0 && (
        <div className="card notif-list">
          {items.map((n) => (
            <div key={n._id} className={`notif ${n.read ? '' : 'new'}`}>
              <Link to={`/u/${n.actor.username}`} aria-label={`${n.actor.username}'s profile`}>
                <Avatar user={n.actor} size={46} />
              </Link>
              <Link to={notificationLink(n)} className="notif-text">
                <span>
                  <strong>{n.actor.username}</strong> {notificationText(n)}
                </span>
                <small>{timeAgo(n.createdAt)}</small>
              </Link>
              {n.type === 'follow' ? (
                <FollowButton userId={n.actor._id} isFollowing={!!n.actor.isFollowing} small />
              ) : (
                <Link to={notificationLink(n)}>
                  <Thumb post={n.post} />
                </Link>
              )}
              <button className="icon-btn notif-x" onClick={() => remove(n._id)} aria-label="Remove notification">
                <CloseIcon width={16} height={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <button className="btn btn-ghost btn-block" onClick={more} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}