const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const storage = require('../utils/storage');
const { safeAuthor, removeUpload } = require('../utils/helpers');

const AUTHOR_FIELDS = 'name username avatar';
const PEER_FIELDS = 'name username avatar publicKey';
// peers expose their PUBLIC key so the browser can derive the shared secret
const peerOf = (u) => ({ ...safeAuthor(u), publicKey: u.publicKey || '' });
const PAGE = 40;

const pairKey = (a, b) => [a.toString(), b.toString()].sort().join('_');
const otherOf = (convo, me) => convo.participants.find((p) => (p._id || p).toString() !== me);
const idOf = (p) => (p._id || p).toString();

const formatMessage = (m) => ({
  _id: m._id,
  conversation: m.conversation.toString(),
  sender: m.sender.toString(),
  text: m.text, // ciphertext (base64) for encrypted messages
  iv: m.iv || '',
  encrypted: !!m.encrypted,
  attachment: m.attachment || '',
  seen: m.seen,
  createdAt: m.createdAt,
});

// a message may only point at an encrypted blob that this user uploaded themselves
const ownAttachment = (att, userId) => storage.ownsChatFile(att, userId);

const emitTo = (req, userId, event, payload) => {
  const io = req.app.get('io');
  if (io) io.to(`user:${userId}`).emit(event, payload);
};

/** Load a conversation only if the requester is a participant */
const loadConvo = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) return null;
  const convo = await Conversation.findById(id);
  if (!convo || !convo.participants.some((p) => p.toString() === userId)) return null;
  return convo;
};

/** Inbox: conversations that have at least one message, newest first */
exports.listConversations = async (req, res, next) => {
  try {
    const convos = await Conversation.find({
      participants: req.userId,
      'lastMessage.createdAt': { $exists: true },
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .populate('participants', PEER_FIELDS);

    const unread = await Message.aggregate([
      {
        $match: {
          conversation: { $in: convos.map((c) => c._id) },
          sender: { $ne: new mongoose.Types.ObjectId(req.userId) },
          seen: false,
        },
      },
      { $group: { _id: '$conversation', n: { $sum: 1 } } },
    ]);
    const unreadMap = new Map(unread.map((u) => [u._id.toString(), u.n]));

    res.json({
      conversations: convos.map((c) => {
        const other = otherOf(c, req.userId);
        return {
          _id: c._id,
          user: other ? peerOf(other) : null,
          lastMessage: {
            text: c.lastMessage.text,
            iv: c.lastMessage.iv || '',
            encrypted: !!c.lastMessage.encrypted,
            mine: c.lastMessage.sender?.toString() === req.userId,
            createdAt: c.lastMessage.createdAt,
          },
          unread: unreadMap.get(c._id.toString()) || 0,
          updatedAt: c.updatedAt,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
};

/** Find or create the 1-to-1 conversation with another user */
exports.openConversation = async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid user' });
    if (userId === req.userId) return res.status(400).json({ message: "You can't message yourself" });

    const other = await User.findById(userId).select(PEER_FIELDS);
    if (!other) return res.status(404).json({ message: 'User not found' });

    const convo = await Conversation.findOneAndUpdate(
      { pairKey: pairKey(req.userId, userId) },
      { $setOnInsert: { participants: [req.userId, userId], pairKey: pairKey(req.userId, userId) } },
      { upsert: true, new: true }
    );
    res.json({ conversation: { _id: convo._id, user: peerOf(other) } });
  } catch (err) {
    next(err);
  }
};

exports.getMessages = async (req, res, next) => {
  try {
    const convo = await loadConvo(req.params.id, req.userId);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });

    const filter = { conversation: convo._id };
    if (req.query.before) {
      const d = new Date(req.query.before);
      if (!Number.isNaN(d.getTime())) filter.createdAt = { $lt: d };
    }
    const rows = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(PAGE + 1);
    const messages = rows.slice(0, PAGE).reverse().map(formatMessage);

    const otherId = idOf(otherOf(convo, req.userId));
    const marked = await Message.updateMany(
      { conversation: convo._id, sender: otherId, seen: false },
      { $set: { seen: true } }
    );
    if (marked.modifiedCount > 0) emitTo(req, otherId, 'messages:seen', { conversation: convo._id.toString() });

    const other = await User.findById(otherId).select(PEER_FIELDS);
    res.json({ messages, hasMore: rows.length > PAGE, user: other ? peerOf(other) : null });
  } catch (err) {
    next(err);
  }
};

exports.markSeen = async (req, res, next) => {
  try {
    const convo = await loadConvo(req.params.id, req.userId);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });
    const otherId = idOf(otherOf(convo, req.userId));
    const marked = await Message.updateMany(
      { conversation: convo._id, sender: otherId, seen: false },
      { $set: { seen: true } }
    );
    if (marked.modifiedCount > 0) emitTo(req, otherId, 'messages:seen', { conversation: convo._id.toString() });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

exports.sendMessage = async (req, res, next) => {
  try {
    // The server never sees plaintext: `text` is base64 AES-GCM ciphertext, `iv` the 12-byte nonce.
    const text = String(req.body.text || '').trim();
    const iv = String(req.body.iv || '');
    if (!iv) return res.status(400).json({ message: 'Messages must be end-to-end encrypted' });
    if (!/^[A-Za-z0-9+/=]{16}$/.test(iv)) return res.status(400).json({ message: 'Invalid message' });
    if (!text || text.length > 4000 || !/^[A-Za-z0-9+/=]+$/.test(text))
      return res.status(400).json({ message: 'Invalid message' });

    const attachment = String(req.body.attachment || '');
    if (attachment && !ownAttachment(attachment, req.userId)) return res.status(400).json({ message: 'Invalid attachment' });

    const convo = await loadConvo(req.params.id, req.userId);
    if (!convo) return res.status(404).json({ message: 'Conversation not found' });

    const message = await Message.create({ conversation: convo._id, sender: req.userId, text, iv, encrypted: true, attachment });
    convo.lastMessage = { text, iv, encrypted: true, sender: req.userId, createdAt: message.createdAt };
    await convo.save();

    const payload = { conversation: convo._id.toString(), message: formatMessage(message) };
    emitTo(req, idOf(otherOf(convo, req.userId)), 'message:new', payload);
    emitTo(req, req.userId, 'message:new', payload); // keeps my other tabs in sync

    res.status(201).json({ message: payload.message });
  } catch (err) {
    next(err);
  }
};

/** Unsend: only the sender can delete their message */
exports.deleteMessage = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const message = await Message.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.sender.toString() !== req.userId)
      return res.status(403).json({ message: 'You can only unsend your own messages' });

    const convo = await Conversation.findById(message.conversation);
    await message.deleteOne();
    removeUpload(message.attachment);

    if (convo) {
      const last = await Message.findOne({ conversation: convo._id }).sort({ createdAt: -1 });
      if (last)
        convo.lastMessage = {
          text: last.text,
          iv: last.iv,
          encrypted: last.encrypted,
          sender: last.sender,
          createdAt: last.createdAt,
        };
      else convo.lastMessage = undefined;
      await convo.save();

      const payload = { conversation: convo._id.toString(), messageId: message._id.toString() };
      convo.participants.forEach((p) => emitTo(req, p.toString(), 'message:deleted', payload));
    }
    res.json({ message: 'Message unsent' });
  } catch (err) {
    next(err);
  }
};

exports.unreadCount = async (req, res, next) => {
  try {
    const ids = await Conversation.find({ participants: req.userId }).distinct('_id');
    const count = await Message.countDocuments({
      conversation: { $in: ids },
      sender: { $ne: req.userId },
      seen: false,
    });
    res.json({ count });
  } catch (err) {
    next(err);
  }
};

/** Uploads an already-encrypted photo/video blob. The server cannot see what is inside it. */
exports.uploadMedia = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file received' });
    res.status(201).json({ url: await storage.save(req.file, 'raw') });
  } catch (err) {
    if (req.file) removeUpload(`/uploads/${req.file.filename}`);
    next(err);
  }
};