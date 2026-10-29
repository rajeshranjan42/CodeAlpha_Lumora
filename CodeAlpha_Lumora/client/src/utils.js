export function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${Math.max(m, 1)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function compact(n = 0) {
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(n);
}

/** "glowed your post", "commented: …", "started following you" */
export function notificationText(n) {
  if (n.type === 'like') return n.post?.kind === 'reel' || n.post?.video ? 'glowed your reel' : 'glowed your post';
  if (n.type === 'comment') return `commented: “${n.text}”`;
  return 'started following you';
}

/** Where a notification leads when tapped. */
export function notificationLink(n) {
  if (n.type === 'follow' || !n.post) return `/u/${n.actor.username}`;
  return n.post.kind === 'reel' || n.post.video ? `/reels/${n.post._id}` : `/post/${n.post._id}`;
}