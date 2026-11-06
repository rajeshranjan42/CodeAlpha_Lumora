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
    const link = String(m.url);
    let urlText;
    if (link.startsWith('/uploads/')) {
      // a song uploaded to this app (local disk mode)
      if (!require('./storage').isMusicUpload(link)) return null;
      urlText = link;
    } else {
      const url = new URL(link);
      const host = url.hostname;
      // only trusted music sources: Jamendo (free music), Apple's iTunes previews (Hindi / Bollywood), or our own uploads
      const jamendo = host === 'jamendo.com' || host.endsWith('.jamendo.com') || host.endsWith('.jamen.do');
      const apple = host.endsWith('.mzstatic.com') || host.endsWith('.itunes.apple.com') || host === 'itunes.apple.com';
      const spotify = url.protocol === 'https:' && host === 'open.spotify.com' && /^\/track\/[A-Za-z0-9]{22}$/.test(url.pathname) && !url.search;
      const mine = url.protocol === 'https:' && require('./storage').isMusicUpload(url.toString());
      if (url.protocol !== 'https:' || !(jamendo || apple || spotify || mine)) return null;
      urlText = url.toString();
    }
    const cover = String(m.cover || '');
    return {
      id: String(m.id || '').slice(0, 30),
      title: String(m.title || 'Unknown').slice(0, 80),
      artist: String(m.artist || '').slice(0, 80),
      cover: /^https:\/\//.test(cover) ? cover.slice(0, 300) : '',
      url: urlText.slice(0, 500),
    };
  } catch {
    return null;
  }
};