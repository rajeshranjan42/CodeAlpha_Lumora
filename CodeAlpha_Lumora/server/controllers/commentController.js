const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const Post = require('../models/Post');
const User = require('../models/User');
const { safeAuthor } = require('../utils/helpers');
const { notify } = require('../utils/notify');

const AUTHOR_FIELDS = 'name username avatar';
const format = (c) => ({ _id: c._id, text: c.text, createdAt: c.createdAt, author: safeAuthor(c.author) });

exports.list = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) return res.status(400).json({ message: 'Invalid id' });
    const exists = await Post.exists({ _id: req.params.postId });
    if (!exists) return res.status(404).json({ message: 'Post not found' });

    const comments = await Comment.find({ post: req.params.postId })
      .sort({ createdAt: 1 })
      .limit(200)
      .populate('author', AUTHOR_FIELDS);

    // deleted user ke comments (author === null) skip
    res.json({ comments: comments.filter((c) => c.author).map(format) });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.postId)) return res.status(400).json({ message: 'Invalid id' });

    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Comment cannot be empty' });
    if (text.length > 500) return res.status(400).json({ message: 'Comment must be 500 characters or fewer' });

    const post = await Post.findById(req.params.postId).select('author');
    if (!post) return res.status(404).json({ message: 'Post not found' });

    // post ka author delete ho chuka ho to comment allow nahi
    const authorExists = await User.exists({ _id: post.author });
    if (!authorExists) return res.status(404).json({ message: 'Post not found' });

    const comment = await Comment.create({ post: post._id, author: req.userId, text });
    await Post.updateOne({ _id: post._id }, { $inc: { commentsCount: 1 } });

    await comment.populate('author', AUTHOR_FIELDS);
    await notify(req, { to: post.author, type: 'comment', post: post._id, text: text.slice(0, 100) });
    res.status(201).json({ comment: format(comment) });
  } catch (err) {
    next(err);
  }
};

/** The comment's author or the post's author can delete a comment */
exports.remove = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });

    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const post = await Post.findById(comment.post).select('author');
    const allowed = comment.author?.toString() === req.userId || post?.author?.toString() === req.userId;
    if (!allowed) return res.status(403).json({ message: 'Not allowed to delete this comment' });

    await comment.deleteOne();
    if (post) await Post.updateOne({ _id: post._id, commentsCount: { $gt: 0 } }, { $inc: { commentsCount: -1 } });
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    next(err);
  }
};
