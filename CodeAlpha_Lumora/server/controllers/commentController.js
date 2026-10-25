const Comment = require('../models/Comment');
const Post = require('../models/Post');
const { safeAuthor } = require('../utils/helpers');

const AUTHOR_FIELDS = 'name username avatar';
const format = (c) => ({ _id: c._id, text: c.text, createdAt: c.createdAt, author: safeAuthor(c.author) });

exports.list = async (req, res, next) => {
  try {
    const exists = await Post.exists({ _id: req.params.postId });
    if (!exists) return res.status(404).json({ message: 'Post not found' });
    const comments = await Comment.find({ post: req.params.postId })
      .sort({ createdAt: 1 })
      .limit(200)
      .populate('author', AUTHOR_FIELDS);
    res.json({ comments: comments.map(format) });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Comment cannot be empty' });
    if (text.length > 500) return res.status(400).json({ message: 'Comment must be 500 characters or fewer' });

    const post = await Post.findByIdAndUpdate(req.params.postId, { $inc: { commentsCount: 1 } });
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const comment = await Comment.create({ post: post._id, author: req.userId, text });
    await comment.populate('author', AUTHOR_FIELDS);
    res.status(201).json({ comment: format(comment) });
  } catch (err) {
    next(err);
  }
};

/** The comment's author or the post's author can delete a comment */
exports.remove = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const post = await Post.findById(comment.post).select('author');
    const allowed = comment.author.toString() === req.userId || post?.author.toString() === req.userId;
    if (!allowed) return res.status(403).json({ message: 'Not allowed to delete this comment' });

    await comment.deleteOne();
    if (post) await Post.updateOne({ _id: post._id, commentsCount: { $gt: 0 } }, { $inc: { commentsCount: -1 } });
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    next(err);
  }
};
