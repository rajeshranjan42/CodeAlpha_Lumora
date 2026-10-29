const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { format } = require('../utils/notify');

const PAGE = 20;

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const [rows, me] = await Promise.all([
      Notification.find({ recipient: req.userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE)
        .limit(PAGE + 1)
        .populate('actor', 'name username avatar')
        .populate('post', 'image images video kind'),
      User.findById(req.userId).select('following'),
    ]);
    const following = new Set(me.following.map(String));
    res.json({
      notifications: rows
        .slice(0, PAGE)
        .filter((n) => n.actor)
        .map((n) => format(n, following)),
      hasMore: rows.length > PAGE,
    });
  } catch (err) {
    next(err);
  }
};

exports.unreadCount = async (req, res, next) => {
  try {
    res.json({ count: await Notification.countDocuments({ recipient: req.userId, read: false }) });
  } catch (err) {
    next(err);
  }
};

exports.readAll = async (req, res, next) => {
  try {
    await Notification.updateMany({ recipient: req.userId, read: false }, { $set: { read: true } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    await Notification.deleteOne({ _id: req.params.id, recipient: req.userId });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

/** Old notifications are deleted after 60 days (runs with the other cleanups). */
exports.purgeOld = () =>
  Notification.deleteMany({ createdAt: { $lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } }).catch(() => {});