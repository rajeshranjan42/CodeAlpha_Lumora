const mongoose = require('mongoose');
const Story = require('../models/Story');
const User = require('../models/User');
const { safeAuthor, removeUpload, parseMusic } = require('../utils/helpers');
const { checkVideo, LIMITS } = require('../utils/videoDuration');
const storage = require('../utils/storage');

const DAY = 24 * 60 * 60 * 1000;
const AUTHOR_FIELDS = 'name username avatar';

const authorId = (s) => String(s.author._id || s.author);

const format = (s, me) => {
  const mine = authorId(s) === me;
  return {
    _id: s._id,
    media: s.media,
    mediaType: s.mediaType,
    caption: s.caption,
    music: s.music && s.music.url ? { id: s.music.id, title: s.music.title, artist: s.music.artist, cover: s.music.cover, url: s.music.url } : null,
    trimStart: s.trimStart || 0,
    trimEnd: s.trimEnd || 0,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    seen: mine || s.viewers.some((v) => v.toString() === me),
    viewersCount: mine ? s.viewers.length : undefined,
  };
};

exports.create = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose a photo or video for your story' });
    const caption = String(req.body.caption || '').trim();
    if (caption.length > 200) {
      removeUpload(`/uploads/${req.file.filename}`);
      return res.status(400).json({ message: 'Caption must be 200 characters or fewer' });
    }
    const isVideo = req.file.mimetype.startsWith('video/');
    // videos: limited by length (45 s) but can be trimmed from a longer clip. photos keep a 10 MB size limit.
    let trim = { trimStart: 0, trimEnd: 0 };
    let problem = null;
    if (isVideo) {
      const check = await checkVideo(req.file, req.body, LIMITS.STORY_SECONDS, 'Stories');
      if (check.error) problem = check.error;
      else trim = check;
    } else if (req.file.size > 10 * 1024 * 1024) problem = 'Photos for stories must be under 10 MB';
    const music = parseMusic(req.body.music);
    if (!problem && req.body.music && !music) problem = 'That song can’t be used';
    if (problem) {
      removeUpload(`/uploads/${req.file.filename}`);
      return res.status(400).json({ message: problem });
    }
    const story = await Story.create({
      author: req.userId,
      media: await storage.save(req.file, isVideo ? 'video' : 'image'),
      mediaType: isVideo ? 'video' : 'image',
      caption,
      ...trim,
      ...(music ? { music } : {}),
      expiresAt: new Date(Date.now() + DAY),
    });
    res.status(201).json({ story: format(story, req.userId) });
  } catch (err) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    next(err);
  }
};

/** Active stories from me + people I follow, grouped by person */
exports.feed = async (req, res, next) => {
  try {
    const me = await User.findById(req.userId).select('following');
    const stories = await Story.find({
      author: { $in: [me._id, ...me.following] },
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: 1 })
      .populate('author', AUTHOR_FIELDS);

    const map = new Map();
    for (const s of stories) {
      if (!s.author) continue;
      const id = authorId(s);
      if (!map.has(id)) map.set(id, { user: safeAuthor(s.author), isMe: id === req.userId, stories: [] });
      map.get(id).stories.push(format(s, req.userId));
    }

    const groups = [...map.values()].map((g) => ({
      ...g,
      allSeen: g.stories.every((s) => s.seen),
      latest: g.stories[g.stories.length - 1].createdAt,
    }));
    groups.sort((a, b) => {
      if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
      if (a.allSeen !== b.allSeen) return a.allSeen ? 1 : -1;
      return new Date(b.latest) - new Date(a.latest);
    });

    res.json({ groups });
  } catch (err) {
    next(err);
  }
};

exports.view = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const story = await Story.findById(req.params.id);
    if (!story || story.expiresAt <= new Date()) return res.status(404).json({ message: 'Story not found' });
    if (story.author.toString() !== req.userId) {
      await Story.updateOne({ _id: story._id }, { $addToSet: { viewers: req.userId } });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

/** Only the owner can see who viewed a story */
exports.viewers = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const story = await Story.findById(req.params.id).populate('viewers', AUTHOR_FIELDS);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    if (story.author.toString() !== req.userId)
      return res.status(403).json({ message: 'Only the owner can see who viewed this story' });
    res.json({ users: story.viewers.map(safeAuthor) });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ message: 'Story not found' });
    if (story.author.toString() !== req.userId)
      return res.status(403).json({ message: 'You can only delete your own stories' });
    removeUpload(story.media);
    await story.deleteOne();
    res.json({ message: 'Story deleted' });
  } catch (err) {
    next(err);
  }
};

/** Deletes expired stories and their files. Runs on boot and every 10 minutes. */
exports.purgeExpired = async () => {
  try {
    const expired = await Story.find({ expiresAt: { $lte: new Date() } }).select('media');
    if (!expired.length) return;
    expired.forEach((s) => removeUpload(s.media));
    await Story.deleteMany({ _id: { $in: expired.map((s) => s._id) } });
    console.log(`✦ Removed ${expired.length} expired stor${expired.length === 1 ? 'y' : 'ies'}`);
  } catch (err) {
    console.error('Story cleanup failed:', err.message);
  }
};