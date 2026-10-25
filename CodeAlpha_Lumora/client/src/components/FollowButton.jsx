import { useState } from 'react';
import { api } from '../api.js';

export default function FollowButton({ userId, isFollowing, onChange, small = false }) {
  const [following, setFollowing] = useState(isFollowing);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const prev = following;
    setFollowing(!prev); // optimistic
    try {
      const res = await api.toggleFollow(userId);
      setFollowing(res.following);
      onChange?.(res);
      window.dispatchEvent(new CustomEvent('lumora:follow-changed')); // refresh counters elsewhere
    } catch {
      setFollowing(prev);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      className={`btn ${following ? 'btn-ghost' : 'btn-primary'} ${small ? 'btn-sm' : ''}`}
      onClick={toggle}
      disabled={busy}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}