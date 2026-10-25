const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // For encrypted messages `text` is base64 ciphertext and `iv` the AES-GCM nonce.
    text: { type: String, required: true, trim: true, maxlength: 4000 },
    iv: { type: String, default: '' },
    encrypted: { type: Boolean, default: false },
    seen: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);