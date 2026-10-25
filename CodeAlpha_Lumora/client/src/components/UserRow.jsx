import { Link } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import FollowButton from './FollowButton.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function UserRow({ person, onNavigate }) {
  const { user } = useAuth();
  const isMe = user?._id === person._id;
  return (
    <div className="user-row">
      <Link to={`/u/${person.username}`} className="user-row-link" onClick={onNavigate}>
        <Avatar user={person} size={42} />
        <div className="user-row-text">
          <strong>{person.username}</strong>
          <span>{person.name}</span>
        </div>
      </Link>
      {!isMe && (
        <FollowButton userId={person._id} isFollowing={!!person.isFollowing} small />
      )}
    </div>
  );
}
