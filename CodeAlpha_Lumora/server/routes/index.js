const router = require('express').Router();
const rateLimit = require('express-rate-limit');

const protect = require('../middleware/auth');
const upload = require('../middleware/upload');
const auth = require('../controllers/authController');
const users = require('../controllers/userController');
const posts = require('../controllers/postController');
const comments = require('../controllers/commentController');
const messages = require('../controllers/messageController');
const stories = require('../controllers/storyController');
const reels = require('../controllers/reelController');
const notifications = require('../controllers/notificationController');
const music = require('../controllers/musicController');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again in a few minutes' },
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many code attempts, please try again in a few minutes' },
});

// ── auth ──
router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/login', authLimiter, auth.login);
router.post('/auth/verify-email', otpLimiter, auth.verifyEmail);
router.post('/auth/resend-otp', otpLimiter, auth.resendOtp);
router.get('/auth/me', protect, auth.me);
router.put('/auth/keys', protect, auth.setKeys);

// ── users (specific paths before :username) ──
router.get('/users/suggestions', protect, users.suggestions);
router.get('/users/search', protect, users.search);
router.put('/users/me', protect, upload.single('avatar'), users.updateMe);
router.post('/users/:id/follow', protect, users.toggleFollow);
router.get('/users/:username/followers', protect, users.followers);
router.get('/users/:username/following', protect, users.following);
router.get('/users/:username', protect, users.getProfile);

// ── posts (specific paths before :id) ──
router.get('/posts/feed', protect, posts.feed);
router.get('/posts/explore', protect, posts.explore);
router.get('/posts/user/:username', protect, posts.userPosts);
router.get('/posts/saved', protect, posts.saved);
router.post('/posts', protect, upload.images.array('images', 10), posts.createPost);
router.get('/posts/:id', protect, posts.getPost);
router.delete('/posts/:id', protect, posts.deletePost);
router.post('/posts/:id/like', protect, posts.toggleLike);
router.post('/posts/:id/save', protect, posts.toggleSave);

// ── comments ──
router.get('/posts/:postId/comments', protect, comments.list);
router.post('/posts/:postId/comments', protect, comments.create);
router.delete('/comments/:id', protect, comments.remove);

// ── stories (24-hour photo / video) ──
router.post('/stories', protect, upload.media.single('media'), stories.create);
router.get('/stories/feed', protect, stories.feed);
router.post('/stories/:id/view', protect, stories.view);
router.get('/stories/:id/viewers', protect, stories.viewers);
router.delete('/stories/:id', protect, stories.remove);

// ── reels (short videos; like / comment / delete reuse the /posts/:id routes) ──
router.get('/reels', protect, reels.list);
router.get('/reels/user/:username', protect, reels.userReels);
router.post('/reels', protect, upload.video.single('video'), reels.create);

// ── messages (direct messaging) ──
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "You're sending messages too fast, slow down a little" },
});
router.post('/messages/media', protect, messageLimiter, upload.chat.single('file'), messages.uploadMedia);
router.get('/messages/unread-count', protect, messages.unreadCount);
router.get('/messages/conversations', protect, messages.listConversations);
router.post('/messages/conversations', protect, messages.openConversation);
router.get('/messages/conversations/:id/messages', protect, messages.getMessages);
router.post('/messages/conversations/:id/messages', protect, messageLimiter, messages.sendMessage);
router.post('/messages/conversations/:id/seen', protect, messages.markSeen);
router.delete('/messages/:id', protect, messages.deleteMessage);

// ── notifications ──
router.get('/notifications', protect, notifications.list);
router.get('/notifications/unread-count', protect, notifications.unreadCount);
router.post('/notifications/read', protect, notifications.readAll);
router.delete('/notifications/:id', protect, notifications.remove);

// ── music library (Jamendo) ──
router.get('/music', protect, rateLimit({ windowMs: 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { message: 'Slow down a little' } }), music.search);

module.exports = router;