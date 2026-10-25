import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';
import { PlusIcon } from './Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';

/** Horizontal "Your circle" strip: the people you follow, with online dots. */
export default function CircleRow() {
  const { user } = useAuth();
  const { online } = useSocket();
  const [people, setPeople] = useState([]);

  useEffect(() => {
    api
      .following(user.username)
      .then((d) => setPeople(d.users))
      .catch(() => {});
  }, [user.username]);

  return (
    <div className="circle" aria-label="Your circle">
      <button className="circle-item" onClick={() => window.dispatchEvent(new CustomEvent('lumora:open-create'))}>
        <span className="circle-add">
          <PlusIcon width={26} height={26} />
        </span>
        <span className="circle-name">New glow</span>
      </button>
      {people.map((p) => (
        <Link key={p._id} to={`/u/${p.username}`} className="circle-item">
          <span className="presence-wrap">
            <Avatar user={p} size={58} ring />
            {online.has(p._id) && <i className="presence-dot" />}
          </span>
          <span className="circle-name">{p.username}</span>
        </Link>
      ))}
    </div>
  );
}