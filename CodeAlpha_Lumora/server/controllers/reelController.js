const Post = require('../models/Post');
const User = require('../models/User');
const { formatPost, removeUpload, parseMusic } = require('../utils/helpers');
const { checkVideo, LIMITS } = require('../utils/videoDuration');
const storage = require('../utils/storage');

/*
 * A reel is a Post with kind = 'reel' and a video file.
 * That means likes, comments and delete reuse the existing /posts/:id/... endpoints.
 */
const PAGE_SIZE = 6;
const AUTHOR_FIELDS = 'name username avatar';

const withFollow = (rows, followingSet, me) =>
  rows.map((p) => {
    const f = formatPost(p, me);
    f.isFollowing = followingSet.has(p.author._id.toString());
    f.isMine = p.author._id.toString() === me;
    return f;
  });

exports.create = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose a video for your reel' });
    const caption = String(req.body.caption || '').trim();
    if (caption.length > 1000) {
      removeUpload(`/uploads/${req.file.filename}`);
      return res.status(400).json({ message: 'Caption must be 1000 characters or fewer' });
    }
    // reels are limited by length (1 min 30 s), not by file size; a longer video can be trimmed to a window
    const check = await checkVideo(req.file, req.body, LIMITS.REEL_SECONDS, 'Reels');
    const music = parseMusic(req.body.music);
    if (check.error || (req.body.music && !music)) {
      removeUpload(`/uploads/${req.file.filename}`);
      return res.status(400).json({ message: check.error || 'That song can’t be used' });
    }
    const reel = await Post.create({
      author: req.userId,
      caption,
      video: await storage.save(req.file, 'video'),
      kind: 'reel',
      trimStart: check.trimStart,
      trimEnd: check.trimEnd,
      ...(music ? { music } : {}),
    });
    await reel.populate('author', AUTHOR_FIELDS);
    res.status(201).json({ reel: formatPost(reel, req.userId) });
  } catch (err) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    next(err);
  }
};

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const me = await User.findById(req.userId).select('following');
    const rows = await Post.find({ kind: 'reel' })
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE + 1)
      .populate('author', AUTHOR_FIELDS);
    const following = new Set(me.following.map(String));
    res.json({
      reels: withFollow(rows.slice(0, PAGE_SIZE), following, req.userId),
      hasMore: rows.length > PAGE_SIZE,
    });
  } catch (err) {
    next(err);
  }
};

exports.userReels = async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() }).select('_id');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const rows = await Post.find({ author: user._id, kind: 'reel' })
      .sort({ createdAt: -1 })
      .populate('author', AUTHOR_FIELDS);
    res.json({ reels: rows.map((p) => formatPost(p, req.userId)) });
  } catch (err) {
    next(err);
  }
};