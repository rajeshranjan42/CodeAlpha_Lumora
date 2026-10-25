const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    caption: { type: String, default: '', trim: true, maxlength: 1000 },
    image: { type: String, default: '' },
    video: { type: String, default: '' },
    // 'reel' posts are short videos shown on the Reels page (older docs have no kind = 'post')
    kind: { type: String, enum: ['post', 'reel'], default: 'post', index: true },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    commentsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

postSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);