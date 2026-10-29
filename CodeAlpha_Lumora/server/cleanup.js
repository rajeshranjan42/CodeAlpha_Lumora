require('dotenv').config();
const mongoose = require('mongoose');

const User = require('./models/User');
const Post = require('./models/Post');
const Comment = require('./models/Comment');
const Story = require('./models/Story');
const Notification = require('./models/Notification');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');

const DRY = process.argv.includes('--dry');
const URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

// filter ke hisaab se: dry run mein sirf count, warna delete
const remove = async (label, Model, filter) => {
  const n = DRY ? await Model.countDocuments(filter) : (await Model.deleteMany(filter)).deletedCount;
  console.log(`${DRY ? '[dry] would delete' : 'deleted'} ${label}: ${n}`);
};

// arrays se deleted users ki ids hatao
const pull = async (label, Model, pullSpec) => {
  const filter = { $or: Object.keys(pullSpec).map((f) => ({ [f]: pullSpec[f] })) };
  const n = DRY ? await Model.countDocuments(filter) : (await Model.updateMany({}, { $pull: pullSpec })).modifiedCount;
  console.log(`${DRY ? '[dry] would clean' : 'cleaned'} ${label}: ${n}`);
};

(async () => {
  if (!URI) {
    console.error('DB connection string nahi mili. .env mein MONGODB_URI (ya MONGO_URI) set karo.');
    process.exit(1);
  }

  await mongoose.connect(URI);
  console.log(`Connected to: ${mongoose.connection.name}  ${DRY ? '(DRY RUN)' : ''}`);

  const ids = (await User.find().select('_id')).map((u) => u._id);

  // safety: users collection khali ho (galat DB) to sab kuch delete ho jata, isliye ruk jao
  if (ids.length === 0) {
    console.error('Is DB mein koi user nahi mila. Galat database ho sakta hai, isliye script band ki.');
    process.exit(1);
  }
  console.log(`Valid users: ${ids.length}`);

  // 1. deleted users ke posts/reels aur unse jude data
  const orphanPostIds = (await Post.find({ author: { $nin: ids } }).select('_id')).map((p) => p._id);
  await remove('comments on orphan posts', Comment, { post: { $in: orphanPostIds } });
  await remove('notifications of orphan posts', Notification, { post: { $in: orphanPostIds } });
  await remove('orphan posts/reels', Post, { _id: { $in: orphanPostIds } });

  // 2. deleted users ke comments, stories, notifications
  await remove('comments by deleted users', Comment, { author: { $nin: ids } });
  await remove('stories', Story, { author: { $nin: ids } });
  await remove('notifications', Notification, {
    $or: [{ recipient: { $nin: ids } }, { actor: { $nin: ids } }],
  });

  // 3. chats jisme koi deleted user tha
  const badConvoIds = (
    await Conversation.find({ participants: { $elemMatch: { $nin: ids } } }).select('_id')
  ).map((c) => c._id);
  await remove('messages in orphan chats', Message, { conversation: { $in: badConvoIds } });
  await remove('messages by deleted users', Message, { sender: { $nin: ids } });
  await remove('orphan conversations', Conversation, { _id: { $in: badConvoIds } });

  // 4. arrays se stale ids hatao (followers count isi se sahi hoga)
  await pull('users (followers/following)', User, {
    followers: { $nin: ids },
    following: { $nin: ids },
  });
  await pull('posts (likes/savedBy)', Post, {
    likes: { $nin: ids },
    savedBy: { $nin: ids },
  });
  await pull('stories (viewers)', Story, { viewers: { $nin: ids } });

  // 5. commentsCount dobara sahi karo
  if (!DRY) {
    const posts = await Post.find().select('_id');
    for (const p of posts) {
      await Post.updateOne({ _id: p._id }, { commentsCount: await Comment.countDocuments({ post: p._id }) });
    }
    console.log(`recounted commentsCount for ${posts.length} posts`);
  }

  console.log(DRY ? 'Dry run complete. Kuch delete nahi hua.' : 'Cleanup done.');
  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});