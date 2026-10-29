const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const { formatPost, removeUpload, parseMusic } = require('../utils/helpers');
const { notify, clear } = require('../utils/notify');
const storage = require('../utils/storage');

const PAGE_SIZE = 10;
const AUTHOR_FIELDS = 'name username avatar';

// deleted user ke posts (author === null) ko list se hata deta hai
const withAuthor = (rows) => rows.filter((p) => p && p.author);

const paginate = async (filter, req, res, size = PAGE_SIZE) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const rows = await Post.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * size)
    .limit(size + 1) // fetch one extra to know if there is another page
    .populate('author', AUTHOR_FIELDS);
  res.json({
    posts: withAuthor(rows.slice(0, size)).map((p) => formatPost(p, req.userId)),
    hasMore: rows.length > size,
  });
};

exports.createPost = async (req, res, next) => {
  const files = req.files || [];
  const cleanup = () => files.forEach((f) => removeUpload(`/uploads/${f.filename}`));
  try {
    const caption = String(req.body.caption || '').trim();
    if (!files.length && !caption) return res.status(400).json({ message: 'Add a photo or write something' });
    if (caption.length > 1000) {
      cleanup();
      return res.status(400).json({ message: 'Caption must be 1000 characters or fewer' });
    }
    const music = parseMusic(req.body.music);
    if (req.body.music && !music) {
      cleanup();
      return res.status(400).json({ message: 'That song can’t be used' });
    }
    if (music && !files.length) {
      return res.status(400).json({ message: 'Add a photo to use music' });
    }

    const images = await Promise.all(files.map((f) => storage.save(f, 'image')));
    const post = await Post.create({ author: req.userId, caption, image: images[0] || '', images, ...(music ? { music } : {}) });
    await post.populate('author', AUTHOR_FIELDS);
    res.status(201).json({ post: formatPost(post, req.userId) });
  } catch (err) {
    cleanup(); // no-op for files already moved to cloud storage
    next(err);
  }
};

/** Posts from people I follow + my own */
exports.feed = async (req, res, next) => {
  try {
    const me = await User.findById(req.userId).select('following');
    if (!me) return res.status(401).json({ message: 'User no longer exists' });
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
    const posts = await Post.find({ author: user._id, kind: { $ne: 'reel' } })
      .sort({ createdAt: -1 })
      .populate('author', AUTHOR_FIELDS);
    res.json({ posts: withAuthor(posts).map((p) => formatPost(p, req.userId)) });
  } catch (err) {
    next(err);
  }
};

exports.getPost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id).populate('author', AUTHOR_FIELDS);
    if (!post || !post.author) return res.status(404).json({ message: 'Post not found' });
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
    await clear({ post: post._id });
    (post.images && post.images.length ? post.images : [post.image]).forEach(removeUpload);
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
    const post = await Post.findById(req.params.id).select('likes author');
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const liked = post.likes.some((id) => id.toString() === req.userId);
    const updated = await Post.findByIdAndUpdate(
      req.params.id,
      { [liked ? '$pull' : '$addToSet']: { likes: req.userId } },
      { new: true }
    ).select('likes');

    if (liked) await clear({ recipient: post.author, actor: req.userId, type: 'like', post: post._id });
    else await notify(req, { to: post.author, type: 'like', post: post._id });

    res.json({ liked: !liked, likesCount: updated.likes.length });
  } catch (err) {
    next(err);
  }
};

/** Save / unsave (bookmark) toggle */
exports.toggleSave = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id).select('savedBy');
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const saved = post.savedBy.some((id) => id.toString() === req.userId);
    await Post.updateOne({ _id: post._id }, { [saved ? '$pull' : '$addToSet']: { savedBy: req.userId } });
    res.json({ saved: !saved });
  } catch (err) {
    next(err);
  }
};

/** My saved posts and reels (private) */
exports.saved = async (req, res, next) => {
  try {
    const rows = await Post.find({ savedBy: req.userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('author', AUTHOR_FIELDS);
    res.json({ posts: withAuthor(rows).map((p) => formatPost(p, req.userId)) });
  } catch (err) {
    next(err);
  }
};