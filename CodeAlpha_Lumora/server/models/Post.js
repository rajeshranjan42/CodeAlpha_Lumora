const mongoose = require('mongoose');

// a song from the music library, attached to a post / story / reel
const musicSchema = new mongoose.Schema(
  { id: String, title: String, artist: String, cover: String, url: String },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    caption: { type: String, default: '', trim: true, maxlength: 1000 },
    image: { type: String, default: '' }, // first photo (kept for older code / thumbnails)
    images: [{ type: String }], // every photo of a multi-photo post, in order
    music: { type: musicSchema, default: undefined },
    trimStart: { type: Number, default: 0 }, // reels: play only [trimStart, trimEnd] seconds (0/0 = whole video)
    trimEnd: { type: Number, default: 0 },
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
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