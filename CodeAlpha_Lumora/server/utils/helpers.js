const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

exports.signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

exports.escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.safeAuthor = (u) => ({ _id: u._id, name: u.name, username: u.username, avatar: u.avatar });

/** Shape a user for the client. `viewerId` decides isMe / isFollowing. */
exports.formatUser = (u, viewerId, extra = {}) => ({
  _id: u._id,
  name: u.name,
  username: u.username,
  avatar: u.avatar,
  bio: u.bio,
  followersCount: u.followers.length,
  followingCount: u.following.length,
  isMe: viewerId ? u._id.toString() === viewerId : false,
  isFollowing: viewerId ? u.followers.some((id) => id.toString() === viewerId) : false,
  ...extra,
});

/** Shape a (populated) post for the client. */
exports.formatPost = (p, viewerId) => ({
  _id: p._id,
  author: exports.safeAuthor(p.author),
  caption: p.caption,
  image: p.image,
  video: p.video || '',
  kind: p.kind || 'post',
  likesCount: p.likes.length,
  liked: p.likes.some((id) => id.toString() === viewerId),
  commentsCount: p.commentsCount,
  createdAt: p.createdAt,
});

exports.removeUpload = (publicPath) => {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return;
  const file = path.join(__dirname, '..', 'uploads', path.basename(publicPath));
  fs.unlink(file, () => {});
};