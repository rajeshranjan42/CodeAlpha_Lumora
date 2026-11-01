const Notification = require('../models/Notification');
const { safeAuthor } = require('./helpers');
const push = require('./push');

const ACTOR_FIELDS = 'name username avatar';
const POST_FIELDS = 'image images video kind';

exports.format = (n, followingSet) => ({
  _id: n._id,
  type: n.type,
  text: n.text,
  read: n.read,
  createdAt: n.createdAt,
  actor: n.actor ? { ...safeAuthor(n.actor), isFollowing: followingSet ? followingSet.has(String(n.actor._id)) : undefined } : null,
  post: n.post
    ? {
        _id: n.post._id,
        kind: n.post.kind || 'post',
        thumb: n.post.images?.[0] || n.post.image || '',
        video: n.post.video || '',
      }
    : null,
});

/** What a phone / desktop notification should say and where tapping it goes. */
exports.pushPayload = (n) => {
  const who = n.actor?.username || 'Someone';
  const isReel = n.post && (n.post.kind === 'reel' || n.post.video);
  const body =
    n.type === 'like' ? (isReel ? 'glowed your reel' : 'glowed your post')
    : n.type === 'comment' ? `commented: “${String(n.text || '').slice(0, 80)}”`
    : 'started following you';
  const url = n.type === 'follow' || !n.post ? `/u/${who}` : isReel ? `/reels/${n.post._id}` : `/post/${n.post._id}`;
  return { title: 'Lumora', body: `${who} ${body}`, url, tag: `n-${n._id}` };
};

/** Creates (or refreshes) a notification and pushes it live to the recipient. Never throws. */
exports.notify = async (req, { to, type, post = null, text = '' }) => {
  try {
    const recipient = String(to);
    if (!recipient || recipient === req.userId) return; // never notify yourself
    let n;
    if (type === 'comment') {
      n = await Notification.create({ recipient, actor: req.userId, type, post, text });
    } else {
      // likes / follows: one notification per person, bumped back to the top if repeated
      n = await Notification.findOneAndUpdate(
        { recipient, actor: req.userId, type, post },
        { $set: { read: false, createdAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    await n.populate([
      { path: 'actor', select: ACTOR_FIELDS },
      { path: 'post', select: POST_FIELDS },
    ]);
    const io = req.app.get('io');
    if (io) io.to(`user:${recipient}`).emit('notification:new', exports.format(n));
    push.sendTo(recipient, exports.pushPayload(n)); // real device (works when the app is closed)
  } catch (err) {
    console.error('notify failed:', err.message);
  }
};

/** Removes notifications (e.g. after an unlike / unfollow / deleted post). Never throws. */
exports.clear = (filter) => Notification.deleteMany(filter).catch(() => {});