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
  images: p.images && p.images.length ? p.images : p.image ? [p.image] : [],
  video: p.video || '',
  music: p.music && p.music.url ? { id: p.music.id, title: p.music.title, artist: p.music.artist, cover: p.music.cover, url: p.music.url } : null,
  trimStart: p.trimStart || 0,
  trimEnd: p.trimEnd || 0,
  saved: (p.savedBy || []).some((id) => id.toString() === viewerId),
  kind: p.kind || 'post',
  likesCount: p.likes.length,
  liked: p.likes.some((id) => id.toString() === viewerId),
  commentsCount: p.commentsCount,
  createdAt: p.createdAt,
});

// deletes a stored file, whether it lives in server/uploads or on Cloudinary (fire and forget)
exports.removeUpload = (publicPath) => {
  require('./storage').remove(publicPath);
};

/** Validates the `music` field (JSON string) sent with a post / story / reel. Returns clean data or null. */
exports.parseMusic = (raw) => {
  if (!raw) return null;
  try {
    const m = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const url = new URL(String(m.url));
    const host = url.hostname;
    // only the music library's own servers (the browser plays this URL directly)
    if (url.protocol !== 'https:' || !(host === 'jamendo.com' || host.endsWith('.jamendo.com') || host.endsWith('.jamen.do')))
      return null;
    const cover = String(m.cover || '');
    return {
      id: String(m.id || '').slice(0, 30),
      title: String(m.title || 'Unknown').slice(0, 80),
      artist: String(m.artist || '').slice(0, 80),
      cover: /^https:\/\//.test(cover) ? cover.slice(0, 300) : '',
      url: url.toString().slice(0, 500),
    };
  } catch {
    return null;
  }
};