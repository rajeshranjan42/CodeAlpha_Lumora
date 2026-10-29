const mongoose = require('mongoose');

const storySchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    media: { type: String, required: true },
    mediaType: { type: String, enum: ['image', 'video'], required: true },
    caption: { type: String, default: '', trim: true, maxlength: 200 },
    music: { type: { id: String, title: String, artist: String, cover: String, url: String }, default: undefined, _id: false },
    trimStart: { type: Number, default: 0 },
    trimEnd: { type: Number, default: 0 },
    viewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Story', storySchema);