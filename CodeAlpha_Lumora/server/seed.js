/* Creates demo accounts, posts, comments, follows and glows.
   Run:  npm run seed   (safe to re-run: it replaces only the @lumora.demo accounts) */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');

const User = require('./models/User');
const Post = require('./models/Post');
const Comment = require('./models/Comment');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');

const PASSWORD = 'Lumora@123';

const people = [
  { name: 'Aarav Sharma', username: 'aarav', email: 'aarav@lumora.demo', bio: 'Full-stack dev · chai powered ☕' },
  { name: 'Meera Iyer', username: 'meera', email: 'meera@lumora.demo', bio: 'Designer. Collector of golden hours.' },
  { name: 'Kabir Singh', username: 'kabir', email: 'kabir@lumora.demo', bio: 'Photographer · mountains · slow mornings' },
  { name: 'Ananya Rao', username: 'ananya', email: 'ananya@lumora.demo', bio: 'Reading, writing, wandering.' },
];

const posts = [
  ['aarav', 'Shipped my first MERN project today. Small steps, big glow ✨'],
  ['meera', 'Good design feels like warm light in a quiet room.'],
  ['kabir', 'Woke up before sunrise. The mountains were worth every yawn.'],
  ['ananya', 'A page a day keeps the noise away.'],
  ['aarav', 'Debugging tip: explain the bug out loud. It confesses itself.'],
  ['meera', 'Sketching a new palette: amber, rose, violet. Dawn, basically.'],
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME || 'main' });

  const old = await User.find({ email: /@lumora\.demo$/ }).select('_id');
  const oldIds = old.map((u) => u._id);
  const oldPosts = await Post.find({ author: { $in: oldIds } }).select('_id');
  await Comment.deleteMany({ $or: [{ author: { $in: oldIds } }, { post: { $in: oldPosts.map((p) => p._id) } }] });
  const oldConvos = await Conversation.find({ participants: { $in: oldIds } }).select('_id');
  await Message.deleteMany({ conversation: { $in: oldConvos.map((c) => c._id) } });
  await Conversation.deleteMany({ _id: { $in: oldConvos.map((c) => c._id) } });
  await Post.deleteMany({ author: { $in: oldIds } });
  await User.deleteMany({ _id: { $in: oldIds } });

  const users = {};
  for (const p of people) users[p.username] = await User.create({ ...p, password: PASSWORD });

  const names = Object.keys(users);
  for (const a of names) {
    for (const b of names) {
      if (a === b) continue;
      await User.updateOne({ _id: users[a]._id }, { $addToSet: { following: users[b]._id } });
      await User.updateOne({ _id: users[b]._id }, { $addToSet: { followers: users[a]._id } });
    }
  }

  const created = [];
  for (const [who, caption] of posts) {
    const likes = names.filter((n) => n !== who).map((n) => users[n]._id);
    created.push(await Post.create({ author: users[who]._id, caption, likes }));
  }

  const replies = ['Love this!', 'So true 🌅', 'Needed this today.', 'Beautiful.'];
  for (const [i, post] of created.entries()) {
    const commenter = users[names[(i + 1) % names.length]];
    await Comment.create({ post: post._id, author: commenter._id, text: replies[i % replies.length] });
    await Post.updateOne({ _id: post._id }, { $inc: { commentsCount: 1 } });
  }

  // note: demo chats are intentionally not seeded; messages are end-to-end encrypted in the browser.

  console.log('✦ Seeded demo data. Log in with any of:');
  for (const p of people) console.log(`   ${p.email}  /  ${PASSWORD}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});