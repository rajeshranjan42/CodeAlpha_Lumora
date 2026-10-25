const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const { formatPost, removeUpload } = require('../utils/helpers');

const PAGE_SIZE = 10;
const AUTHOR_FIELDS = 'name username avatar';

const paginate = async (filter, req, res, size = PAGE_SIZE) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const rows = await Post.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * size)
    .limit(size + 1) // fetch one extra to know if there is another page
    .populate('author', AUTHOR_FIELDS);
  res.json({
    posts: rows.slice(0, size).map((p) => formatPost(p, req.userId)),
    hasMore: rows.length > size,
  });
};

exports.createPost = async (req, res, next) => {
  try {
    const caption = String(req.body.caption || '').trim();
    if (!req.file && !caption) return res.status(400).json({ message: 'Add a photo or write something' });
    if (caption.length > 1000) {
      if (req.file) removeUpload(`/uploads/${req.file.filename}`);
      return res.status(400).json({ message: 'Caption must be 1000 characters or fewer' });
    }

    const post = await Post.create({
      author: req.userId,
      caption,
      image: req.file ? `/uploads/${req.file.filename}` : '',
    });
    await post.populate('author', AUTHOR_FIELDS);
    res.status(201).json({ post: formatPost(post, req.userId) });
  } catch (err) {
    next(err);
  }
};

/** Posts from people I follow + my own */
exports.feed = async (req, res, next) => {
  try {
    const me = await User.findById(req.userId).select('following');
    await paginate({ author: { $in: [...me.following, me._id] } }, req, res); // includes reels
  } catch (err) {
    next(err);
  }
};

exports.explore = async (req, res, next) => {
  try {
    await paginate({}, req, res, 24); // includes reels
  } catch (err) {
    next(err);
  }
};

exports.userPosts = async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() }).select('_id');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const posts = await Post.find({ author: user._id, kind: { $ne: 'reel' } }).sort({ createdAt: -1 }).populate('author', AUTHOR_FIELDS);
    res.json({ posts: posts.map((p) => formatPost(p, req.userId)) });
  } catch (err) {
    next(err);
  }
};

exports.getPost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id).populate('author', AUTHOR_FIELDS);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    res.json({ post: formatPost(post, req.userId) });
  } catch (err) {
    next(err);
  }
};

exports.deletePost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.author.toString() !== req.userId)
      return res.status(403).json({ message: 'You can only delete your own posts' });

    await Comment.deleteMany({ post: post._id });
    removeUpload(post.image);
    removeUpload(post.video);
    await post.deleteOne();
    res.json({ message: 'Post deleted' });
  } catch (err) {
    next(err);
  }
};

/** Like ("Glow") toggle */
exports.toggleLike = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id).select('likes');
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const liked = post.likes.some((id) => id.toString() === req.userId);
    const updated = await Post.findByIdAndUpdate(
      req.params.id,
      { [liked ? '$pull' : '$addToSet']: { likes: req.userId } },
      { new: true }
    ).select('likes');

    res.json({ liked: !liked, likesCount: updated.likes.length });
  } catch (err) {
    next(err);
  }
};