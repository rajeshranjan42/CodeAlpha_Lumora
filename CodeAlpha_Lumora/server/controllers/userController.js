const User = require('../models/User');
const Post = require('../models/Post');
const { formatUser, escapeRegex, removeUpload } = require('../utils/helpers');
const storage = require('../utils/storage');
const { notify, clear } = require('../utils/notify');

exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const postsCount = await Post.countDocuments({ author: user._id });
    res.json({ user: formatUser(user, req.userId, { postsCount }) });
  } catch (err) {
    next(err);
  }
};

exports.updateMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    const name = req.body.name !== undefined ? String(req.body.name).trim() : user.name;
    const bio = req.body.bio !== undefined ? String(req.body.bio).trim() : user.bio;

    if (!name || name.length > 50) {
      if (req.file) removeUpload(`/uploads/${req.file.filename}`);
      return res.status(400).json({ message: 'Name is required (max 50 characters)' });
    }
    if (bio.length > 160) {
      if (req.file) removeUpload(`/uploads/${req.file.filename}`);
      return res.status(400).json({ message: 'Bio must be 160 characters or fewer' });
    }

    user.name = name;
    user.bio = bio;
    if (req.file) {
      removeUpload(user.avatar);
      user.avatar = await storage.save(req.file, 'image');
    }
    await user.save();
    res.json({ user: formatUser(user, req.userId) });
  } catch (err) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    next(err);
  }
};

/** Follow / unfollow toggle */
exports.toggleFollow = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.userId) return res.status(400).json({ message: "You can't follow yourself" });

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ message: 'User not found' });

    const already = target.followers.some((id) => id.toString() === req.userId);
    const op = already ? '$pull' : '$addToSet';

    const updated = await User.findByIdAndUpdate(targetId, { [op]: { followers: req.userId } }, { new: true });
    await User.findByIdAndUpdate(req.userId, { [op]: { following: targetId } });

    if (already) await clear({ recipient: targetId, actor: req.userId, type: 'follow' });
    else await notify(req, { to: targetId, type: 'follow' });

    res.json({ following: !already, followersCount: updated.followers.length });
  } catch (err) {
    next(err);
  }
};

exports.suggestions = async (req, res, next) => {
  try {
    const me = await User.findById(req.userId).select('following');
    const pool = await User.find({ _id: { $nin: [...me.following, me._id] } }).limit(30);
    const top = pool.sort((a, b) => b.followers.length - a.followers.length).slice(0, 5);
    res.json({ users: top.map((u) => formatUser(u, req.userId)) });
  } catch (err) {
    next(err);
  }
};

exports.search = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 40);
    if (!q) return res.json({ users: [] });
    const rx = new RegExp(escapeRegex(q), 'i');
    const users = await User.find({ $or: [{ username: rx }, { name: rx }] }).limit(20);
    res.json({ users: users.map((u) => formatUser(u, req.userId)) });
  } catch (err) {
    next(err);
  }
};

const listRelation = (field) => async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() }).populate(field);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ users: user[field].map((u) => formatUser(u, req.userId)) });
  } catch (err) {
    next(err);
  }
};
exports.followers = listRelation('followers');
exports.following = listRelation('following');